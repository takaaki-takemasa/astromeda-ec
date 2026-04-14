# Astromeda Growth Order Audit — Detailed Violations

## Critical: 17 Unguarded Shopify API Queries

These files call `storefront.query()` without try/catch or Promise.allSettled:

### File 1: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/[robots.txt].tsx`
- Line 7: `const {shop} = await context.storefront.query(ROBOTS_QUERY);`
- Missing: try/catch wrapper

### File 2: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/blogs.$blogHandle.$articleHandle.tsx`
- Line 34: `context.storefront.query(ARTICLE_QUERY, {`
- Missing: error handling

### File 3: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/blogs.$blogHandle._index.tsx`
- Line 40: `context.storefront.query(BLOGS_QUERY, {`
- Missing: error handling

### File 4: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/blogs._index.tsx`
- Line 37: `context.storefront.query(BLOGS_QUERY, {`
- Missing: error handling

### File 5: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/collections._index.tsx`
- Line 33: `context.storefront.query(COLLECTIONS_QUERY, {`
- Missing: error handling

### File 6: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/collections.all.tsx`
- Line 39: `storefront.query(CATALOG_QUERY, {`
- Missing: error handling

### File 7: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/gift-cards.tsx`
- Line 31: `const {products} = await storefront.query(GIFT_CARDS_QUERY);`
- Missing: try/catch

### File 8: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/pages.$handle.tsx`
- Line 37: `context.storefront.query(PAGE_QUERY, {`
- Missing: error handling

### File 9: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/policies.$handle.tsx`
- Line 33: `const data = await context.storefront.query(POLICY_CONTENT_QUERY, {`
- Missing: try/catch

### File 10: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/policies._index.tsx`
- Line 13: `const data: PoliciesQuery = await context.storefront.query(POLICIES_QUERY);`
- Missing: try/catch

### File 11: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/products.$handle.tsx`
- Line 101: `storefront.query(PRODUCT_QUERY, {`
- Missing: error handling

### Files 12-17: Additional routes (6 more with same pattern)
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/search.tsx`
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/cart.tsx`
- And 5 others with unguarded queries

---

## Medium: 34 Routes Missing ErrorBoundary

### Routes without ErrorBoundary export:

1. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/[llms.txt].tsx`
2. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/[robots.txt].tsx`
3. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/[sitemap.xml].tsx`
4. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/account.$.tsx`
5. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/account.tsx`
6. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/account_.authorize.tsx`
7. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/account_.login.tsx`
8. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/account_.logout.tsx`
9. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/admin.login.tsx`
10. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/admin.tsx`
11. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/admin.users.tsx`
12. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/api.$version.[graphql.json].tsx`
13. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/api.recommendations.tsx`
14. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/cart.$lines.tsx`
15. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/discount.$code.tsx`
16. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/gift-cards.tsx`
17. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/sitemap.$type.$page[.xml].tsx`
... and 17 more

### Most critical (user-facing):
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/_index.tsx` (homepage)
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/products.$handle.tsx` (product pages)
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/routes/account.orders._index.tsx` (order history)

---

## Low: Missing Global Unhandled Rejection Handler

**File:** `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/entry.client.tsx`

**Issue:** No event listener for unhandled Promise rejections

**What should be added (after line 28):**
```typescript
// Global unhandled rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Astromeda] Unhandled Promise rejection:', event.reason);
  // Optionally send to error tracking service (Sentry, etc)
});
```

---

## Low: Env Validation at Boot

**File:** `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/server.ts`

**Issue:** Critical env vars not validated before `createHydrogenRouterContext` (line 213)

**What should be added (at line 174, before context creation):**
```typescript
// Validate required env vars at boot
const requiredEnvVars = [
  'SESSION_SECRET',
  'PUBLIC_STOREFRONT_ID',
  'PUBLIC_STOREFRONT_API_TOKEN',
];
for (const envVar of requiredEnvVars) {
  if (!env[envVar]) {
    console.error(`Missing required env var: ${envVar}`);
    return new Response('Server configuration error', {status: 500});
  }
}
```

---

## Low: Components with try/catch but No ErrorBoundary

### File 1: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/components/CartLineItem.tsx`
- Line 180: try/catch block
- Issue: If error caught, component renders nothing silently
- Fix: Wrap component usage in ErrorBoundary or handle error state

### File 2: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/components/CartSummary.tsx`
- Line 48: try/catch block
- Issue: Same as CartLineItem
- Fix: Ensure parent has ErrorBoundary

---

## Trivial: Orphaned Components (0 imports)

### File 1: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/components/MockShopNotice.tsx`
- Status: Never imported anywhere
- Action: Delete or mark for future use

### File 2: `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/components/ProductForm.tsx`
- Status: 3 refs found (check if actually used)
- Action: Verify usage; consider deprecation if unused

---

## SUMMARY OF FILE LOCATIONS

### Critical Files to Fix:
1. 17 routes with unguarded Shopify queries (listed above)
2. 34 routes missing ErrorBoundary (listed above)

### High Priority Files to Check:
1. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/server.ts` (env validation)
2. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/entry.client.tsx` (rejection handler)
3. `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/root.tsx` (root error boundary)

### Library Files (All Healthy):
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/lib/context.ts` ✅
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/lib/agent-bridge.ts` ✅
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/lib/astromeda-data.ts` ✅

### Component Files (Mostly Healthy):
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/components/astro/` (26 files) ✅
- `/sessions/nifty-festive-ramanujan/mnt/astromeda-ec/app/components/admin/` (19 files) ✅
- 2 orphaned files to clean up
