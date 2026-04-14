# Astromeda EC Site — "Cell to Adult" Growth Order Audit

## Executive Summary

The Astromeda EC site has a **well-architected foundation** (Stages 1-4) but exhibits **critical gaps in the immune system** (Stage 7) that could allow silent failures. The growth order is fundamentally sound—no later stages are imported by earlier stages—but error handling is incomplete, creating potential for "organ failure without symptoms."

**Risk Level: MEDIUM** (affects error visibility, not core functionality)

---

## Detailed Stage Analysis

### Stage 1: DNA/Fertilization ✅ HEALTHY

**Files:**
- `package.json` — Dependencies declared correctly
- `tsconfig.json` — Paths alias correct: `~/*` → `app/*`
- `vite.config.ts` — Plugins in correct order (hydrogen, oxygen, reactRouter, tailwind)
- `.env` + `.env.production.template` — All critical vars documented

**Status:** Perfect. No growth order violations. All upstream dependencies declared.

---

### Stage 2: Cell Division ✅ MOSTLY HEALTHY

**Files:**
- `server.ts` — Oxygen worker entry point (264 lines)
- `app/entry.server.tsx` — SSR renderer
- `app/entry.client.tsx` — Client hydrator

**Healthy cells:**
- ✅ `server.ts` imports only `~/lib/context` (correct Stage 4 dependency)
- ✅ Rate limiting layer (immune system)
- ✅ CSP nonce generation
- ✅ Cache headers management
- ✅ Health check endpoint (`/api/health`)
- ✅ Agent system async warmup via `waitUntil()` (non-blocking)
- ✅ Error boundary wrapping entire response (line 252-261)

**Issues detected:**
- ⚠️ `env` variables not validated before use in `hydrogenContext` creation
  - `PUBLIC_STOREFRONT_ID`, `PUBLIC_STOREFRONT_API_TOKEN` not checked
  - `SESSION_SECRET` validated only in `context.ts`, not in `server.ts`
  - If missing, error occurs after request processing starts, not at boot
  - **Severity:** Low (error still caught, but harder to diagnose)

**Verdict:** Mostly healthy. env validation should move to `server.ts` line 173 (before `createHydrogenRouterContext` call).

---

### Stage 3: Organ Formation (Root Layout) ✅ HEALTHY

**File:** `app/root.tsx` (458 lines)

**Healthy features:**
- ✅ `Layout` component properly wraps all children
- ✅ Error boundary: `AnalyticsErrorBoundary` catches Analytics crashes
- ✅ Provider nesting correct (no circular imports):
  ```
  WishlistProvider
    └─ RecentlyViewedProvider
       └─ ToastProvider
          └─ SafeAnalytics (ErrorBoundary + Analytics.Provider)
             └─ PageLayout
                └─ Outlet
  ```
- ✅ CSP nonce from Hydrogen
- ✅ Meta tags for SEO
- ✅ JSON-LD structured data (Organization schema)
- ✅ Analytics: GTM, GA4, Clarity, Meta Pixel
- ✅ UTM parameter capture to sessionStorage
- ✅ Skip-to-main accessibility link
- ✅ Service Worker registration (optional, silent fail)
- ✅ `shouldRevalidate` optimization (prevents unnecessary root refetch)

**No violations detected.**

---

### Stage 4: Stem Cells (Shared Libraries) ✅ HEALTHY

**20 files:** `agent-bridge.ts`, `astromeda-data.ts`, `context.ts`, `fragments.ts`, `ga4-ecommerce.ts`, etc.

**Healthy patterns:**
- ✅ No circular dependencies (checked: lib → lib imports are linear)
- ✅ No imports from components or routes (correct boundary)
- ✅ `context.ts` validates `SESSION_SECRET` (line 33-35)
- ✅ `astromeda-data.ts` pure data & utility functions
- ✅ `agent-bridge.ts` proper lazy initialization with fallback
- ✅ `fragments.ts` GraphQL queries only

**No violations detected.**

---

### Stage 5: Organs (Components) ✅ HEALTHY

**62 component files:**
- Base components: `PageLayout`, `Aside`, `CartMain`, `CartSummary`, etc.
- Product components: `ProductItem`, `ProductImage`, `ProductPrice`, etc.
- Admin components: 19 files
- Astro components: 26 files (providers, content, layout, interactive)

**Healthy patterns:**
- ✅ No route imports (components never import routes)
- ✅ Providers properly isolated: `WishlistProvider`, `RecentlyViewedProvider`, `ToastProvider`
- ✅ No circular component imports
- ✅ Error recovery in cart components (CartLineItem, CartSummary have try/catch)

**Issues detected:**
- ⚠️ **2 orphaned components** (defined but never imported):
  - `MockShopNotice.tsx` — 0 references
  - `ProductForm.tsx` — Actually 3 refs found (false positive in search)
  - **Severity:** Very Low (unused code, not a runtime issue)

- ⚠️ `CartLineItem.tsx` & `CartSummary.tsx` have try/catch blocks but **not wrapped in ErrorBoundary**
  - If JSON parsing fails, error propagates silently to parent
  - **Severity:** Low (parent PageLayout would catch via root ErrorBoundary)

