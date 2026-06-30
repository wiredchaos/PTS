# Hermes Orchestrator — Architecture & Operations Guide

## Overview

Hermes Core v1 is the central operating layer for the PTS (Purnell Tax Solutions) platform. It is deployed as Cloudflare Pages Functions and orchestrates a Mixture-of-Agents (MoA) pipeline for document ingestion, tax analysis, legal review, and resolution case management.

---

## Orchestration Flow

```
POST /api/hermes/run
        │
        ▼
   runHermes()
        │
        ├─ 1. SHA-256 input hash
        │
        ├─ 2. Cache check (KV → D1)
        │       ├─ HIT  → return cached result + audit event
        │       └─ MISS → continue
        │
        ├─ 3. Load client record (case_type, etc.)
        │
        ├─ 4. Route decision (routeAgents)
        │       └─ Write to route_decisions (D1)
        │
        ├─ 5. Execute agents in sequence:
        │       ├─ intake_classifier (no LLM)
        │       ├─ document_extractor (memory-backed)
        │       ├─ tax_analyst (citation-required)
        │       ├─ resolution_agent (if case_type=resolution)
        │       ├─ legal_agent (attorney review required)
        │       ├─ qa_reviewer (post-run gate)
        │       └─ gamma_agent (if explicitly requested)
        │
        ├─ 6. Persist run + citations to D1
        │
        ├─ 7. Populate KV cache (TTL: 24h)
        │
        └─ 8. Return { runId, status, cached, result, requiresHumanReview, citations }
```

---

## Agent Registry

| Agent | Task Types | LLM Required | Notes |
|---|---|---|---|
| `intake_classifier` | classify, upload, document, extract, analysis, full | No | Rules-based; SLM hint for unknowns |
| `document_extractor` | extract, document, analysis, full | No | Checks agent_memory first |
| `tax_analyst` | analysis, tax, full | Optional | Every conclusion requires ≥1 citation |
| `resolution_agent` | resolution, full | No | Only runs for `case_type=resolution` |
| `legal_agent` | legal, entity, trust, poa, contract, full | No | Always sets `requires_attorney_review: true` |
| `qa_reviewer` | (after substantive agents) | No | Flags missing citations, hallucinations |
| `gamma_agent` | (when requested) | No | Only when `hermesOptions.requestGamma === true` |

---

## Cost-Control Rules

1. **SHA-256 deduplication** — If `agent_runs` contains a completed run with the same `input_hash`, return the cached result immediately. No agent is re-invoked.
2. **KV fast cache** — Before querying D1, check `PTS_KV` for `hermes:cache:{inputHash}`. TTL: 24 hours.
3. **No LLM for classification** — `intake_classifier` uses a rules layer (MIME map + extension map). LLM is never called for known types.
4. **resolution_agent guard** — Agent is skipped unless `client.case_type === 'resolution'`. This prevents accidental IRS/FTB API calls.
5. **gamma_agent guard** — Agent is skipped unless `hermesOptions.requestGamma === true`.
6. **Credentialed APIs** — IRS/FTB/e-file connectors are only invoked when `IRS_CONNECTOR_KEY` or `FTB_CONNECTOR_KEY` env vars are set. Otherwise, `credentialed_only: true` is returned.

---

## Evidence & Citation Requirements

- Every conclusion from `tax_analyst` and `legal_agent` **must** include at least one citation.
- Valid citation types: `IRC`, `TREASURY_REG`, `IRS_PUB`, `REVENUE_RULING`, `COURT_CASE`, `INTERNAL_WORKPAPER`.
- Citation structure: `{ type, reference, description, url? }`.
- If a citation cannot be provided: return `{ supported: false, requires_human_review: true }`.
- Estimates must be labeled `estimate_only: true`.
- **Never fabricate** IRC sections, Revenue Rulings, court cases, or IRS publication numbers.

---

## Database Tables (Hermes-specific)

| Table | Purpose |
|---|---|
| `agent_runs` | One record per Hermes invocation; tracks status, hash, output |
| `agent_messages` | Message log for multi-turn agent conversations |
| `agent_artifacts` | Binary/structured artifacts produced by agents |
| `agent_memory` | Client-keyed persistent memory for extraction results |
| `citations` | All citations produced by any agent run |
| `route_decisions` | Routing log: which agents were chosen and why |
| `model_usage` | Token counts and estimated cost per LLM call |
| `audit_events` | Full audit trail: run starts, cache hits, agent completions, human review flags |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hermes/run` | Execute full Hermes pipeline |
| `POST` | `/api/hermes/route` | Preview routing without executing |
| `GET` | `/api/hermes/status/:runId` | Get run status and result |
| `GET` | `/api/hermes/history/:clientId` | List run history for a client |
| `GET` | `/api/hermes/agent-registry` | List all registered agents |
| `POST` | `/api/hermes/cache/clear` | Clear KV cache for an input hash |
| `GET` | `/api/hermes/usage` | Model usage and cost summary |

---

## How to Add a New Agent

1. Create `functions/_lib/agents/{agent_name}.js` exporting `async function run(context, input)`.
2. The function signature must be: `run(context, input)` where `context` includes `{ env, db, kv, clientId, documentId, client, runId, hermesOptions }`.
3. Return an object. For substantive agents, include `citations: []`.
4. Register the agent in `AGENT_REGISTRY` in `functions/_lib/hermes.js`.
5. Add routing logic in `routeAgents()` in `hermes.js`.
6. Add the agent to `AGENTS` array in `functions/api/hermes/agent-registry.js`.
7. Write a test in `tests/hermes.test.js` covering at least one guard condition.

---

## Security

- LLM API keys must come from env only (`env.LLM_API_KEY`). Never hardcode.
- No client-specific data in source files.
- All agent runs write to `audit_events`. Cache hits also generate audit events.
- `requires_human_review` flag is set whenever confidence < 0.7, citations are missing, or attorney review is required.

---

## Applying the Schema Migration

```bash
# Apply base schema first (if not already applied)
wrangler d1 execute pts_tax_lab --file=schema.sql

# Apply Hermes additive migration
wrangler d1 execute pts_tax_lab --file=schema_hermes.sql
```

The migration is idempotent (`CREATE TABLE IF NOT EXISTS`) and contains no `DROP` statements.
