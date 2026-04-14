# Phase 2 L2 Agent API Integrations

## Overview

This document describes the Phase 2 implementations for the Astromeda AI Agent system's L2 agents. Real API integrations have been added to three core agents with graceful fallback strategies for Edge runtime environments.

## Implementations Summary

### 1. SecurityAgent (`agents/l2/security-agent.ts`)

#### A. NVD (National Vulnerability Database) Integration
**File location**: `seedVulnerabilityDatabase()` + `fetchNVDVulnerabilities()`

**What it does**:
- Queries the free NIST NVD API for Shopify/Hydrogen CVEs
- No API key required (free tier)
- Falls back to static vulnerability database on network failure
- Non-blocking: network errors do not crash the agent

**API Details**:
- **Endpoint**: `https://services.nvd.nist.gov/rest/json/cves/2.0`
- **Auth**: None (free public API)
- **Query params**: `keywordSearch=@shopify&resultsPerPage=20`
- **Response parsing**: Extracts CVE ID and description
- **Fallback**: Static `COLLABS` database in `vulnerabilityDatabase[]`

**Configuration**:
```bash
# Optional: NVD API fetches are automatic
# No env var needed (free API tier is unlimited)
```

**Error handling**:
```typescript
// Network failure → log warning → continue with static DB
console.warn('[SecurityAgent] NVD fetch failed (non-blocking fallback):...');
```

---

#### B. npm Registry Vulnerability Scanning
**File location**: `vulnerabilityScan()` + `performNpmAudit()`

**What it does**:
- Checks npm registry for deprecated packages
- Supports `npm audit --json` format if provided via env
- Queries known vulnerable packages (Hydrogen, React, React Router)
- Identifies outdated vs. vulnerable packages

**API Details**:
- **Endpoint**: `https://registry.npmjs.org/{package}/latest`
- **Auth**: None
- **Response fields**: `version`, `deprecated`
- **Fallback**: Static recommendations in `vulnerabilityDatabase[]`

**Configuration**:
```bash
# Optional: Pre-run npm audit and provide output
export NPM_AUDIT_JSON='{"vulnerabilities": {...}}'
```

**Error handling**:
```typescript
// Individual package check failures are non-blocking
// Falls back to static vulnerability list
```

---

#### C. CSP (Content Security Policy) Review
**File location**: `cspReview()` + `analyzeCspPolicy()` + `getRemediationAdvice()`

**What it does**:
- Fetches live CSP header from target domain
- Analyzes policy for common weaknesses:
  - `unsafe-inline` (allows inline scripts)
  - `unsafe-eval` (allows eval())
  - Wildcard sources (`*`)
  - Missing `script-src` directive
- Provides specific remediation advice

**API Details**:
- **Method**: `HEAD` request (lightweight)
- **Response header**: `Content-Security-Policy`
- **Fallback**: Default policy analysis if header unavailable

**Configuration**:
```bash
# Optional: Specify domain to audit
export TARGET_DOMAIN="shop.mining-base.co.jp"
# Default: shop.mining-base.co.jp
```

**Error handling**:
```typescript
// Network failure → use default issues list
console.warn('[SecurityAgent] CSP header fetch failed...');
```

---

#### D. Dependency Version Checking
**File location**: `dependencyCheck()` + `scanDependencies()`

**What it does**:
- Queries npm registry for latest versions of critical packages
- Compares semantic versions
- Identifies outdated and vulnerable packages
- Generates update recommendations

**API Details**:
- **Endpoint**: `https://registry.npmjs.org/{package}/latest`
- **Packages checked**: 5 critical packages
- **Dev dependencies**: Optional (controlled by parameter)
- **Fallback**: Static package list

**Configuration**:
```bash
# Optional: Include dev dependencies in scan
# Default: true
```

---

### 2. DevOpsAgent (`agents/l2/devops-agent.ts`)

#### A. Fly.io Machines API Rollback
**File location**: `rollback()` + `executeRollback()` + `rollbackViaFlyIo()`

**What it does**:
- Queries Fly.io release history
- Identifies last successful release
- Triggers rollback by restarting previous release machine
- Logs instructions for manual Shopify rollback (no API available)

**API Details**:
- **Base URL**: `https://api.machines.dev/v1`
- **Endpoints**:
  - `GET /apps/{appName}/releases` — List releases
  - `POST /apps/{appName}/machines/{machineId}/restart` — Restart machine
- **Auth**: `Authorization: Bearer {FLY_API_TOKEN}` header
- **Response**: Release with `id`, `version`, `status` fields

**Configuration**:
```bash
# Required for Fly.io rollback:
export FLY_API_TOKEN="..."           # From Fly.io dashboard
export FLY_APP_STAGING="astromeda-staging"
export FLY_APP_PROD="astromeda-prod"
```

