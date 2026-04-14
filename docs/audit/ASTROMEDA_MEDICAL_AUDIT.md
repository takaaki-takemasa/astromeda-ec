# ASTROMEDA EC — Medical Audit Report
## Comprehensive System Maturation Analysis (DNA → Adult)

**Audit Date:** 2026-04-05
**Project:** Astromeda EC (Shopify Hydrogen + React Router 7 + Oxygen)
**Methodology:** Organ-by-organ developmental analysis; maturation order defect detection

---

## EXECUTIVE SUMMARY

The Astromeda EC system has reached **Phase 1B completion** with strong foundational architecture but exhibits **3 CRITICAL maturation order defects** and **5 WARNING-level issues** that must be resolved before Phase 2 deployment.

**Overall MATURATION GRADE: C+**

### Key Findings
- **DNA Layer (Config):** HEALTHY ✓
- **Skeletal System (Routes):** WARNING — missing imports + type declaration gaps
- **Circulatory System (API):** HEALTHY ✓
- **Nervous System (Agent Bus):** WARNING — vitest dependency missing
- **Immune System (Security):** HEALTHY ✓
- **Reproductive System (Revenue Features):** CRITICAL — CartUpsell not integrated
- **Sensory System (SEO/Analytics):** WARNING — GA4 measurement ID missing from environment

---

## SYSTEM ORGAN EXAMINATION

### 1. DNA LAYER (Configuration) — HEALTHY

**Status:** ✓ HEALTHY

#### Files Verified
- `.env` (environment variables)
- `vite.config.ts` (Vite build config)
- `app/lib/context.ts` (Hydrogen context)
- `server.ts` (Oxygen worker entry point)
- `app/entry.server.tsx` and `app/entry.client.tsx` (SSR/hydration)
- `package.json` (dependency definitions)

#### Findings
✓ All required env vars present (Storefront API tokens, Session Secret, Admin Password)
✓ Vite configuration includes all necessary plugins (hydrogen, oxygen, reactRouter, tailwindcss)
✓ i18n properly set to JA-JP (context.ts line 51)
✓ Oxygen entry point correctly implements serverless handler pattern
✓ CSP (Content Security Policy) configured for shop.mining-base.co.jp
✓ Manifest.json properly configured for PWA (Japanese language, theme colors)

**No issues found.**

---

### 2. SKELETAL SYSTEM (Routes & Navigation) — WARNING

**Status:** ⚠️ WARNING

#### Route Inventory (37 routes verified)

| Route | Status | Notes |
|-------|--------|-------|
| `_index.tsx` | ✓ | Home page with IP Collections |
| `products.$handle.tsx` | ⚠️ | Product detail + revenue features (has issues) |
| `cart.tsx` | ✓ | Cart management |
| `account/*` | ✓ | Customer account (7 sub-routes) |
| `collections/*` | ✓ | Collections & filtering |
| `faq.tsx` | ✓ | FAQ with Schema.org FAQPage |
| `gift-cards.tsx` | ✓ | Gift card purchases |
| `wishlist.tsx` | ✓ | Wishlist display |
| `api.newsletter.ts` | ✓ | Newsletter signup (Storefront API) |
| `api.notify.ts` | ✓ | Back-in-stock/price-drop notifications |
| `admin.tsx` | ✓ | Admin authentication gate |
| `admin._index.tsx` | 🔴 | **TYPE MISMATCH in loader return** |
| `api.admin.status.ts` | 🔴 | **Missing import declaration** |
| Sitemap/Robots/Canonical | ✓ | SEO support |

#### CRITICAL ISSUE #1: Missing Module Declaration Chain
**File:** `app/routes/admin._index.tsx`
**Line:** 132-133
**Problem:**
```typescript
const { getAdminStatus, getAgentList, getPipelineList, isInitializedFlag } = await import(
  '../../lib/agent-bridge.js'
);
```
**Root Cause:** Dynamic import of `agent-bridge.js` — TypeScript cannot resolve `.js` extension in build phase.
**Maturation Order Defect:** The admin dashboard is being built BEFORE the agent-bridge module is properly type-declared.

**Verification Error:**
```
error TS2307: Cannot find module '../../lib/agent-bridge.js' or its corresponding type declarations.
error TS2739: Type 'DataWithResponseInit<...>' is missing the following properties: metrics, agents, pipelines, isLive
```

