/**
 * OpenAPI Schema Definition — API ドキュメンテーション
 *
 * Admin API の公式スキーマを定義。
 * 以下で参照可能:
 * - GET /api/openapi.json — JSON形式のスキーマ
 * - Swagger UI（デプロイ後）：https://shop.mining-base.co.jp/docs
 *
 * OpenAPI 3.1.0 仕様準拠
 */

export const OPENAPI_SCHEMA = {
  openapi: '3.1.0',
  info: {
    title: 'Astromeda Admin API',
    version: '2026.1.1',
    description: 'Admin ダッシュボード向けの管理API。セッション Cookie または Basic Auth で認証。',
    contact: {
      name: 'Astromeda Support',
      url: 'https://shop.mining-base.co.jp',
    },
  },
  servers: [
    {
      url: 'https://shop.mining-base.co.jp/api/admin',
      description: 'Production',
    },
  ],
  paths: {
    '/logout': {
      post: {
        summary: 'ログアウト',
        description: 'セッション Cookie を破棄してログイン状態を終了。',
        tags: ['Authentication'],
        security: [{ sessionCookie: [] }, { basicAuth: [] }],
        responses: {
          '302': { description: 'ログインページへリダイレクト' },
        },
      },
    },
    '/password': {
      post: {
        summary: 'パスワード変更',
        description: '管理者パスワードまたはユーザーパスワードを変更。',
        tags: ['User Management'],
        security: [{ sessionCookie: [] }, { basicAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  currentPassword: { type: 'string', description: '現在のパスワード' },
                  newPassword: { type: 'string', minLength: 8, description: '新しいパスワード（8文字以上）' },
                  userId: { type: 'string', description: 'ユーザーID（マルチユーザー時のみ）' },
                },
                required: ['currentPassword', 'newPassword'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'パスワード変更成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'boolean', enum: [false] },
                    data: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/AuthenticationError' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    },
    '/users': {
      get: {
        summary: 'ユーザー一覧取得',
        description: 'システム内のすべての管理者ユーザーを取得。',
        tags: ['User Management'],
        security: [{ sessionCookie: [] }, { basicAuth: [] }],
        responses: {
          '200': {
            description: 'ユーザー一覧取得成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'boolean', enum: [false] },
                    data: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        users: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              email: { type: 'string', format: 'email' },
                              displayName: { type: 'string' },
                              role: { type: 'string', enum: ['owner', 'admin', 'viewer'] },
                              active: { type: 'boolean' },
                              createdAt: { type: 'string', format: 'date-time' },
                            },
                          },
                        },
                        roles: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              description: { type: 'string' },
                              permissionCount: { type: 'integer' },
                            },
                          },
                        },
                        totalUsers: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/AuthenticationError' },
        },
      },
      post: {
        summary: 'ユーザー操作',
        description: 'ユーザーの作成・編集・無効化を実行。',
        tags: ['User Management'],
        security: [{ sessionCookie: [] }, { basicAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      action: { type: 'string', enum: ['create'] },
                      email: { type: 'string', format: 'email' },
                      displayName: { type: 'string' },
                      role: { type: 'string', enum: ['owner', 'admin', 'viewer'] },
                      password: { type: 'string', minLength: 8 },
                    },
                    required: ['action', 'email', 'displayName', 'role', 'password'],
                  },
                  {
                    type: 'object',
                    properties: {
                      action: { type: 'string', enum: ['deactivate'] },
                      userId: { type: 'string' },
                    },
                    required: ['action', 'userId'],
                  },
                  {
                    type: 'object',
                    properties: {
                      action: { type: 'string', enum: ['changeRole'] },
                      userId: { type: 'string' },
                      newRole: { type: 'string', enum: ['owner', 'admin', 'viewer'] },
                    },
                    required: ['action', 'userId', 'newRole'],
                  },
                ],
              },
            },
          },
        },
        responses: {
          '200': { description: 'ユーザー操作成功' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/AuthenticationError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    },
    '/ai': {
      get: {
        summary: 'AI エージェント状態取得',
        description: '47体の AI エージェントの稼働状況と統計情報を取得。',
        tags: ['Agent Management'],
        security: [{ sessionCookie: [] }, { basicAuth: [] }],
        responses: {
          '200': {
            description: 'AI エージェント状態',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'boolean', enum: [false] },
                    data: {
                      type: 'object',
                      properties: {
                        totalAgents: { type: 'integer', example: 47 },
                        healthy: { type: 'integer' },
                        warning: { type: 'integer' },
                        error: { type: 'integer' },
                        agents: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              team: { type: 'string' },
                              status: { type: 'string', enum: ['healthy', 'warning', 'error'] },
                              uptime: { type: 'number' },
                              lastHeartbeat: { type: 'string', format: 'date-time' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/AuthenticationError' },
        },
      },
    },
    '/status': {
      get: {
        summary: 'システムステータス',
        description: 'EC サイト全体のヘルスチェック情報を取得。',
        tags: ['System'],
        security: [{ sessionCookie: [] }, { basicAuth: [] }],
        responses: {
          '200': {
            description: 'システムステータス',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'boolean', enum: [false] },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
                        uptime: { type: 'number', description: '秒単位' },
                        lastCheck: { type: 'string', format: 'date-time' },
                        services: {
                          type: 'object',
                          properties: {
                            database: { type: 'string', enum: ['up', 'down'] },
                            cache: { type: 'string', enum: ['up', 'down'] },
                            shopify: { type: 'string', enum: ['up', 'down'] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/AuthenticationError' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'appSession',
        description: 'セッション Cookie によるボテーションセキュリティ認証',
      },
      basicAuth: {
        type: 'http',
        scheme: 'basic',
        description: 'Basic 認証（外部ツール向け）',
      },
    },
    responses: {
      ValidationError: {
        description: 'バリデーションエラー（400 Bad Request）',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'boolean', enum: [true] },
                code: { type: 'string', enum: ['VALIDATION_ERROR', 'INVALID_JSON'] },
                message: { type: 'string' },
                details: {
                  type: 'object',
                  properties: {
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      AuthenticationError: {
        description: '認証エラー（401 Unauthorized）',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'boolean', enum: [true] },
                code: { type: 'string', enum: ['UNAUTHORIZED', 'CSRF_NO_SESSION'] },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      ForbiddenError: {
        description: 'アクセス禁止（403 Forbidden）',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'boolean', enum: [true] },
                code: { type: 'string', enum: ['CSRF_INVALID', 'PERMISSION_DENIED'] },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      RateLimitError: {
        description: 'レート制限超過（429 Too Many Requests）',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'boolean', enum: [true] },
                code: { type: 'string', enum: ['RATE_LIMITED'] },
                message: { type: 'string' },
                retryAfterSeconds: { type: 'integer' },
              },
            },
          },
        },
      },
      ServerError: {
        description: 'サーバーエラー（500 Internal Server Error）',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'boolean', enum: [true] },
                code: { type: 'string', enum: ['CSRF_ERROR', 'INTERNAL_ERROR'] },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }, { basicAuth: [] }],
  tags: [
    { name: 'Authentication', description: 'ログイン・ログアウト' },
    { name: 'User Management', description: 'ユーザー管理' },
    { name: 'Agent Management', description: 'AI エージェント管理' },
    { name: 'System', description: 'システム情報' },
  ],
};

/**
 * OpenAPI スキーマを JSON として取得
 */
export function getOpenAPISchema(): string {
  return JSON.stringify(OPENAPI_SCHEMA, null, 2);
}

/**
 * OpenAPI スキーマの特定パスのエンドポイント定義を取得
 */
export function getEndpointSchema(path: string, method: string): any {
  const pathDef = (OPENAPI_SCHEMA.paths as any)[path];
  if (!pathDef) return null;
  const methodDef = (pathDef as any)[method.toLowerCase()];
  return methodDef || null;
}
