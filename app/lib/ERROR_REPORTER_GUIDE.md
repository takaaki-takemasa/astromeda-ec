# Error Reporter Guide

## Overview

Lightweight client-side error monitoring system for Astromeda EC site. Captures unhandled errors, promise rejections, and manual error reports. No external dependencies required.

## Architecture

### Components

1. **`/app/lib/error-reporter.ts`** (Client-side)
   - Captures global errors and unhandled promise rejections
   - Batches errors (max 10 per batch)
   - Deduplicates by error message
   - Rate limits: max 50 reports per session
   - Flushes every 30 seconds or on page unload
   - Uses navigator.sendBeacon + fetch fallback

2. **`/app/routes/api.error-report.ts`** (Server-side)
   - POST endpoint for receiving error reports
   - Rate limits by IP: max 20 reports per minute
   - Validates JSON and required fields
   - Logs structured errors to console
   - Returns 200 OK (never fails the client)

3. **`/app/entry.client.tsx`** (Integration)
   - Calls `initErrorReporter()` after hydration

## Usage

### Automatic Error Capture

All unhandled errors and promise rejections are automatically captured:

```javascript
// These are captured automatically:

// 1. Uncaught error
throw new Error('Something broke');

// 2. Unhandled promise rejection
Promise.reject(new Error('Promise failed'));

// 3. Async/await error
async function example() {
  throw new Error('Async failed');
}
```

### Manual Error Reporting

Use `reportError()` to manually report errors with context:

```typescript
import { reportError } from '~/lib/error-reporter';

try {
  // some code
} catch (error) {
  if (error instanceof Error) {
    reportError(error, {
      feature: 'checkout',
      action: 'payment-processing',
      severity: 'high',
    });
  }
}
```

### React Components

Wrap components with error boundaries to catch and report errors:

```typescript
import { reportError } from '~/lib/error-reporter';

class ComponentErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    reportError(error, {
      component: this.props.name,
      errorInfo: JSON.stringify(errorInfo),
    });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong</div>;
    }
    return this.props.children;
  }
}
```

## Error Report Format

Each error report includes:

```json
{
  "message": "Error message",
  "stack": "Error stack trace (first 500 chars)",
  "url": "https://shop.mining-base.co.jp/products/gaming-pc",
  "timestamp": "2026-04-08T10:30:45.123Z",
  "userAgent": "Mozilla/5.0...",
  "context": {
    "feature": "checkout",
    "severity": "high"
  }
}
```

Server receives as array:

```json
[
  { "message": "Error 1", "stack": "...", "url": "...", ... },
  { "message": "Error 2", "stack": "...", "url": "...", ... }
]
```

Server logs structured format:

```json
{
  "timestamp": "2026-04-08T10:30:45.123Z",
  "message": "Error message",
  "stack": "...",
  "url": "https://...",
  "userAgent": "...",
  "ip": "203.0.113.42",
  "context": { ... }
}
```

## Configuration

### Limits

Located in `/app/lib/error-reporter.ts`:

```typescript
const MAX_REPORTS_PER_SESSION = 50;        // Max errors per session
const MAX_ERRORS_PER_BATCH = 10;           // Errors per flush
const FLUSH_INTERVAL_MS = 30000;           // Flush every 30s
const MAX_STACK_LENGTH = 500;              // Stack trace truncation
```

Server-side (`/app/routes/api.error-report.ts`):

```typescript
// IP rate limit: 20 errors per 60 seconds
// Method: POST only (405 for other methods)
// Response: Always 200 OK (never fails client)
```

## Testing

### Development

In development mode (`NODE_ENV=development`), errors are logged to console:

```javascript
import { initErrorReporter, reportError } from '~/lib/error-reporter';

initErrorReporter();

// Test manual reporting
reportError(new Error('Test error'), { test: 'true' });

// Test unhandled error
setTimeout(() => {
  throw new Error('Unhandled test error');
}, 1000);
```

### Monitoring Dashboard

To view errors in production, check:
1. **Cloudflare Tail Workers** — view real-time logs
2. **Application Logs** — structured JSON logs
3. **Sentry Integration** — if connected (not included in Phase 1)

### Local Testing

```bash
# Build the project
npm run build

# Start dev server
npm run dev

# Open browser console and run:
# import { reportError } from '~/lib/error-reporter';
# reportError(new Error('Test'));
```

## Future Enhancements

1. **Sentry Integration** — For full error tracking UI
2. **Datadog/New Relic** — Production log aggregation
3. **Slack Notifications** — Alert on critical errors
4. **Error Recovery** — Auto-retry failed requests
5. **Session Recording** — Combine with analytics for context
6. **Source Maps** — Minified error stack trace unwinding

## Production Checklist

- [x] Client-side error capture (unhandled errors, promise rejections)
- [x] Server-side error logging endpoint
- [x] Rate limiting (client: 50/session, server: 20/min per IP)
- [x] Deduplication by error message
- [x] Batching + periodic flush
- [x] Page unload flush (sendBeacon)
- [x] TypeScript strict mode
- [x] No external dependencies
- [ ] Connect to log aggregation service
- [ ] Add Slack/email alerts for critical errors
- [ ] Implement error analysis dashboard
- [ ] Add source maps for production builds

## Notes

- **No external dependencies** — Uses only native browser APIs and Node.js
- **Lightweight** — Error reporter: 6.2 KB, API endpoint: 4.9 KB
- **Async** — Non-blocking error reporting via navigator.sendBeacon
- **Production-ready** — Rate limiting, deduplication, structured logging
- **Browser compatible** — Works with modern browsers that support sendBeacon and fetch

## Related Files

- `/app/entry.client.tsx` — Error reporter initialization
- `/app/lib/error-reporter.ts` — Client-side error capture
- `/app/routes/api.error-report.ts` — Server-side error endpoint