**Similarly Affected:**
- `app/routes/api.admin.status.ts` line 79 (same import path issue)

#### CRITICAL ISSUE #2: CartUpsell Component Not Integrated
**File:** `app/routes/products.$handle.tsx`
**Lines:** 1-32 (imports)
**Problem:** CartUpsell component is imported but NOT used in the product page JSX.

**Import exists:**
```typescript
import {CartUpsell} from '~/components/astro/CartUpsell';
```

**But no usage** in the render (0 matches for `<CartUpsell` in products.$handle.tsx)

**Maturation Order Defect:** CartUpsell was built as a revenue feature component but never wired into the page flow.

#### CRITICAL ISSUE #3: CartForm Style Prop Invalid
**File:** `app/routes/products.$handle.tsx`
**Line:** 585
**Problem:**
```
error TS2322: Property 'style' does not exist on type 'CartFormProps'
```

The CartForm component does not accept inline `style` props; styling must be applied to wrapper elements.

**Impact:** Type errors prevent build completion in strict mode.

---

### 3. CIRCULATORY SYSTEM (Data Flow) — HEALTHY

**Status:** ✓ HEALTHY

#### Verified Components

##### API Routes (GraphQL Mutations)
**api.newsletter.ts** ✓
- Implements `customerCreate` mutation with `acceptsMarketing: true`
- Input validation: email format check (regex)
- Error handling: TAKEN code detection (already exists)
- Fallback message handling
- ✓ No XSS vectors (string-only mutation inputs)

**api.notify.ts** ✓
- Implements back-in-stock + price-drop notification
- Dual trigger support via form radio buttons
- Tags system: `notify:${notifyType}:${productHandle}`
- Error handling matches newsletter pattern
- Note: Acknowledges limitation that existing customer tag updates require Admin API

##### Storefront API Queries
**_index.tsx** (IP Collections query) ✓
- Parallel fetch of IP collections + PC color collections
- Proper null/error handling with fallbacks
- 250-item batch fetch from collections API

**products.$handle.tsx** ✓
- Product query with selected options
- Adjacent variant fetching
- Image data properly accessed via `selectedVariant.image`

**No maturation order defects detected.**

---

### 4. NERVOUS SYSTEM (Agent Bus) — WARNING

**Status:** ⚠️ WARNING (Construction phase; incomplete)

#### Files Verified
- `agents/core/agent-bus.ts` — ✓ Event pub/sub system intact
- `agents/core/types.ts` — ✓ Type definitions complete
- `agents/registration/agent-registration.ts` — ✓ Initialization logic sound
- `agents/pipelines/pipeline-definitions.ts` — ✓ 6 pipeline definitions (P01-P06)
- `agents/pipelines/pipeline-engine.ts` — ✓ Execution engine with retry logic

#### ISSUE #1: Missing vitest Dependency
**Files Affected:**
- `agents/integration/__tests__/full-integration.test.ts` line 8
- `agents/pipelines/__tests__/pipeline-engine.test.ts` line 6
- `agents/registration/__tests__/agent-registration.test.ts` line 11
- `agents/tests/phase0.test.ts` — entire file
- `agents/tests/phase1b-l2agents.test.ts` line 12

**Problem:** Test files import `vitest` but package.json does NOT include vitest as a dev dependency.

```
error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
```

**Maturation Order Defect:** Test suite is written before the test framework dependency is declared. This breaks Phase 1B test verification.

#### ISSUE #2: Test Assertion Logic Errors
**File:** `agents/tests/phase0.test.ts`

Lines 112, 118, 179, 353:
```typescript
error TS2367: This comparison appears to be unintentional because the types 'false' and 'true' have no overlap.
```

**Root Cause:** Tests comparing invariant boolean literals (always `false === true` or vice versa). These are placeholder assertions that never execute.

**Impact:** Tests fail type checking; cannot verify agent initialization actually works.

#### Agent Bus Architecture
✓ Security hooks attached (attachSecurityCheck)
✓ Feedback hooks for neural plasticity
✓ Priority ordering system (critical > high > normal > low)
✓ Dead-letter queue for failed events
✓ Event logging for audit trail

