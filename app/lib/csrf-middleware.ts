/**
 * CSRF Middleware — Origin/Referer header based
 */

import { AppSession } from '~/lib/session';

export async function verifyCsrfForAdmin(
  request: Request,
  _env: Env,
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null;
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin) {
    if (origin === requestOrigin) return null;
  } else {
    const referer = request.headers.get('Referer');
    if (referer) {
      try {
        if (new URL(referer).origin === requestOrigin) return null;
      } catch { }
    }
  }

  return Response.json(
    {
      type: '/errors/csrf-validation',
      title: 'CSRF Validation Failed',
      status: 403,
      detail: 'Origin header mismatch',
      timestamp: new Date().toISOString(),
    },
    { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export async function applyCsrfRotation(
  request: Request,
  response: Response,
): Promise<Response> {
  return response;
}
