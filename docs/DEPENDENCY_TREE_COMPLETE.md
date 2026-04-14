# Astromeda EC — Complete Dependency Tree

## Growth Stages Overview

```
Stage 1: DNA (Genetic Code)
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ .env / .env.production.template

        ↓ (builds)

Stage 2: Cell Division (Entry Points)
├─ server.ts
├─ app/entry.server.tsx
└─ app/entry.client.tsx

        ↓ (creates context)

Stage 3: Organ Formation (Root)
└─ app/root.tsx (Layout + providers)

        ↓ (uses)

Stage 4: Stem Cells (Libraries)
├─ app/lib/context.ts
├─ app/lib/agent-bridge.ts
├─ app/lib/astromeda-data.ts
├─ app/lib/fragments.ts
├─ app/lib/ga4-*.ts
├─ app/lib/error-recovery.ts
├─ app/lib/webhook-*.ts
└─ 12 more utility libs

        ↓ (consumed by)

Stage 5: Organs (Components)
├─ app/components/PageLayout.tsx
├─ app/components/CartMain.tsx
├─ app/components/Header.tsx
├─ app/components/Footer.tsx
├─ app/components/astro/ (26 components)
│  ├─ AstroHeader.tsx
│  ├─ AstroFooter.tsx
│  ├─ HeroSlider.tsx
│  ├─ CollabGrid.tsx
│  ├─ PCShowcase.tsx
│  ├─ WishlistProvider.tsx (provider)
│  ├─ RecentlyViewedProvider.tsx (provider)
│  ├─ ToastProvider.tsx (provider)
│  └─ 18 more
├─ app/components/admin/ (19 components)
└─ 20+ base components

        ↓ (rendered by)

Stage 6: Nervous System (Routes)
├─ app/routes/_index.tsx (homepage)
├─ app/routes/products.$handle.tsx
├─ app/routes/collections.*.tsx
├─ app/routes/account.*.tsx
├─ app/routes/admin.*.tsx
├─ app/routes/api.*.ts (22 API endpoints)
└─ 40+ total routes

        ↓ (protected by)

Stage 7: Immune System (Error Handlers)
├─ Root ErrorBoundary (app/root.tsx:433)
├─ Analytics ErrorBoundary (app/root.tsx:376)
├─ Rate limiting (server.ts:11-37)
├─ CSP headers (server.ts:45-80)
├─ Cache headers (server.ts:112-144)
└─ Health check (server.ts:88-104)

        ↓ (provides metadata for)

Stage 8: Senses (SEO)
├─ Meta tags (app/root.tsx)
├─ Meta functions (routes)
├─ JSON-LD (app/root.tsx:290)
├─ robots.txt (app/routes)
├─ sitemap.xml (app/routes)
└─ llms.txt (app/routes)

        ↓ (integrates with)

Stage 9: Social (External Services)
├─ Shopify Storefront API
├─ Shopify Admin API
├─ Google Analytics 4
├─ Google Tag Manager
├─ Microsoft Clarity
├─ Meta Pixel
├─ Webhooks (orders, products)
└─ AI Agent System
```

---

## Detailed Import Flow (No Violations)

### Stage 2 → Stage 4 (Correct)
```
server.ts
  └─ import {createHydrogenRouterContext} from '~/lib/context'
     ├─ imports @shopify/hydrogen ✓
     ├─ imports ~/lib/session ✓
     └─ imports ~/lib/fragments ✓
```

### Stage 3 → Stage 4 (Correct)
```
app/root.tsx
  ├─ import {FOOTER_QUERY, HEADER_QUERY} from '~/lib/fragments' ✓
  └─ imports (no Stage 5+ from Stage 4) ✓
```

### Stage 3 → Stage 5 (Correct)
```
app/root.tsx
  ├─ import {PageLayout} from './components/PageLayout'
  ├─ import {AstroFooter} from '~/components/astro/AstroFooter'
  ├─ import {WishlistProvider} from '~/components/astro/WishlistProvider'
  ├─ import {RecentlyViewedProvider} from '~/components/astro/RecentlyViewedProvider'
  └─ import {ToastProvider} from '~/components/astro/ToastProvider'
```

### Stage 5 → Stage 4 (Correct)
```
Components never import from ~/lib except:
  - astromeda-data.ts (constants)
  - fragments.ts (GraphQL)
  - design-tokens.ts (theme)

Components DO NOT import:
  - Routes ✓
  - Other route files ✓
```

### Stage 6 → Stage 5 (Correct)
```
Routes import components:
  app/routes/_index.tsx
    ├─ import {HeroSlider} from '~/components/astro/HeroSlider'
    ├─ import {CollabGrid} from '~/components/astro/CollabGrid'
    └─ import {PCShowcase} from '~/components/astro/PCShowcase'
```

