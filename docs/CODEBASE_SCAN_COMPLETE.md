# Astromeda EC Complete Codebase Scan

**Scan Date**: 2026-04-10  
**Project**: Astromeda Gaming PC E-Commerce Site  
**Technology**: Shopify Hydrogen 2026.1.1 + React Router 7 + TypeScript 5.9.2  
**Total TypeScript/TSX Files**: 351 (236 in /app, 118 in /agents, 17+ misc)

---

## CODEBASE STRUCTURE

### ROOT FILES
```
astromeda-ec/
├── package.json                    [39 dependencies, 21 devDependencies]
├── tsconfig.json                   [ES2022, strict mode, path aliases ~/*]
├── vite.config.ts                  [7 plugins: ensure-dist-dirs, sourceBundle, hydrogen, oxygen, reactRouter, tsconfigPaths, tailwindcss]
├── server.ts                       [Oxygen worker entry, rate limiting, health check, security headers, cache control]
├── CLAUDE.md                       [24KB project instructions & task list]
├── .graphqlrc.ts                   [GraphQL code generation config]
├── .env / .env.production.template [Shopify API credentials, environment setup]
└── [4 audit docs] + [5 surgery checkpoints] + [7 SEO optimization docs]
```

---

## APP DIRECTORY STRUCTURE (236 files)

### ENTRY POINTS
- **app/root.tsx** — React Router root layout (89-120+ lines read)
  - Exports: `RootLoader`, `shouldRevalidate`, `links()`, `loader()`, `HydrationBoundary`
  - Uses: `@shopify/hydrogen` Analytics, `react-router` outlet patterns
  - Provides: RootContext with storefront, customer, shop data

- **app/entry.client.tsx** — Hydration + Error Reporter (150+ lines)
  - Error recovery: initErrorReporter() with try/catch (M2-NEONATAL-01)
  - Cart interceptor: form submit → rebuild customization lines
  - SKU mapping cache (I-09 optimization)
  - Unhandled rejection listener

- **app/entry.server.tsx** — SSR + Security Headers (80+ lines)
  - renderToReadableStream with NonceProvider
  - CSP header generation (shop domain, CDN whitelisting)
  - Security headers: X-Content-Type-Options, Referrer-Policy, Permissions-Policy (payment=self), HSTS

### ROUTES (72 files)
#### Main Pages
- `_index.tsx` — Homepage (HeroSlider, CollabGrid, PCShowcase)
- `collections.$handle.tsx` — IP collection pages (26 collabs)
- `collections._index.tsx` — All collections view
- `products.$handle.tsx` — Product detail pages

#### Admin & Agents
- `admin._index.tsx` — Admin dashboard home
- `admin.agents.tsx` — Agent monitoring/control
- `admin.ai-monitor.tsx` — AI agent diagnostics
- `admin.login.tsx`, `admin.go-live.tsx`, `admin.checkout-test.tsx` — Utilities

#### API Routes (19 files)
- `api.health.ts` — Health check endpoint (23/23 agents ready indicator)
- `api.admin.ai.ts`, `.andon.ts`, `.approvals.ts`, `.campaigns.ts`, `.pipelines.ts` — Agent APIs
- `api.error-report.ts` — Client error logging (onRecoverableError stream)
- `api.predictive-search.tsx`, `api.recommendations.tsx` — Search/recommendations
- `api.webhook.orders.ts`, `.products.ts` — Shopify webhooks

#### Static Routes
- `[robots.txt].tsx`, `[sitemap.xml].tsx`, `[sitemap-static.xml].tsx`, `[llms.txt].tsx` — SEO
- `[feed.xml].tsx` — Product feed
- `faq.tsx`, `about.tsx`, `guides.*` (8 guides), `ranking.tsx`, `reviews.tsx`, `wishlist.tsx`

#### Auth & Account
- `account.tsx`, `account._index.tsx`, `account.profile.tsx`, `account.addresses.tsx`
- `account.orders._index.tsx`, `account.orders.$id.tsx`
- `account_.authorize.tsx`, `account_.login.tsx`, `account_.logout.tsx`

