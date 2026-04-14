# API Middleware Integration Guide

## Overview

The new API middleware system provides composable security layers for admin API endpoints:
- **CSRF Protection** — Token-based validation (1-hour expiry)
- **Rate Limiting** — Per-IP request throttling
- **Authentication** — Session Cookie + Basic Auth
- **Input Validation** — Zod schema enforcement

## Files Created

### Core Implementations
- `agents/core/csrf-guard.ts` — CSRF token generation & validation (crypto.subtle, Edge-compatible)
- `agents/core/api-middleware.ts` — Reusable middleware + standard error/success response formatting
- `agents/lib/openapi-schema.ts` — OpenAPI 3.1.0 schema documentation

### Tests
- `agents/core/__tests__/csrf-guard.test.ts` — 21 CSRF guard tests (all passing)
- `agents/core/__tests__/api-middleware.test.ts` — 20 middleware tests (all passing)

**Test Results: 1311/1311 tests passing ✅**

---

## Usage Examples

### Example 1: Simple Protected Endpoint (with Auth + RateLimit)

```typescript
// app/routes/api.admin.example.ts
import { withAuth, withRateLimit, apiError, apiSuccess } from '../../agents/core/api-middleware.js';

async function handler({ request, context }: { request: Request; context: any }) {
  try {
    const body = await request.json();
    // Process request...
    return apiSuccess({ message: 'Success' });
  } catch (error) {
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}

export const action = withRateLimit(withAuth(handler), 'api');
```

### Example 2: Protected Endpoint with Middleware Composition

```typescript
import { pipe, withAuth, withCSRF, withRateLimit } from '../../agents/core/api-middleware.js';

async function handler({ request, context }: { request: Request; context: any }) {
  // Only POST/PUT/DELETE reach here (GET skips CSRF)
  return apiSuccess({ updated: true });
}

// Apply all security layers: Auth → CSRF → RateLimit
export const action = pipe(
  withAuth,
  withCSRF,
  withRateLimit
)(handler);
```

### Example 3: CSRF Token Generation (Dashboard Use)

```typescript
// In your Next.js/React component
import { generateCSRFToken } from '../../agents/core/csrf-guard.js';

async function getCSRFToken(sessionId: string): Promise<string> {
  const token = await generateCSRFToken(sessionId, process.env.ADMIN_PASSWORD || '');
  return token;
}

// When sending form:
const token = await getCSRFToken(sessionId);
const response = await fetch('/api/admin/example', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token, // Required for POST/PUT/DELETE
  },
  body: JSON.stringify({ /* ... */ }),
});
```

### Example 4: Error Response Format

All API errors follow the standard format:

```typescript
apiError('CSRF_INVALID', 'CSRFトークンが無効です', 403);
// Returns:
// {
//   error: true,
//   code: 'CSRF_INVALID',
//   message: 'CSRFトークンが無効です',
//   details?: unknown
// }
```

Success response format:

```typescript
apiSuccess({ userId: '123', name: 'Admin' }, 200);
// Returns:
// {
//   error: false,
//   data: { userId: '123', name: 'Admin' }
// }
```

---

## Middleware Behavior

### withCSRF
- **Skips**: GET, HEAD, OPTIONS (idempotent operations)
- **Checks**: X-CSRF-Token header for POST/PUT/DELETE/PATCH
- **Validation**: HMAC-SHA256 signature + 1-hour expiry
- **Failure**: 403 Forbidden

### withRateLimit
- **Profile**: 'login' (5/15min), 'api' (60/min), 'approval' (30/min)
- **Key**: Client IP (CF-Connecting-IP, X-Forwarded-For, X-Real-IP)
- **Failure**: 429 Too Many Requests with Retry-After header

### withAuth
- **Primary**: Session Cookie (sessionCookie set by `/api/admin/login`)
- **Fallback**: Basic Auth (admin:ADMIN_PASSWORD)
- **Failure**: 401 Unauthorized

---

## Security Considerations

1. **CSRF Tokens**
   - Generated per session, not per request
   - 1-hour expiry prevents long-lived token reuse
   - Timing-safe HMAC comparison (constant-time)
   - Stored in X-CSRF-Token header or form field

2. **Rate Limiting**
   - Per-IP limiting (blocks distributed attacks)
   - Auto-cleanup of expired entries (every 60 seconds)
   - Memory-safe: max 10,000 entries before eviction

3. **Password Hashing**
   - Timing-safe comparison (prevents timing attacks)
   - 8-character minimum enforced
   - Salt via HMAC-SHA256

4. **Error Responses**
   - No sensitive information leaked
   - Standard format for client-side parsing
   - Always JSON with Content-Type header

---

## Testing

Run tests:
```bash
npm test -- csrf-guard.test.ts api-middleware.test.ts
```

All 41 tests passing ✅

Key test coverage:
- ✅ CSRF token generation with different session IDs
- ✅ CSRF token expiry (1 hour)
- ✅ Timing-safe HMAC comparison
- ✅ Rate limit enforcement and cleanup
- ✅ Middleware composition order
- ✅ Standard error/success response format
- ✅ Edge cases (long IDs, special characters, etc.)

---

## Integration Checklist

- [ ] Update existing admin API routes to use middleware
- [ ] Generate CSRF tokens in dashboard forms
- [ ] Add X-CSRF-Token to fetch requests
- [ ] Document API in OpenAPI schema (already done)
- [ ] Test CSRF flow end-to-end
- [ ] Monitor rate limit metrics
- [ ] Add API versioning prefix (/api/v1/admin/...)

---

## Next Steps (T024-T028)

1. **T024**: Apply middleware to all admin API routes
2. **T025**: ✅ Standard error format implemented
3. **T026**: CSRF integration in dashboard
4. **T027**: API versioning router (/api/v1/admin/...)
5. **T028**: ✅ OpenAPI schema complete

---

## References

- OpenAPI Schema: `agents/lib/openapi-schema.ts`
- CSRF Implementation: `agents/core/csrf-guard.ts` (HMAC-SHA256, Edge-compatible)
- Middleware: `agents/core/api-middleware.ts` (pipe-composable)
- Tests: `agents/core/__tests__/{csrf-guard,api-middleware}.test.ts`