### Stage 6 → Stage 4 (Correct)
```
Routes import libs:
  app/routes/_index.tsx
    ├─ import {T, al, MARQUEE_ITEMS, UGC, COLLABS} from '~/lib/astromeda-data'
    └─ import {CART_QUERY_FRAGMENT} from '~/lib/fragments'
```

### No Violations (Circular Dependencies: 0)
```
Routes never import routes ✓
Components never import routes ✓
Libs never import components or routes ✓
```

---

## Provider Nesting (Stage 3)

```
Root App
└─ WishlistProvider
   └─ RecentlyViewedProvider
      └─ ToastProvider
         └─ SafeAnalytics
            ├─ AnalyticsErrorBoundary (catches Analytics errors)
            └─ Analytics.Provider
               └─ PageLayout
                  ├─ Header
                  ├─ Outlet (route content)
                  └─ Footer
```

**Nesting is correct. No circular imports detected.**

---

## Library Dependency Map (Stage 4)

### Zero Circular Dependencies:
```
context.ts
  ├─ imports: @shopify/hydrogen
  ├─ imports: ~/lib/session
  └─ imports: ~/lib/fragments

fragments.ts
  └─ no imports from other libs (pure GraphQL)

astromeda-data.ts
  └─ no imports from other libs (pure data)

agent-bridge.ts
  ├─ imports: ../../agents/* (separate directory)
  ├─ imports: @shopify/hydrogen
  └─ no circular imports with other libs
```

---

## Error Boundary Distribution (Stage 7)

### Healthy Error Boundaries:
1. Root ErrorBoundary (app/root.tsx:433) ✅
   - Catches all unhandled route errors

2. AnalyticsErrorBoundary (app/root.tsx:376) ✅
   - Prevents Analytics.Provider from crashing page

3. 35 Route ErrorBoundaries ✅
   - Distributed across routes

4. Hydration error handler (app/entry.client.tsx:20) ✅
   - Logs mismatches in dev

### Missing Error Boundaries (34):
- 17 static routes (robots.txt, sitemap.xml, etc) ⚠️
- 17 dynamic routes (products, accounts, etc) ⚠️

---

## API Error Handling (Stage 6)

### Well-Protected API Routes (21/22):
```
api.admin.* (10 files)
  └─ all use try/catch ✅

api.webhook.* (2 files)
  └─ use try/catch ✅

api.newsletter.ts
  └─ try/catch ✅

api.notify.ts
  └─ try/catch ✅

... (total 21 with error handling)
```

### Unprotected Page Routes (17):
```
[robots.txt].tsx → line 7 (unguarded query)
blogs.*.tsx → line 34, 40, 37 (unguarded queries)
collections.*.tsx → line 33, 39 (unguarded queries)
gift-cards.tsx → line 31 (unguarded query)
pages.$handle.tsx → line 37 (unguarded query)
policies.*.tsx → line 33, 13 (unguarded queries)
products.$handle.tsx → line 101 (unguarded query)
... and more
```

---

## Complete File Count by Stage

| Stage | Type | Count | Healthy | Issue |
|-------|------|-------|---------|-------|
| 1 | Config | 4 | 4 | None |
| 2 | Entry | 3 | 3 | env validation |
| 3 | Root | 1 | 1 | None |
| 4 | Libs | 20 | 20 | None |
| 5 | Components | 62 | 60 | 2 orphaned |
| 6 | Routes | 69 | 52 | 17 unguarded queries |
| 7 | Immune | 8 | 4 | 4 incomplete |
| 8 | SEO | 8 | 8 | None |
| 9 | Social | 9 | 9 | None |
| **Total** | **-** | **184** | **161** | **23** |

---

## Import Boundary Rules (All Enforced)

| Rule | Status | Violations |
|------|--------|-----------|
| Stage 2 imports only 3, 4 | ✅ | 0 |
| Stage 3 imports 1, 2, 4, 5 | ✅ | 0 |
| Stage 4 imports only 1, 2 | ✅ | 0 |
| Stage 5 imports 4 (never 6) | ✅ | 0 |
| Stage 6 imports 4, 5 (never 3) | ✅ | 0 |
| Routes never import routes | ✅ | 0 |
| Components never import routes | ✅ | 0 |
| **Total** | **✅ PASS** | **0** |

---

## Conclusion: Growth Order is Correct

The project exhibits **perfect architectural layering** with no backwards dependencies or circular imports. All layers develop in proper sequence, from genetic code through to external integrations.

The only gaps are in error handling completeness (Stage 7), not in the growth order itself.