#### Other Routes
- `cart.tsx`, `cart.$lines.tsx` — Shopping cart
- `search.tsx` — Search results
- `discount.$code.tsx`, `gift-cards.tsx`
- `pages.$handle.tsx`, `policies.$handle.tsx` — CMS pages
- `blogs.$blogHandle._index.tsx`, `blogs.$blogHandle.$articleHandle.tsx`, `blogs._index.tsx`
- `setup.$color.tsx` — PC customization
- `$.tsx` — Catch-all 404

### COMPONENTS (82 files in /components)

#### Main Components (15 files)
```
components/
├── Header.tsx                 [Top navigation, mobile hamburger]
├── Footer.tsx                 [Footer with links, newsletter signup]
├── PageLayout.tsx             [Root layout wrapper]
├── Aside.tsx                  [Sidebar UI]
├── AddToCartButton.tsx        [Buy button with loading state]
├── CartLineItem.tsx           [Cart line item renderer]
├── CartMain.tsx               [Full cart view logic]
├── CartSummary.tsx            [Cart totals, checkout link]
├── ProductImage.tsx           [Image with loading + error handling]
├── ProductItem.tsx            [Product card renderer]
├── ProductPrice.tsx           [Price display with customization]
├── PaginatedResourceSection.tsx [Pagination logic]
├── SearchForm.tsx             [Simple search input]
├── SearchFormPredictive.tsx   [Predictive search form]
├── SearchResults.tsx          [Search results grid]
└── SearchResultsPredictive.tsx [Typeahead results dropdown]
```

#### Astro Components (54 files in /components/astro)
```
/astro/ — Brand-specific UI components
├── AstroHeader.tsx            [Astromeda-themed header]
├── AstroFooter.tsx            [Astromeda-themed footer]
├── HeroSlider.tsx             [Homepage hero carousel (5 banners)]
├── CollabGrid.tsx             [IP collaboration grid (26 titles)]
├── PCShowcase.tsx             [Gaming PC showcase (4 columns responsive)]
├── ProductRating.tsx          [Star ratings with review count]
├── ReviewStars.tsx            [SVG star renderer (useId for <linearGradient>)]
├── ProductSpecHighlights.tsx  [CPU/GPU/RAM specs showcase]
├── ProductCustomization.tsx   [Customization options form]
├── ShippingEstimate.tsx       [Shipping cost calculator (8 categories)]
├── StockIndicator.tsx         [In-stock/low-stock badge]
├── CartAbandonmentModal.tsx   [Exit-intent offer modal]
├── CartUpsell.tsx             [Cross-sell widget (selectedVariant fix)]
├── CrossSell.tsx              [Related products widget]
├── RelatedProducts.tsx        [Related products list]
├── RelatedGuides.tsx          [Guide recommendations]
├── BackInStockNotify.tsx       [Restock notification signup]
├── WishlistButton.tsx         [Wishlist add/remove toggle]
├── WishlistProvider.tsx       [Wishlist state (localStorage)]
├── RecentlyViewedProvider.tsx  [Recently viewed tracking (localStorage)]
├── RecentlyViewed.tsx         [Recently viewed carousel]
├── NewsletterSignup.tsx       [Email capture form]
├── EcommerceAnalytics.tsx     [GA4 event tracking]
├── ImageZoom.tsx              [Image zoom on hover]
├── SetupSlider.tsx            [PC build carousel]
├── Breadcrumb.tsx             [Breadcrumb navigation]
├── BlogNav.tsx                [Blog post navigation]
├── RouteErrorBoundary.tsx     [Error boundary wrapper]
├── Skeleton.tsx               [Loading skeleton UI]
├── ToastProvider.tsx          [Toast notification system]
├── PredictiveSearch.tsx       [Predictive search widget]
├── ReviewForm.tsx             [Product review submission]
├── ABTestWrapper.tsx           [A/B test condition wrapper]
├── AIReferralBanner.tsx       [AI-generated referral banner]
└── ResponsiveContainer.tsx    [Responsive grid wrapper]
```

