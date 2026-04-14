/**
 * 監査ログ テスト — H-004
 */
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {
  auditLog,
  securityLog,
  getAuditLog,
  getAuditLogByAction,
  clearAuditLog,
} from '../audit-log';

beforeEach(() => {
  clearAuditLog();
  vi.restoreAllMocks();
});

describe('Audit Log (H-004)', () => {
  it('ログエントリを記録・取得できる', () => {
    auditLog({
      action: 'login',
      role: 'owner',
      resource: 'auth',
      success: true,
    });

    const logs = getAuditLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('login');
    expect(logs[0].role).toBe('owner');
    expect(logs[0].timestamp).toBeDefined();
  });

  it('タイムスタンプがISO 8601形式', () => {
    auditLog({action: 'api_access', role: 'admin', resource: 'test', success: true});
    const logs = getAuditLog();
    expect(logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('FIFOで最大1000件を保持', () => {
    for (let i = 0; i < 1005; i++) {
      auditLog({action: 'api_access', role: 'viewer', resource: `r${i}`, success: true});
    }
    const logs = getAuditLog(2000);
    expect(logs.length).toBe(1000);
    // 最古の5件が削除されている
    expect(logs[0].resource).toBe('r5');
  });

  it('limitで取得件数を制限', () => {
    for (let i = 0; i < 10; i++) {
      auditLog({action: 'api_access', role: 'admin', resource: `r${i}`, success: true});
    }
    expect(getAuditLog(3)).toHaveLength(3);
    // 最新3件が返る
    expect(getAuditLog(3)[0].resource).toBe('r7');
  });

  it('アクションでフィルタ取得', () => {
    auditLog({action: 'login', role: 'owner', resource: 'auth', success: true});
    auditLog({action: 'api_access', role: 'admin', resource: 'status', success: true});
    auditLog({action: 'login_failed', role: null, resource: 'auth', success: false});
    auditLog({action: 'login', role: 'editor', resource: 'auth', success: true});

    const loginLogs = getAuditLogByAction('login');
    expect(loginLogs).toHaveLength(2);
    expect(loginLogs.every((l) => l.action === 'login')).toBe(true);
  });

  it('securityLogは success=false で記録', () => {
    securityLog('login_failed', 'Invalid password', '192.168.1.100');
    const logs = getAuditLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].success).toBe(false);
    expect(logs[0].action).toBe('login_failed');
    expect(logs[0].role).toBeNull();
  });

  it('IPアドレスがマスクされる', () => {
    securityLog('access_denied', 'Forbidden', '192.168.1.100');
    const logs = getAuditLog();
    expect(logs[0].ip).toBe('192.168.1.***');
  });

  it('detail が記録される', () => {
    auditLog({
      action: 'agent_control',
      role: 'admin',
      resource: 'agents/seo-optimizer',
      detail: 'エージェント再起動',
      success: true,
    });
    expect(getAuditLog()[0].detail).toBe('エージェント再起動');
  });

  it('clearAuditLog でバッファをクリア', () => {
    auditLog({action: 'login', role: 'owner', resource: 'auth', success: true});
    expect(getAuditLog()).toHaveLength(1);
    clearAuditLog();
    expect(getAuditLog()).toHaveLength(0);
  });
});
