# Purnell Tax Solutions (PTS) Cloudflare Portal

## Overview
Cloudflare-first evergreen multi-client tax portal using Pages + Pages Functions, D1, R2, and KV.

## Architecture
```text
Browser (static Pages)
  ├─ Evergreen pages (index/client/upload/organizer/admin/etc.)
  └─ Calls Pages Functions (/api/*)
Pages Functions
  ├─ Upload + Bulk upload -> R2 object storage + D1 metadata
  ├─ Processing queue + classification placeholders -> D1
  ├─ Tax analysis placeholders -> D1 structured outputs
  ├─ Gamma URL persistence/view -> D1
  └─ MCP registry + health endpoints
Cloudflare Data Services
  ├─ D1: clients, documents, jobs, queue, analysis, organizer, gamma
  ├─ R2: uploaded document objects
  └─ KV: runtime config/feature flags/cache references
```

## Required Pages
- `/index.html`
- `/client-portal.html`
- `/upload.html`
- `/universal-processor.html`
- `/organizer.html`
- `/biz-organizer.html`
- `/clients.html`
- `/admin.html`
- `/gamma.html`
- `/gamma-view.html`
- `/mcp-registry.html`
- `/resolution-guide.html` (conditional for resolution clients; not in evergreen nav)
- `/404.html`

## API Endpoints
- `POST /api/upload`
- `POST /api/bulk-upload`
- `POST /api/process-document`
- `POST /api/tax-analysis`
- `GET /api/client-guide`
- `POST /api/gamma`
- `GET /api/gamma-view`
- `GET /api/mcp-registry`
- `GET /api/health`

## Security and Privacy
- No private tax data or client-specific static content in evergreen pages/templates.
- Sensitive integrations are placeholders until credentials are configured.
- Auth/session hook stubs are available for future login enforcement.

## Migration Guide
1. Replace legacy single-client/static content with evergreen pages in repo root.
2. Apply `schema.sql` to D1.
3. Configure `wrangler.toml` bindings for D1/R2/KV.
4. Migrate uploaded files to R2 using `clients/{clientId}/tax-year/{taxYear}/...` key convention.
5. Deploy Pages from GitHub and validate `/api/health`.

## Changelog
- Added Cloudflare Pages-compatible static application with standardized routing.
- Added Cloudflare Pages Functions API layer for uploads, processing, analysis, guide, gamma, registry, and health.
- Added D1 schema for multi-client data model and processing pipeline records.
- Added deployment and migration docs (`DEPLOY_THIS_README.md`).
- Removed hardcoded client-specific content from static pages; client examples moved to DB seed only.

## Placeholder Integrations
Credential-dependent/restricted APIs (IRS/FTB/legal systems/Gamma automation) are intentionally placeholder-only until credentials are available.