#### Admin Components (24 files in /components/admin)
```
/admin/ — Admin dashboard UI (recharts, DataTable, KPI cards)
├── index.ts                   [Export barrel]
├── HomeScreen.tsx             [Dashboard landing]
├── AgentHeatmap.tsx           [Agent status heatmap visualization]
├── PipelineMonitor.tsx        [Pipeline execution monitor]
├── SchedulerPanel.tsx         [Task scheduler UI]
├── CommandPalette.tsx         [Quick action palette]
├── DecisionTimeline.tsx       [Decision audit timeline]
├── EmergencyPanel.tsx         [Error recovery/emergency actions]
├── GlobalBar.tsx              [Top notification bar]
├── Sidebar.tsx                [Navigation sidebar]
├── DataTable.tsx              [Generic data table component]
├── KPICard.tsx                [Key metric card display]
├── MiniChart.tsx              [Recharts wrapper]
├── RechartsWidgets.tsx        [Chart library integration]
├── ProgressBar.tsx            [Progress indicator]
├── Button.tsx                 [Styled button variants]
├── Card.tsx                   [Card container wrapper]
├── Badge.tsx                  [Status badge]
├── EmptyState.tsx             [No-data placeholder]
└── [6 more widget components]
```

### GRAPHQL (6 files in /graphql/customer-account)
```
graphql/customer-account/
├── CustomerAddressMutations.ts   [Address CRUD mutations]
├── CustomerDetailsQuery.ts       [Fetch customer profile]
├── CustomerMetafieldsSetMutation.ts [Set custom metafields (v126+)]
├── CustomerOrderQuery.ts         [Single order fetch]
├── CustomerOrdersQuery.ts        [Order history pagination]
└── CustomerUpdateMutation.ts     [Update customer profile (legacy)]
```

### HOOKS (1 file)
- `hooks/useMediaQuery.ts` — Media query breakpoint hook (768px tablet check)

### LIB DIRECTORY (37 files in /lib)

#### Core Infrastructure
```
lib/
├── context.ts                     [createHydrogenRouterContext]
├── fragments.ts                   [GraphQL fragment definitions]
├── session.ts                     [Session/cookie management (M2-NEONATAL-01)]
├── error-reporter.ts              [Error collection & sendBeacon (M6-NEURAL-01)]
├── error-reporter.test.ts         [5 test cases for reporter]
├── error-recovery.ts              [Fallback/retry logic]
├── hydration-safety.ts            [Hydration mismatch prevention]
├── hydration-safety.test.ts       [Hydration test suite]
```

#### Astromeda Data
```
├── astromeda-data.ts              [22.6KB data constants]
│  ├── STORE_NAME, STORE_URL, COMPANY_NAME
│  ├── COLLABS (26 IP titles with shop handles + metadata)
│  ├── THEME_COLORS (brand colors)
│  ├── DESIGN_SYSTEM (typography, spacing, shadows)
│  └── FAQ_DATA, GUIDES_DATA, etc.
├── design-tokens.ts               [Tailwind design tokens]
├── customization-sku-map.ts       [SKU → variant ID mapping]
├── customization-variants.json    [Customization options JSON (5.9KB)]
```

#### Business Logic
```
├── ab-test.ts                     [A/B test framework]
├── admin-auth.ts                  [Admin password + session validation]
├── agent-bridge.ts                [Agent API bridge (29.7KB)]
├── ai-referrer-tracker.ts         [AI-sourced traffic attribution]
├── checkout-tracker.ts            [Checkout event logging]
├── checkout-tester.ts             [End-to-end checkout test utility]
├── content-editor.ts              [Page content editing UI]
├── product-manager.ts             [Product manipulation utilities]
├── review-collector.ts            [Review submission & moderation]
├── revenue-bridge.ts              [Revenue attribution & reporting]
├── search.ts                       [Search query parsing]
├── variants.ts                     [Product variant helpers]
├── orderFilters.ts                [Order filtering logic]
└── redirect.ts                     [URL redirect utilities]
```

#### Analytics & Reporting
```
├── ga4-events.ts                  [GA4 event definitions (10.5KB)]
├── ga4-ecommerce.ts               [GA4 ecommerce tracking (6.9KB)]
├── ga4-server.ts                  [Server-side GA4 events (5.3KB)]
├── GA4_QUICK_REFERENCE.ts         [GA4 implementation guide (12.4KB)]
├── cache-headers.ts               [HTTP cache control strategy]
└── webhook-register.ts, webhook-verify.ts [Shopify webhook handlers]
```