**No implementation defects in core bus logic.**

---

### 5. IMMUNE SYSTEM (Security & Auth) — HEALTHY

**Status:** ✓ HEALTHY

#### Admin Authentication
**File:** `app/routes/admin.tsx` (lines 18-68)

✓ Basic Auth header validation
✓ Timing-safe comparison comment indicates future hardening
✓ Credential decoding with error handling
✓ 401/403 responses with WWW-Authenticate headers
✓ ADMIN_PASSWORD environment variable enforcement
✓ Safe side: missing password disables admin entirely (line 23)

**File:** `app/routes/api.admin.status.ts` (lines 48-76)

✓ Identical Auth protection on API endpoint
✓ Cache-Control headers prevent caching of sensitive data

#### API Input Validation
**api.newsletter.ts** (lines 18-23)
```typescript
if (!email) return {success: false, error: '...'};
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {success: false, ...};
```
✓ Regex validation (note: not RFC 5322 compliant but reasonable for practical use)

**api.notify.ts** (lines 23-29)
```typescript
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {...};
if (!productHandle) return {...};
```
✓ Validates both email and product handle

#### XSS Protection
**dangerouslySetInnerHTML usage:** 9 locations found

| File | Line | Content | Status |
|------|------|---------|--------|
| `root.tsx` | 172, 184 | GA4 script, Org Schema.org JSON-LD | ✓ Static trusted content |
| `products.$handle.tsx` | 315 | `descriptionHtml` from Shopify API | ✓ Shopify CDN origin |
| `products.$handle.tsx` | 351, 387 | Product JSON-LD Schema | ✓ Server-generated safe data |
| `collections.$handle.tsx` | 582 | Collection description | ✓ Shopify API source |
| `faq.tsx` | 348 | FAQ HTML render | ✓ Hard-coded content |
| `pages.$handle.tsx` | 65 | Page body from CMS | ⚠️ Should sanitize |
| `policies.$handle.tsx` | 56 | Policy body from CMS | ⚠️ Should sanitize |
| `blogs.$blogHandle.$articleHandle.tsx` | 90 | Article content | ⚠️ Should sanitize |

**Recommendation:** For CMS-sourced content (pages, policies, blog articles), add DOMPurify sanitization layer before rendering.

#### SecurityGuard Implementation
**File:** `agents/core/security-guard.ts` (lines 23-90)

✓ 3-layer defense system:
  1. Structure validation (input shape)
  2. Rate limiting (100 req/sec default)
  3. Anomaly detection
  4. Blocklist checking

✓ Fully operational with anomaly logging

**No critical security defects.**

---

### 6. REPRODUCTIVE SYSTEM (Revenue Features) — CRITICAL

**Status:** 🔴 CRITICAL DEFECT

The system has **10 planned revenue features**, of which **8 are implemented** but **1 is missing integration** and **1 has structural issues**.

#### Revenue Feature Inventory

| Feature | Component | Status | Location |
|---------|-----------|--------|----------|
| 1. Wishlist | WishlistProvider/WishlistButton | ✓ Complete | `app/components/astro/Wishlist*` |
| 2. Recently Viewed | RecentlyViewedProvider/RecentlyViewed | ✓ Complete | `app/components/astro/RecentlyViewed*` |
| 3. Cross-Sell | CrossSell | ✓ Integrated | `products.$handle.tsx:321` |
| 4. Back-in-Stock Notify | BackInStockNotify | ✓ Integrated | `products.$handle.tsx:641` |
| 5. Shipping Estimate | ShippingEstimate | ✓ Integrated | `products.$handle.tsx:649` |
| 6. Newsletter Signup | NewsletterSignup | ✓ Integrated | `app/components/astro/AstroFooter.tsx` |
| 7. **Cart Upsell** | CartUpsell | 🔴 **NOT INTEGRATED** | Imported but unused |
| 8. Gift Cards | GiftCard page | ✓ Complete | `app/routes/gift-cards.tsx` |
| 9. Wishlist Page | Wishlist page | ✓ Complete | `app/routes/wishlist.tsx` |
| 10. FAQ | FAQ page | ✓ Complete | `app/routes/faq.tsx` |

#### CRITICAL DEFECT #1: CartUpsell Not Integrated
**File:** `app/routes/products.$handle.tsx`

