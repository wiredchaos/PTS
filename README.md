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

---

## Hermes Core v1

Hermes is the central operating layer (orchestrator) for the PTS platform — a Mixture-of-Agents (MoA) pipeline that handles document classification, extraction, tax analysis, resolution case management, legal review, and QA.

### Architecture

```text
POST /api/hermes/run
        │
        ▼
   Hermes Orchestrator (functions/_lib/hermes.js)
        │
        ├─ SHA-256 input hash dedup (KV → D1 cache check)
        ├─ Agent routing (based on taskType + client.case_type)
        │
        ├─ intake_classifier   (rules-based, no LLM)
        ├─ document_extractor  (memory-backed)
        ├─ tax_analyst         (citation-required)
        ├─ resolution_agent    (only: case_type=resolution)
        ├─ legal_agent         (attorney review required)
        ├─ qa_reviewer         (post-run quality gate)
        └─ gamma_agent         (only: explicitly requested)
        │
        └─ Persist to D1, cache in KV, return result
```

### New API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hermes/run` | Execute full Hermes pipeline |
| `POST` | `/api/hermes/route` | Preview routing without executing |
| `GET` | `/api/hermes/status/:runId` | Get run status and result |
| `GET` | `/api/hermes/history/:clientId` | List run history for a client |
| `GET` | `/api/hermes/agent-registry` | List all registered agents |
| `POST` | `/api/hermes/cache/clear` | Clear KV cache for an input hash |
| `GET` | `/api/hermes/usage` | Model usage and cost summary |

### Applying the Hermes Schema Migration

```bash
# Apply base schema (if not already applied)
wrangler d1 execute pts_tax_lab --file=schema.sql

# Apply Hermes additive migration (safe, no DROP statements)
wrangler d1 execute pts_tax_lab --file=schema_hermes.sql
```

### Cost Controls

- SHA-256 input hashing prevents reprocessing identical inputs
- KV cache (24h TTL) for fast repeated lookups
- No LLM invoked for known MIME/extension types
- `resolution_agent` only runs for `case_type=resolution` clients
- `gamma_agent` only runs when `hermesOptions.requestGamma: true`
- Credentialed APIs (IRS/FTB) require connector env vars

### Documentation

- [`docs/HERMES_ORCHESTRATOR.md`](docs/HERMES_ORCHESTRATOR.md) — Orchestration flow, agent registry, cost-control rules, how to add a new agent
- [`docs/MOA_ARCHITECTURE.md`](docs/MOA_ARCHITECTURE.md) — Mixture-of-Agents pattern, memory model, citation requirements, governance
- [`docs/NOUS_RESEARCH_REVIEW.md`](docs/NOUS_RESEARCH_REVIEW.md) — NousResearch Hermes/MoA research review, patterns adopted/rejected, licensing

---

## Changelog
- Added Cloudflare Pages-compatible static application with standardized routing.
- Added Cloudflare Pages Functions API layer for uploads, processing, analysis, guide, gamma, registry, and health.
- Added D1 schema for multi-client data model and processing pipeline records.
- Added deployment and migration docs (`DEPLOY_THIS_README.md`).
- Removed hardcoded client-specific content from static pages; client examples moved to DB seed only.

## Placeholder Integrations
Credential-dependent/restricted APIs (IRS/FTB/legal systems/Gamma automation) are intentionally placeholder-only until credentials are available.