#### Utilities
```
├── qr-code.ts                     [QR code generation (7.3KB)]
├── qr-code.test.ts               [QR code tests]
├── sanitize-html.ts               [XSS prevention]
└── worker-shims/module.ts         [Node.js module shim for Oxygen]
```

### STYLES (3 files in /styles)
- `reset.css?url` — CSS reset
- `app.css?url` — Global styles
- `tailwind.css?url` — Tailwind compiled CSS (v4)

### TYPES (1 file)
- `types/virtual-source-bundle.d.ts` — Vite virtual module type definitions

---

## AGENTS DIRECTORY STRUCTURE (118 files)

### AGENT LAYERS

#### L0: Commander (1 agent)
```
agents/l0/
└── commander.ts [L0 orchestrator — routes tasks to L1 team leads]
```

#### L1: Team Leads (5 agents)
```
agents/l1/
├── acquisition-lead.ts [Acquisition team coordinator]
├── conversion-lead.ts   [Conversion team coordinator]
├── ltv-lead.ts         [Lifetime value team coordinator]
├── infrastructure-lead.ts [Infrastructure/infra team coordinator]
└── intelligence-lead.ts [Data/intelligence team coordinator]
```

#### L2: Specialist Agents (17+ agents)
```
agents/l2/
├── content-writer.ts        [SEO content generation]
├── image-generator.ts       [Image creation/editing]
├── seo-auditor.ts          [SEO optimization]
├── social-media-manager.ts [Social posting]
├── conversion-optimizer.ts  [CRO testing]
├── cart-recovery.ts        [Abandoned cart recovery]
├── review-manager.ts       [Review moderation/response]
├── cross-sell-engine.ts    [Product recommendations]
├── cs-bot.ts               [Customer support chatbot]
├── pricing-strategist.ts   [Dynamic pricing]
├── inventory-monitor.ts    [Stock management]
├── business-analyst.ts     [Analytics & reporting]
├── auth-manager.ts         [Authentication/authorization]
├── deploy-manager.ts       [Release management]
├── performance-optimizer.ts [Performance tuning]
├── analytics-agent.ts      [GA4 & analytics]
└── [more teams in Phase 2]
```

### CORE INFRASTRUCTURE (24 files in /core)
```
agents/core/
├── types.ts                    [120+ lines of interface definitions]
│  ├── AgentLevel, TeamId, AgentId
│  ├── AgentStatus, AgentHealth
│  ├── AgentEvent, CascadeCommand (生命医学metaphor)
│  ├── PipelineStatus, PipelineStep, PipelineDefinition
│  ├── AgentBlueprint, SecurityContext
│  └── [6+ more type groups]
│
├── agent-bus.ts               [Pub/sub event bus (EventEmitter pattern)]
├── ai-brain.ts                [Claude API integration layer]
├── ai-pipeline-bridge.ts      [Pipeline execution with AI orchestration]
├── approval-queue.ts          [Approval workflow management]
├── attribution-engine.ts      [Revenue attribution tracking]
├── cascade-engine.ts          [Cascade command execution]
├── circuit-breaker.ts         [Fault tolerance (open/half-open/closed)]
├── commander-watchdog.ts      [L0 health monitoring]
├── feedback-collector.ts      [User feedback aggregation]
├── health-monitor.ts          [Agent health checks]
├── kv-storage.ts              [Cloudflare KV persistence]
├── prompt-templates.ts        [Claude prompt library]
├── rate-limiter.ts            [Request throttling]
├── scheduler.ts               [Cron/scheduled task runner]
├── security-guard.ts          [RBAC enforcement]
├── shopify-admin.ts           [Shopify Admin API client]
├── state-persistence.ts       [Agent state serialization]
├── storage.ts                 [In-memory or KV backend (initStorageFromEnv)]
├── user-manager.ts            [Customer profile management]
├── action-logger.ts           [Action audit trail]
└── __tests__/ [7 test files]
```