**Evidence:**
```typescript
import {CartUpsell} from '~/components/astro/CartUpsell';  // line 31 (imported)
// ...but NO usage in JSX render tree
```

**Expected Location:** In the product page after "Add to Cart" button or in cart page itself.

**Current State of CartUpsell Component** (`app/components/astro/CartUpsell.tsx`):
- ✓ Component exists and is syntactically correct
- ✓ Accepts cartLines as props
- ✓ Uses useEffect to simulate recommendations
- ✓ Static sample products (demo data)
- ⚠️ **No real Shopify API call** (fetching recommendations from Product API)

**Maturation Order Defect:** Component built → imported → forgotten to integrate into page.

**Fix Required:**
1. Wire CartUpsell into cart.tsx OR cart-preview component
2. Actually call Shopify Product API or Recommendations API to fetch related products
3. Remove static sample data

#### CRITICAL DEFECT #2: CartForm Style Prop Error
**File:** `app/routes/products.$handle.tsx` (line 585)

**Code:**
```typescript
<CartForm
  route="/cart"
  inputs={{...}}
  action={CartForm.ACTIONS.LinesAdd}
  style={{...}}  // ← INVALID PROP
>
```

**Error:**
```
error TS2322: Property 'style' does not exist on type 'CartFormProps'
```

**Root Cause:** CartForm is Shopify Hydrogen's form wrapper, which does not accept DOM style props directly.

**Fix:** Wrap CartForm in a div with style instead:
```typescript
<div style={{...}}>
  <CartForm
    route="/cart"
    inputs={{...}}
    action={CartForm.ACTIONS.LinesAdd}
  >
    {/* children */}
  </CartForm>
</div>
```

#### Provider Wrapping — CORRECT ✓
**File:** `app/root.tsx` (lines 269-281)

```typescript
<WishlistProvider>
  <RecentlyViewedProvider>
    <SafeAnalytics ...>
      <PageLayout>
        <Outlet />
      </PageLayout>
    </SafeAnalytics>
  </RecentlyViewedProvider>
</WishlistProvider>
```

✓ Proper nesting order ensures all children have access to both providers
✓ Context hooks will not throw "must be used within Provider" errors

---

### 7. SENSORY SYSTEM (SEO/Analytics) — WARNING

**Status:** ⚠️ WARNING

#### SEO Implementation

##### Schema.org JSON-LD
✓ **root.tsx** (lines 181-205):
- Organization schema (name, logo, description, brand)
- Parent organization (Mining Base Co., Ltd.)

✓ **products.$handle.tsx** (lines 348+):
- Product schema with price, availability, image, description
- Breadcrumb schema for navigation
- AggregateRating schema (structure ready for review data)

✓ **faq.tsx** (lines 348+):
- FAQPage schema with 20 Q&A items

✓ **gift-cards.tsx**, **collections.$handle.tsx**, **blogs.$handle.tsx**:
- Canonical tags present
- OG tags for social sharing
- Twitter Card support

✓ **Meta function compliance:**
- All routes implement Route.MetaFunction
- Descriptions optimized for display length

##### Analytics Implementation

**Issue: GA4 Measurement ID Missing**
**File:** `app/root.tsx` (lines 168-179)

```typescript
{/* Google Analytics 4 + GTM — GA_MEASUREMENT_IDは環境変数から取得 */}
<script
  nonce={nonce}
  dangerouslySetInnerHTML={{
    __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
    `,
  }}