**Verdict:** Healthy. Orphaned components should be removed or used.

---

### Stage 6: Nervous System (Routes & Data Flow) ⚠️ PARTIALLY HEALTHY

**69 route files:** Page routes, API routes, admin routes

**Growth order check:**
- ✅ Routes never import other routes (no circular data flows)
- ✅ Routes correctly import from components and lib

**Critical issues detected:**

#### Issue 1: 17 Unguarded Shopify API Queries

**Routes with `storefront.query()` but NO try/catch or Promise.allSettled:**

```
app/routes/[robots.txt].tsx (line 7)
app/routes/blogs.$blogHandle.$articleHandle.tsx (line 34)
app/routes/blogs.$blogHandle._index.tsx (line 40)
app/routes/blogs._index.tsx (line 37)
app/routes/collections._index.tsx (line 33)
app/routes/collections.all.tsx (line 39)
app/routes/gift-cards.tsx (line 31)
app/routes/pages.$handle.tsx (line 37)
app/routes/policies.$handle.tsx (line 33)
app/routes/policies._index.tsx (line 13)
app/routes/products.$handle.tsx (line 101)
... and 6 more
```

**Impact:** If Shopify API is down, these routes return 500 error without logging. Root ErrorBoundary will catch, but no structured error response.

**Severity:** CRITICAL (affects user experience on API outage)

---

#### Issue 2: Missing ErrorBoundaries in 34 Routes (49%)

**Routes without `export function ErrorBoundary`:**

```
[llms.txt].tsx
[robots.txt].tsx
[sitemap.xml].tsx
account.$.tsx
account.tsx
account_.authorize.tsx
account_.login.tsx
account_.logout.tsx
admin.login.tsx
admin.tsx
admin.users.tsx
api.$version.[graphql.json].tsx
api.recommendations.tsx
cart.$lines.tsx
discount.$code.tsx
gift-cards.tsx
sitemap.$type.$page[.xml].tsx
... and more
```

**Impact:** These routes throw errors that bubble up to root ErrorBoundary. Works, but error context is lost (no route-specific handling).

**Severity:** MEDIUM (errors still caught globally, but less granular)

---

#### Issue 3: Async Loaders Without Error Handling (20 routes)

**Routes calling async operations without try/catch:**

```
$.tsx
[llms.txt].tsx
[robots.txt].tsx
account._index.tsx
account.orders.$id.tsx
... and ~15 more
```

**Example (gift-cards.tsx:31):**
```typescript
const {products} = await storefront.query(GIFT_CARDS_QUERY);
// If query fails, loader throws unhandled error
```

**Impact:** Loader throws → React Router catches → root ErrorBoundary renders generic error page.

**Severity:** MEDIUM (fallback works, but could be handled more gracefully)

---

### Stage 7: Immune System ⚠️ GAPS DETECTED

**Rate Limiting:** ✅ Yes (server.ts lines 11-37)
- 120 req/min for pages
- 30 req/min for APIs
- Auto-pruning to prevent memory leak

**CSP Headers:** ✅ Yes (server.ts lines 45-80)
- Blocks inline scripts (except nonce)
- Allows: googletagmanager, facebook, clarity, shopify CDN
- `frame-ancestors 'none'` (prevents clickjacking)

**HSTS:** ✅ Yes (server.ts line 67)
- 31 days max-age

**X-Frame-Options:** ✅ Yes (server.ts line 63)
- DENY (iframe protection)

**Root ErrorBoundary:** ✅ Yes (app/root.tsx line 433)
- Catches all root errors
- Returns styled 500 page with error message

**Route ErrorBoundaries:** ⚠️ Only 35/69 (51%)
- Critical routes like `_index`, `products.$handle` MISSING ErrorBoundary

**Analytics ErrorBoundary:** ✅ Yes (app/root.tsx line 376)
- Prevents Analytics crashes from crashing page

**Hydration Error Handler:** ✅ Yes (app/entry.client.tsx line 20)
- `onRecoverableError` logs mismatches in dev

---

### Critical Gap: Missing Global Unhandled Rejection Handler

**Issue:** No `addEventListener('unhandledrejection')` anywhere.

**Where it should be:** `app/entry.client.tsx` or `app/root.tsx`

**Impact:** If a Promise rejects without `.catch()`:
```typescript
// Example
fetch('/api/something')
  .then(r => r.json())
  // No .catch() — if network fails, console error but page doesn't crash
```

**Severity:** LOW-MEDIUM (pages stay up, but errors logged only to console)

---

### Stage 8: Senses (SEO & Accessibility) ✅ HEALTHY

**Implemented:**
- ✅ Meta tags in root (title, description, theme-color, viewport)
- ✅ Meta function in `_index.tsx` (dynamic OGP)
- ✅ JSON-LD Organization schema
- ✅ Canonical links
- ✅ Skip-to-main accessibility link (keyboard nav)
- ✅ `robots.txt` route
- ✅ `sitemap.xml` route
- ✅ `llms.txt` route (AI crawler opt-in)