### PIPELINES (14 files in /pipelines)
```
agents/pipelines/
├── pipeline-engine.ts          [Pipeline execution orchestrator]
├── pipeline-definitions.ts     [16 pipeline specs (P01-P16)]
├── queue-manager.ts            [Task queue implementation]
├── rollback-handler.ts         [Failure recovery/compensation]
├── event-trigger.ts            [Event-driven pipeline launch]
├── schedule-trigger.ts         [Cron-based pipeline trigger]
├── cascade-trigger.ts          [L0→L1→L2 cascade execution]
└── __tests__/ [5 test files]
```

### REGISTRATION (2 files in /registration)
```
agents/registration/
├── agent-registration.ts       [53.6KB master registration + initialization]
│  ├── initializeAgents()      [Bootstrap all 23 agents]
│  ├── getRegistrationState()
│  ├── getAgentRegistry()
│  ├── getRegisteredAgents()
│  └── getPipelineEngine()
└── __tests__/
```

### SUPPORTING MODULES

#### Approval (3 files in /approval)
```
agents/approval/
├── approval-orchestrator.ts
├── feedback-analyzer.ts
└── index.ts
```

#### Data Collection (3 files in /data-collection)
```
agents/data-collection/
├── analytics-collector.ts
├── customer-journey-tracker.ts
└── index.ts
```

#### Config (1 file)
```
agents/config/
└── agent-config.ts [Agent instantiation parameters]
```

#### Providers (4 files in /providers)
```
agents/providers/
├── anthropic-provider.ts [Claude API wrapper]
├── shopify-provider.ts  [Storefront + Admin API]
├── storage-provider.ts  [KV/in-memory backend]
└── index.ts
```

#### Registry (2 files in /registry)
```
agents/registry/
├── agent-registry.ts [Agent lifecycle tracking]
└── index.ts
```

#### Integration (3 files in /integration)
```
agents/integration/
├── shopify-integration.ts
├── ai-integration.ts
└── index.ts
```

---

## DEPENDENCY OVERVIEW

### Production Dependencies (7)
```json
{
  "@rollup/rollup-linux-x64-gnu": "^4.60.1",
  "@shopify/hydrogen": "2026.1.1",
  "fflate": "^0.8.2",
  "graphql": "^16.10.0",
  "graphql-tag": "^2.12.6",
  "isbot": "^5.1.22",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router": "7.12.0",
  "react-router-dom": "7.12.0",
  "recharts": "^3.8.1",
  "tailwindcss": "^4.1.6"
}
```

### Critical Dev Dependencies (13 core)
```
@shopify/cli: 3.85.4
@shopify/hydrogen-codegen: 0.3.3
@shopify/mini-oxygen: 4.0.1
@shopify/oxygen-workers-types: ^4.1.6
@react-router/dev: 7.12.0
@react-router/fs-routes: 7.12.0
@tailwindcss/vite: ^4.1.6
typescript: ^5.9.2
vite: ^6.2.4
@graphql-codegen/cli: 5.0.2
eslint: ^9.18.0
prettier: ^3.4.2
vitest: ^4.1.2
```

---

## TYPESCRIPT PATTERNS & CONVENTIONS

### Module Organization
- **ES2022 modules** (`"type": "module"` in package.json)
- **Strict mode** enabled (`"strict": true`)
- **Path aliases**: `~/*` → `./app/*`
- **Barrel exports**: Components export from `index.ts` files

### Type Conventions
```typescript
// Routes use React Router v7 type patterns
import type { Route } from './+types/$route-name';
export async function loader(args: Route.LoaderArgs) { ... }
export default function Component({ loaderData }: Route.ComponentProps) { ... }

// GraphQL queries use graphql-tag
import { gql } from 'graphql-tag';
const QUERY = gql`query { ... }`;

// React component patterns
export default function ComponentName(): JSX.Element { ... }
export const shouldRevalidate: ShouldRevalidateFunction = ({ ... }) => { ... }
export function loader(args: Route.LoaderArgs): Promise<LoadData> { ... }
export function links(): LinkDescriptor[] { ... }

// Agent/core types extend base interfaces
export interface IAgent extends AgentBlueprint { ... }
export type AgentLevel = 'L0' | 'L1' | 'L2' | 'Infra' | 'Registry';

// Utility types for API responses
interface AdminStatusResponse { ... }
export interface AgentStatus { ... }
export interface PipelineStatus { ... }
```