/>
```

**Problem:** The script initializes dataLayer but does NOT:
1. Call `gtag('config', 'G_MEASUREMENT_ID')` (actual GA4 initialization)
2. Read GA_MEASUREMENT_ID from env vars (currently hardcoded as comment)

**Maturation Order Defect:** Analytics structure built but parameter not wired from .env

**Current .env:** Contains no `GA_MEASUREMENT_ID` variable

**Impact:** Google Analytics tracking will NOT fire events; GA4 dashboard will show no data.

#### PWA Configuration
✓ **public/manifest.json** (full PWA support):
- Name, short_name, description (Japanese)
- Icons 192x192 and 512x512 (maskable)
- Display: standalone
- Theme color and background color aligned
- Categories: shopping, games

✓ **app/root.tsx** (lines 61-72):
- Font preloads (Orbitron, Outfit, Noto Sans JP)
- Manifest link
- Apple mobile web app meta tags

**No PWA defects.**

---

## MATURATION ORDER DEFECT ANALYSIS

### Defect Pattern: "Components Built Before Integration"

The system exhibits a recurring pattern where components are constructed and exported but not integrated into parent pages/layouts. This suggests the development proceeded in component-isolation mode rather than end-to-end feature completion.

**Examples:**
1. CartUpsell component exists but not used
2. Agent-bridge module exists but type declarations are missing
3. vitest tests written before vitest dependency added
4. GA4 parameter structure exists but measurement ID not configured

**Root Cause:** Likely result of parallel development where components are being built in isolation and integration is deferred.

**Manifestation in Human Development Analogy:**
- **Organs built but not connected to nervous system** (CartUpsell exists but not wired to UI flow)
- **Neural pathways created before neurotransmitters available** (Agent Bus ready but tests can't run)
- **Sensory equipment functional but not calibrated** (GA4 script present but not configured)

---

## TOP 5 CRITICAL ISSUES (Must Fix Before Phase 2)

### 🔴 ISSUE #1: CartUpsell Component Integration
**Severity:** CRITICAL
**Type:** Feature incompleteness
**File:** `app/routes/products.$handle.tsx`
**Fix Effort:** 2 hours
**Blocker:** Revenue feature non-functional

**Action Items:**
1. Remove unused CartUpsell import or integrate it into cart.tsx
2. If integrating, fetch real product recommendations via Shopify API
3. Remove static sample product data
4. Test end-to-end cart upsell flow

---

### 🔴 ISSUE #2: Type Declaration Chain Broken (agent-bridge.js)
**Severity:** CRITICAL
**Type:** Build failure (typecheck)
**Files:** `app/routes/admin._index.tsx` (line 132), `app/routes/api.admin.status.ts` (line 79)
**Fix Effort:** 1 hour
**Blocker:** Build cannot complete; admin dashboard non-functional

**Root Cause:** Dynamic import of `.js` file breaks TypeScript resolution in SSR context

**Action Items:**
1. Change import to `.ts` file (not `.js`):
   ```typescript
   const { ... } = await import('../../lib/agent-bridge.ts');
   ```
2. OR add type declaration file (`agent-bridge.d.ts`)
3. Run `npm run typecheck` to verify fix
4. Ensure both admin._index and api.admin.status are addressed

---

### 🔴 ISSUE #3: CartForm Style Prop Invalid
**Severity:** CRITICAL
**Type:** Type error (breaking build)
**File:** `app/routes/products.$handle.tsx` line 585
**Fix Effort:** 10 minutes
**Blocker:** Type checking fails

**Action Items:**
1. Move style prop from CartForm to wrapper div:
   ```typescript
   <div style={{...}}>
     <CartForm
       route="/cart"
       inputs={{...}}
       action={CartForm.ACTIONS.LinesAdd}
     >
       {/* children */}
     </CartForm>
   </div>
   ```
2. Verify TypeScript error resolves

---

### ⚠️ ISSUE #4: Missing vitest Dependency + Test Assertions
**Severity:** WARNING (Phase 1B blocker, Phase 2 blocker)
**Type:** Test infrastructure
**Files:** `agents/tests/*.test.ts`, `agents/*/.__tests__/*.test.ts`
**Fix Effort:** 3 hours
**Blocker:** Cannot run test verification; agent bus untested

**Action Items:**
1. Add vitest to devDependencies:
   ```bash
   npm install --save-dev vitest
   ```
2. Fix placeholder assertions in `agents/tests/phase0.test.ts`:
   - Replace `expect(false).toBe(true)` patterns with actual assertions
   - Verify agent initialization by checking returned state
3. Run full test suite: `npm run test` (after script is added to package.json)

---

### ⚠️ ISSUE #5: GA4 Measurement ID Not Configured
**Severity:** WARNING
**Type:** Analytics non-functional
**File:** `app/root.tsx` lines 168-179; `.env` (missing var)
**Fix Effort:** 30 minutes
**Blocker:** Analytics tracking will not work

**Action Items:**
1. Add to `.env`:
   ```
   PUBLIC_GA4_MEASUREMENT_ID=G_XXXXXXXXXX
   ```
2. Update root.tsx analytics script:
   ```typescript
   <script nonce={nonce} dangerouslySetInnerHTML={{__html: `
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', '${context.env.PUBLIC_GA4_MEASUREMENT_ID}');
   `}} />
   ```
3. Test GA4 event firing in Google Analytics admin console

---

## SUMMARY TABLE: All Issues by Severity

| Priority | Issue | File | Type | Status |
|----------|-------|------|------|--------|
| 🔴 CRITICAL | CartUpsell not integrated | `products.$handle.tsx` | Feature | BLOCKING |
| 🔴 CRITICAL | Type: agent-bridge.js unresolvable | `admin._index.tsx` | Build | BLOCKING |
| 🔴 CRITICAL | CartForm invalid style prop | `products.$handle.tsx` | Build | BLOCKING |
| ⚠️ WARNING | vitest missing + bad test assertions | `agents/tests/` | Test | BLOCKING |
| ⚠️ WARNING | GA4 measurement ID unconfigured | `root.tsx` / `.env` | Analytics | Partial |
| ℹ️ INFO | CMS content needs DOMPurify sanitization | `pages/$handle.tsx` | Security | Best practice |
| ℹ️ INFO | Timing-safe comparison not yet implemented | `admin.tsx:48` | Security | Future |

---

## MATURATION GRADE RATIONALE

### Grade Breakdown
- **DNA (Config):** A (Perfect)
- **Skeletal (Routes):** C (3 critical issues)
- **Circulatory (API):** A (Correct data flow)
- **Nervous (Agent Bus):** D (Tests can't run, missing dependency)
- **Immune (Security):** A (Solid auth, XSS mostly contained)
- **Reproductive (Revenue):** D (1 feature missing integration, 1 with type error)
- **Sensory (SEO/Analytics):** C (Schema good, GA4 not configured)

### Overall: C+
- **Strengths:** Solid architectural foundation, correct data patterns, security-conscious
- **Weaknesses:** Integration gaps, test infrastructure broken, analytics unconfigured
- **Readiness for Phase 2:** NOT READY — Must fix all 3 CRITICAL issues first

---

## RECOMMENDATIONS FOR NEXT PHASE

### Immediate (Before Phase 2 Kickoff)
1. **Fix critical type errors** (agent-bridge, CartForm style) — MANDATORY
2. **Integrate CartUpsell** — MANDATORY
3. **Add vitest and fix test assertions** — MANDATORY for QA verification
4. **Configure GA4** — MANDATORY for business metrics
5. **Sanitize CMS content** — RECOMMENDED security hardening

### Phase 2 Planning
- **Agent system readiness:** Verify all 13 agents initialize correctly (currently only 5 L2 agents tested in Phase 1B)
- **Pipeline execution:** Run P01-P06 pipelines in staging to verify Cascade Engine behavior
- **Load testing:** Verify Agent Bus doesn't bottleneck under concurrent requests
- **Extend admin dashboard:** Wire real agent metrics instead of mock data (currently fallback to mock)

### Phase 3+ Architecture
- **Timing-safe credential comparison** in Basic Auth (comment in code suggests future work)
- **OAuth/SSO migration** from Basic Auth (currently hardcoded)
- **Rate limiting per IP** instead of global (current SecurityGuard uses global window)
- **AI Security Auditor** (Phase 2B) — replace innate immunity with adaptive defense

---

## CONCLUSION

The Astromeda EC system exhibits **strong architectural maturity** with well-designed data flow, security consciousness, and comprehensive SEO support. However, it suffers from **integration incompleteness** — components exist but are not wired together, dependencies are missing, and configuration parameters are not populated.

**This is a classic "pieces manufactured, not assembled" scenario.**

All issues are **fixable within 6-8 hours** of focused work. Once resolved, the system will be **production-ready for Phase 2 (AI Agent System Integration)**.

**No structural rewrites needed.** All defects are surface-level integration and configuration issues, not architectural flaws.

---

**Report Generated:** 2026-04-05
**Auditor:** Claude Agent (Medical Analogy Framework)
**Next Review:** After Phase 1B completion (post-fixes)