**Error handling**:
```typescript
// If Fly.io unavailable, logs Shopify CLI command for manual rollback
console.warn('[DevOpsAgent] To rollback:', 'shopify hydrogen deploy --version ...');
// Returns success: false to indicate manual action required
```

---

#### B. GitHub Actions CI Workflow Dispatch
**File location**: `buildCheck()` + `executeAllBuildChecks()`

**What it does**:
- Triggers GitHub Actions CI workflow for comprehensive build checks:
  - TypeScript compilation
  - ESLint
  - Unit tests
  - Bundle size analysis
- Falls back to local simulation if not configured

**API Details**:
- **Endpoint**: `https://api.github.com/repos/{owner}/{repo}/actions/workflows/ci.yml/dispatches`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer {GITHUB_TOKEN}`
  - `X-GitHub-Api-Version: 2022-11-28`
- **Body**: `{ "ref": "main", "inputs": { "version": "..." } }`
- **Response**: Workflow dispatch accepted (202 status)

**Configuration**:
```bash
# Required for GitHub Actions integration:
export GITHUB_TOKEN="..."           # From GitHub Settings → Personal access tokens
export GITHUB_REPO="mining-base/astromeda-ec"  # Format: owner/repo
```

**Error handling**:
```typescript
// Workflow dispatch triggers asynchronously
// Agent returns immediately with "pending" status
// User must check GitHub Actions tab for real-time results
console.warn('[DevOpsAgent] GitHub Actions workflow triggered. Check GitHub for results.');
```

---

### 3. ImageGenerator (`agents/l2/image-generator.ts`)

#### A. DALL-E 3 AI Image Generation
**File location**: `generateBanner()` + `generateWithDallE()`

**What it does**:
- Generates gaming PC product banners using DALL-E 3
- Constructs detailed prompts with:
  - IP collaboration name
  - Accent color
  - Dimensions (1024x1024)
  - Gaming aesthetic requirements
- Uses HD quality for professional appearance
- Falls back to Shopify Admin API if generation fails

**API Details**:
- **Endpoint**: `https://api.openai.com/v1/images/generations`
- **Model**: `dall-e-3`
- **Size**: `1024x1024`
- **Quality**: `hd`
- **Style**: `vivid`
- **Auth**: `Authorization: Bearer sk-{OPENAI_API_KEY}` header
- **Response**: `{ data: [{ url: "https://..." }] }`

**Configuration**:
```bash
# Required for DALL-E integration:
export OPENAI_API_KEY="sk-..."  # From OpenAI API dashboard
```

**Pricing & Rate Limits**:
- DALL-E 3 (1024x1024, hd): $0.080 per image
- Rate limit: Typical 500 requests/minute
- Implement queuing for batch generation

**Fallback chain**:
1. DALL-E 3 generation (if `OPENAI_API_KEY` set)
2. Shopify Admin API collection image (if available)
3. Shopify CDN fallback URL

**Error handling**:
```typescript
// DALL-E failure → fallback to Admin API → fallback to CDN
console.warn('[ImageGenerator] DALL-E generation failed for...');
// Continues gracefully without breaking banner display
```

---

## Environment Variables Reference

### Security Agent
```bash
# Optional: NVD API queries are automatic (no auth needed)
# Optional: npm audit output (pre-run npm audit --json)
export NPM_AUDIT_JSON='...'
```

### DevOps Agent
```bash
# For Fly.io rollback:
export FLY_API_TOKEN="..."
export FLY_APP_STAGING="astromeda-staging"
export FLY_APP_PROD="astromeda-prod"

# For GitHub Actions CI:
export GITHUB_TOKEN="..."              # Personal access token (scopes: repo, workflow)
export GITHUB_REPO="mining-base/astromeda-ec"
```

### Image Generator
```bash
# For DALL-E 3:
export OPENAI_API_KEY="sk-..."         # OpenAI API key
```

---

## Implementation Patterns

### 1. Non-blocking External API Calls
All integrations follow this pattern:
```typescript
try {
  const result = await fetch(apiUrl);
  // Parse and use result
} catch (err) {
  console.warn('[AgentName] API failed (non-blocking fallback):', err.message);
  // Return default/static data
}
```

### 2. Graceful Fallback Chain
```typescript
// Try primary method → Try fallback → Use static/cached data
let result = await method1() ?? await method2() ?? staticDefault;
```

### 3. Edge Runtime Compatibility
- All HTTP calls use `fetch()` (not Node.js modules)
- No `fs`, `child_process`, or other Node-specific APIs
- Works in Shopify Oxygen, Vercel Edge, Cloudflare Workers

### 4. Console Logging Strategy
```typescript
// Success: console.warn (non-critical info)
console.warn('[ImageGenerator] DALL-E generated image for...');

// Failure: console.warn with fallback explanation
console.warn('[SecurityAgent] NVD fetch failed (non-blocking fallback):', err.message);

// Never throws exceptions from external API failures
```