**No violations.**

---

### Stage 9: Social (External Integrations) ✅ HEALTHY

**Implemented:**
- ✅ Shopify Storefront API (via Hydrogen)
- ✅ Shopify Admin API (via agent-bridge)
- ✅ GA4 event tracking (createContentSecurityPolicy)
- ✅ GTM container injection
- ✅ Clarity (session recording)
- ✅ Meta Pixel (conversion tracking)
- ✅ Newsletter signup endpoint
- ✅ Webhook handlers (orders, products)
- ✅ AI Agent system (agent-bridge warmUp)

**No violations.**

---

## Summary of Violations

| Violation | Location | Severity | Count | Impact |
|-----------|----------|----------|-------|--------|
| **Unguarded Shopify API queries** | Routes (multiple files) | CRITICAL | 17 | API timeout → 500 error, no structured handling |
| **Missing ErrorBoundaries** | 34 routes | MEDIUM | 34 | Errors bubble to root, less granular handling |
| **Async loaders without try/catch** | 20 routes | MEDIUM | 20 | Loader throw → generic error page |
| **Missing global rejection handler** | app/entry.client.tsx | LOW | 1 | Unhandled Promise rejections logged to console only |
| **Env validation at boot** | server.ts | LOW | 3 vars | Errors occur after request processing starts |
| **Components with try/catch, no EB** | 2 components | LOW | 2 | Errors propagate to parent (caught by root EB) |
| **Orphaned components** | app/components | TRIVIAL | 2 | Dead code (no runtime impact) |

---

## No Growth Order Violations Detected ✅

**Birth Defects Check:**
- ✅ No Stage 3+ imports from Stage 2 entry points ✓
- ✅ No Stage 5+ imports from Stage 4 libs ✓
- ✅ No Stage 6+ imports from Stage 3-4 ✓
- ✅ Routes never import routes ✓
- ✅ Components never import routes ✓
- ✅ Libs never import components or routes ✓

**Conclusion:** The growth order is **correct**. All layers develop in proper sequence.

---

## Recommendations (Priority Order)

### Priority 1: CRITICAL (Production Risk)
1. **Wrap all Shopify API queries in try/catch or Promise.allSettled**
   - Files: 17 route files listed above
   - Add `.catch()` to each `storefront.query()`
   - Return graceful error response (or null data + errorState)

### Priority 2: HIGH (Developer Experience)
2. **Add ErrorBoundary to 34 critical routes**
   - Especially: `_index.tsx`, `products.$handle.tsx`, `account.*` routes
   - Use `RouteErrorBoundary` component from `~/components/astro/RouteErrorBoundary.tsx`

3. **Add global unhandled rejection handler**
   - In `app/entry.client.tsx`, add:
   ```typescript
   window.addEventListener('unhandledrejection', (event) => {
     console.error('[Astromeda] Unhandled Promise rejection:', event.reason);
   });
   ```

### Priority 3: MEDIUM (Operational Clarity)
4. **Validate env vars at boot in server.ts**
   - Before `createHydrogenRouterContext` call (line 213)
   - Validate: `SESSION_SECRET`, `PUBLIC_STOREFRONT_ID`, `PUBLIC_STOREFRONT_API_TOKEN`

5. **Add structured error logging**
   - Create `~/lib/error-logger.ts` to log to external service (Sentry, DataDog)
   - Call from root ErrorBoundary and route loaders

### Priority 4: LOW (Code Hygiene)
6. **Remove orphaned components**
   - Delete `MockShopNotice.tsx` (0 refs)
   - Confirm `ProductForm.tsx` actually used (search result inconsistency)

---

## Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Stage 1 Health | 4/4 components | 4/4 | ✅ |
| Stage 2 Health | 3/3 components | 3/3 | ✅ |
| Stage 3 Health | 1/1 component | 1/1 | ✅ |
| Stage 4 Health | 20/20 libs | 20/20 | ✅ |
| Stage 5 Health | 60/62 components | 62/62 | ⚠️ 2 orphaned |
| Stage 6 Health | 52/69 routes | 69/69 | ⚠️ Missing error handling |
| Stage 7 Health | 4/8 subsystems | 8/8 | ⚠️ ErrorBoundaries incomplete, no global handler |
| Stage 8 Health | 8/8 features | 8/8 | ✅ |
| Stage 9 Health | 9/9 integrations | 9/9 | ✅ |

---

## Conclusion

The Astromeda EC site exhibits **solid architectural maturity** with proper growth order and no circular dependencies. The foundation is strong.

However, the **immune system has gaps**: error handling is incomplete, especially around Shopify API calls and route-level error boundaries. These gaps create risk of silent failures during API outages or network issues.

**Overall Assessment: READY FOR PRODUCTION with Priority 1 fixes applied.**

Recommended actions:
1. Fix 17 critical Shopify API queries (Priority 1)
2. Add ErrorBoundary to 34 routes (Priority 2)
3. Add global rejection handler (Priority 2)

After these fixes, the site will have comprehensive error coverage equivalent to a production-grade e-commerce platform.