### Error Handling
- **Error Reporter pattern**: `initErrorReporter()` + `reportError()` + `sendBeacon()`
- **Circuit Breaker**: State machine with open/half-open/closed states
- **Fallback pattern**: Try → fallback to mock data
- **Recovery**: Retry + exponential backoff

### Async Patterns
```typescript
// Route loaders: deferred + critical data
const deferredData = loadDeferredData(args);
const criticalData = await loadCriticalData(args);
return { ...deferredData, ...criticalData };

// Streaming SSR: renderToReadableStream with error handling
const body = await renderToReadableStream(..., { onError(e) { ... } });

// Agent initialization: lazy init + singleton
let initPromise: Promise<void> | null = null;
let isInitialized = false;
async function ensureInitialized() {
  if (isInitialized) return;
  if (initPromise) return initPromise;
  initPromise = initialize();
  await initPromise;
  isInitialized = true;
}
```

---

## BUILD & RUNTIME CONFIGURATION

### Vite Plugin Order (Critical M1 Audit)
1. `ensureDistDirs()` — Pre-build directory setup
2. `sourceBundlePlugin()` — Virtual source bundling
3. `hydrogen()` — Shopify Hydrogen SSR integration
4. `oxygen()` — Oxygen worker adaptation
5. `reactRouter()` — React Router v7 compilation
6. `tsconfigPaths()` — TypeScript path alias resolution
7. `tailwindcss()` — Tailwind v4 CSS compilation

### Build Output
```
dist/
├── client/          [Client-side bundle + assets]
│  ├── assets/       [Hashed CSS/JS]
│  └── images/       [Images, PC setup photos]
└── server/          [Server-side bundle for Oxygen]
```

### Server Configuration
- **Rate Limiting**: 30 req/min API, 120 req/min pages (per IP)
- **Security Headers**: X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy
- **Cache Control**: Assets=31536000s immutable, HTML=stale-while-revalidate
- **CSP Nonce**: Generated per request, injected into <script> tags

---

## DEPLOYMENT TARGETS

### Staging Environment (Oxygen Preview)
- **URL**: `https://01knv7zcf6tbepygf1n46g1gx0-48a1974bca92d5b3444d.myshopify.dev`
- **v135**: Latest (ガジェット/グッズ商品分類修正)
- **Build**: `npm run build` → `shopify hydrogen deploy`

### Production Environment  
- **Store**: `production-mining-base`
- **Domain**: `shop.mining-base.co.jp`
- **Version**: v102+ (deployed & stable)
- **Deploy**: `npx shopify hydrogen deploy --build-command "npm run build" --force --entry server`

---

## KEY METRICS

| Metric | Value |
|--------|-------|
| TypeScript/TSX files | 351 |
| App files | 236 |
| Agent files | 118 |
| Total Lines of Code | ~80,000 (estimated) |
| Routes | 72 |
| Components | 82 |
| Agents | 23 (L0:1, L1:5, L2:17) |
| Pipelines | 16 |
| Tests | 40+ test files |
| Performance Score | 99 (Lighthouse) |
| Core Web Vitals | All green (LCP/INP/CLS) |

---

## CRITICAL FILES FOR IMPLEMENTATION

### Must-Know Files
1. `/app/routes/admin.agents.tsx` — Agent UI mount point
2. `/agents/registration/agent-registration.ts` — Agent bootstrap
3. `/agents/core/types.ts` — All interface definitions
4. `/app/lib/agent-bridge.ts` — Bridge to admin dashboard
5. `/agents/pipelines/pipeline-engine.ts` — Pipeline orchestration
6. `/app/entry.server.tsx` — SSR + security context
7. `/app/entry.client.tsx` — Hydration + client init
8. `/vite.config.ts` — Build config (plugin order critical!)