---

## Testing

Unit tests are provided in `agents/l2/__tests__/phase2-integrations.test.ts`:
```bash
npm test -- agents/l2/__tests__/phase2-integrations.test.ts
```

**Test coverage**:
- NVD API fetching with fallback
- npm registry version checks
- CSP header analysis
- Fly.io rollback API
- GitHub Actions dispatch
- DALL-E 3 image generation
- Common patterns (fetch-only, non-blocking, env vars)

---

## Deployment Checklist

Before deploying Phase 2 implementations:

- [ ] Set required environment variables in Shopify Oxygen / deployment platform
- [ ] Verify API keys have minimum required permissions:
  - [ ] OPENAI_API_KEY: Images.generate scope
  - [ ] GITHUB_TOKEN: repo, workflow scopes
  - [ ] FLY_API_TOKEN: Apps read/write permission
- [ ] Test fallback paths (disable env vars, verify graceful fallback)
- [ ] Monitor error logs for any API failures
- [ ] Set up alerts for repeated API failures
- [ ] Review API rate limits for production scale
- [ ] Document any custom CSP policies for auditee domains
- [ ] Plan cost management for DALL-E 3 (if heavy usage)

---

## Monitoring & Observability

Each agent publishes events to the agent bus:
```typescript
await this.publishEvent('security.vulnerability_scan.completed', { scanId, vulnerableCount, ... });
await this.publishEvent('deploy.rollback.completed', { result });
await this.publishEvent('image.generation.completed', { collection, bannerUrl, ... });
```

Monitor these events in your observability platform (DataDog, New Relic, etc.) to track:
- API integration success/failure rates
- Fallback usage frequency
- API latency and timeouts
- Generated image quality and cost

---

## Future Enhancements (Phase 3)

- [ ] Implement retry logic with exponential backoff
- [ ] Add caching layer for NVD/npm registry queries (24h TTL)
- [ ] Support multiple image generation providers (Stable Diffusion, Midjourney)
- [ ] Implement image quality scoring and re-generation
- [ ] Add cost tracking for DALL-E 3 usage
- [ ] Support Shopify Hydrogen deploy via programmatic API
- [ ] Integrate Dependabot API for real-time vulnerability alerts
- [ ] Add Slack/Discord notifications for critical security findings

---

## Support & Troubleshooting

### SecurityAgent
- **NVD fetch timing out**: NVD API has occasional rate limiting. Fallback to static DB is automatic.
- **npm registry unreachable**: Individual package checks are non-blocking. Static list is used.

### DevOpsAgent
- **Fly.io API authentication fails**: Verify token has `Apps:read` permission.
- **GitHub workflow not triggering**: Check GITHUB_TOKEN scopes (repo, workflow) and repo name format.

### ImageGenerator
- **DALL-E API returns 429 (rate limit)**: Implement exponential backoff in caller. Fallback to Admin API.
- **Image quality poor**: Adjust prompt in `generateWithDallE()`. Consider premium quality settings.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   L2 Agent Pipeline                          │
└─────────────────────────────────────────────────────────────┘
           │                        │                      │
    ┌──────▼─────────┐   ┌─────────▼──────────┐  ┌────────▼────────┐
    │ SecurityAgent   │   │  DevOpsAgent       │  │ ImageGenerator   │
    └──────┬─────────┘   └─────────┬──────────┘  └────────┬────────┘
           │                        │                      │
      ┌────┴─────┬─────┬────┐  ┌────┴──────┬────┐   ┌─────┴─────┐
      │           │     │    │  │           │    │   │           │
   ┌──▼──┐  ┌─────▼──┐ ┌──▼──┐ │   ┌──────▼──┐ │ ┌─▼────┐ ┌───▼───┐
   │NVD  │  │npm reg │ │ CSP │ │   │Fly.io  │ │ │DALL-E│ │Admin  │
   │API  │  │API     │ │Fetch│ │   │API     │ │ │3 API │ │API    │
   └──┬──┘  └─────┬──┘ └──┬──┘ │   └──┬─────┘ │ └─┬────┘ └───┬───┘
      │           │       │    │      │       │   │           │
      └───────────┼───────┴────┼──────┴───────┴───┴───────────┘
                  │                   │
            (Edge Runtime Compatible)
            fetch() only, no Node APIs
            Graceful fallback always
```

---

## References

- NVD API: https://services.nvd.nist.gov/rest/json/cves/2.0
- npm Registry: https://registry.npmjs.org
- Fly.io Machines API: https://fly.io/docs/machines/
- GitHub Actions API: https://docs.github.com/en/rest/actions
- OpenAI DALL-E 3: https://platform.openai.com/docs/guides/images/generations

---

**Last updated**: 2026-04-10
**Version**: Phase 2 Implementation v1.0
**Status**: Ready for testing & deployment
