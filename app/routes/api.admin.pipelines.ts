/**
 * Admin API — パイプライン管理エンドポイント
 *
 * GET  /api/admin/pipelines          → パイプライン一覧 + ステータス取得
 * POST /api/admin/pipelines          → パイプライン手動実行
 *
 * P17 反射テスト: パイプラインの直接実行・監視API
 *
 * 医学メタファー: 反射弓テスト（膝蓋腱反射）
 * 刺激（リクエスト）→ 神経伝達（AgentBus）→ 筋収縮（Pipeline実行）→ 結果確認
 * このAPIで「反射が正常に機能するか」をテストできる
 */

import {data} from 'react-router';
import {PipelineActionSchema} from '~/lib/api-schemas';
import {requirePermission} from '~/lib/rbac';
import {auditLog} from '~/lib/audit-log';
import {AppSession} from '~/lib/session';
import {verifyCsrfForAdmin} from '~/lib/csrf-middleware';

interface PipelineDefinition {
  id: string;
  name: string;
  trigger?: string;
  steps?: unknown[];
  onFailure?: string;
}

export async function loader({request, context}: {request: Request; context: { env: Env }}) {
  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: pipelines.view permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'pipelines.view');
    auditLog({action: 'api_access', role, resource: 'api/admin/pipelines [GET]', success: true});
    const {getPipelineList, setBridgeEnv, isInitializedFlag} = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    const {ALL_PIPELINES, getPipelineDescription} = await import('../../agents/pipelines/pipeline-definitions.js');

    // PipelineEngineが持つ実行時ステータスと、定義データをマージ
    const runtimeList = getPipelineList();
    const runtimeMap = new Map(runtimeList.map(p => [p.id, p]));

    const pipelines = ALL_PIPELINES.map((def: PipelineDefinition) => {
      const runtime = runtimeMap.get(def.id);
      return {
        id: def.id,
        name: def.name,
        description: getPipelineDescription(def.id),
        trigger: def.trigger,
        stepCount: def.steps?.length || 0,
        onFailure: def.onFailure,
        status: runtime?.status || 'idle',
        lastRun: runtime?.lastRun || 0,
        successRate: runtime?.successRate || 0,
        runsToday: runtime?.runsToday || 0,
      };
    });

    return data({
      pipelines,
      total: pipelines.length,
      agentSystemInitialized: isInitializedFlag(),
      timestamp: Date.now(),
    }, {
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
    });
  } catch (error) {
    console.error('[pipelines API] Error:', error);
    return data({
      pipelines: [],
      total: 0,
      error: 'パイプライン情報の取得に失敗しました',
      timestamp: Date.now(),
    }, {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    });
  }
}

export async function action({request, context}: {request: Request; context: { env: Env }}) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env);
  if (!auth.authenticated) return auth.response;

  if (request.method !== 'POST') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  try {
    // RBAC: pipelines.execute permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'pipelines.execute');
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({error: 'Invalid JSON body'}, {status: 400});
    }

    const validation = PipelineActionSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({
        error: '入力値が無効です',
        details: validation.error.errors.map(e => e.message),
      }, {status: 400});
    }

    const {pipelineId, params} = validation.data;

    const {setBridgeEnv} = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);

    // パイプライン定義の存在確認
    const {getPipelineDefinition} = await import('../../agents/pipelines/pipeline-definitions.js');
    const def = getPipelineDefinition(pipelineId);
    if (!def) {
      return data({error: `Pipeline not found: ${pipelineId}`}, {status: 404});
    }

    // Agent Bridge経由でパイプライン実行
    const {executePipelineDirect} = await import('~/lib/agent-bridge');
    const result = await executePipelineDirect(pipelineId, params);

    auditLog({
      action: 'pipeline_execute',
      role,
      resource: pipelineId,
      detail: def.name,
      success: result.success,
    });

    return data({
      success: result.success,
      pipelineId,
      pipelineName: def.name,
      execution: result,
      executedAt: new Date().toISOString(),
    }, {
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
    });
  } catch (error) {
    console.error('[pipelines API] Action error:', error);
    return data({
      success: false,
      error: 'パイプライン実行中にエラーが発生しました',
      timestamp: Date.now(),
    }, {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    });
  }
}