### Supporting Infrastructure
- `/agents/core/ai-brain.ts` — Claude API integration
- `/agents/core/shopify-admin.ts` — Admin API client
- `/agents/core/storage.ts` — State persistence (KV/in-memory)
- `/agents/core/agent-bus.ts` — Event pub/sub system
- `/agents/core/circuit-breaker.ts` — Fault tolerance
- `/agents/core/scheduler.ts` — Scheduled execution

---

## ARCHITECTURE HIGHLIGHTS

### 6-Team Structure
1. **Command Team**: L0 orchestrator only
2. **Acquisition Team**: 6 agents (SEO, content, SNS, ads, monitoring, image gen)
3. **Conversion Team**: 7 agents (UX, CRO, cart recovery, reviews, cross-sell, CS, campaign tracking)
4. **LTV Team**: 6 agents (CRM, intelligence, pricing, shipping, inventory, analytics)
5. **Infrastructure Team**: 6 agents (auth, infra, deploy, performance, error monitoring, analytics)
6. **Intelligence Team**: 5 agents (info lead + 4 specialists) — Phase 2

### Event-Driven Messaging
- **AgentBus**: Pub/sub for inter-agent communication
- **AgentEvent**: Standard message format with correlation IDs
- **CascadeCommand**: L0→L1→L2 task delegation
- **Dead Letter Queue**: Failed events for manual review

### Resilience Patterns
- **Circuit Breaker**: Fault isolation (prevent cascade failures)
- **Rate Limiting**: Prevent DDoS (30 API, 120 page reqs/min per IP)
- **Retry + Exponential Backoff**: Automatic recovery
- **Fallback to Mock Data**: Graceful degradation
- **Health Checks**: Periodic heartbeats (interval: configurable)

---

## TECHNICAL DEBT & KNOWN ISSUES (Resolved in v125+)

| Issue | Status | Resolution |
|-------|--------|-----------|
| React #418 hydration mismatch | ✅ Resolved (v132) | Removed `<style>` children patterns |
| Module shim not found | ✅ Resolved (v102) | Added worker-shims/module.ts |
| robots.txt JSON freeze | ✅ Resolved (v100) | Removed GraphQL queries, used Promise.race |
| Profile metafields not persisting | ✅ Resolved (v126) | Split customerUpdate→metafieldsSet |
| useOptimisticCart warnings | ✅ Resolved (v134) | Added selectedVariant to CartUpsell |
| Vite plugin order incorrect | ✅ Resolved (v125) | Enforced M1 audit plugin sequence |
| Agent warmUp not idempotent | ✅ Resolved (v125) | Added reset flag + timeout logic |

---

## TESTING INFRASTRUCTURE

### Test Files
- `/app/**/*.test.ts` (vitest) — Unit tests
- `/agents/**/__tests__/*.test.ts` — Agent tests
- `/tests/lib/`, `/tests/api/` — Integration tests

### Test Runner
```bash
npm run test              # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:ui          # Vitest UI
```

### Coverage Status
- 649+ tests passing (v132+)
- Admin auth, error reporter, hydration safety, QR code, circuit breaker: all covered
- Agents registration, agent-bus, pipeline-engine: core tests included

---

## NEXT STEPS FOR IMPLEMENTATION

1. **Read master registration file**: `agents/registration/agent-registration.ts` (53.6KB)
2. **Review agent-bridge.ts**: Understand admin dashboard API shape
3. **Check pipeline-engine.ts**: Understand task execution flow
4. **Inspect core/types.ts**: All interfaces for agent development
5. **Review entry.server.tsx + entry.client.tsx**: Security context + hydration patterns
6. **Vite config audit**: Plugin order CRITICAL for builds

---

## File Size Largest Contributors

| File | Size |
|------|------|
| agents/registration/agent-registration.ts | 53.6KB |
| app/lib/agent-bridge.ts | 29.7KB |
| app/lib/astromeda-data.ts | 22.6KB |
| AUDIT_MATURATION_ISSUES.md | 20.6KB |
| CHANGELOG.md | 111.9KB |
| app/lib/GA4_QUICK_REFERENCE.ts | 12.4KB |

---

**Generated**: 2026-04-10 18:30 JST  
**Scanned by**: Claude Code Agent  
**Repository**: Astromeda EC Phase 1 (Phase 2 Design v12)
