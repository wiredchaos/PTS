# MOA Architecture — Mixture-of-Agents for PTS

## Overview

Hermes Core v1 implements a **Mixture-of-Agents (MoA)** pattern where multiple specialized agents collaborate to produce a higher-quality, better-evidenced output than any single model could produce alone. This document describes the architectural design, memory model, evidence/citation requirements, and governance layer.

---

## Mixture-of-Agents Pattern

### What is MoA?

Mixture-of-Agents is an inference architecture in which:
1. Multiple agents (or models) independently process the same or related inputs.
2. A synthesizer or quality gate aggregates their outputs.
3. The final result reflects the ensemble's reasoning, not a single model's output.

In PTS, this is implemented as a **sequential MoA pipeline** where agents are specialized by domain (classification, extraction, tax, legal, resolution, QA) rather than running in parallel. The `qa_reviewer` acts as the aggregator and quality gate.

### Agent Interaction Model

```
Input
  │
  ▼
intake_classifier ──────────────────────────────────────────────────┐
  │                                                                   │
  ▼                                                                   │
document_extractor (reads agent_memory) ────────────────────────────┤
  │                                                                   │
  ▼                                                                   │
tax_analyst (citation-required) ────────────────────────────────────┤
  │                                                                   │
  ▼                                                                   │
resolution_agent (gated: case_type=resolution) ─────────────────────┤
  │                                                                   │
  ▼                                                                   │
legal_agent (attorney review required) ─────────────────────────────┤
  │                                                                   │
  └─── All outputs ───────────────────────────────────────────────────┤
                                                                      ▼
                                                               qa_reviewer
                                                                      │
                                                                      ▼
                                                         { result, citations, flags }
```

---

## Memory Model

### agent_memory Table

The `agent_memory` table provides a **persistent, client-keyed key-value store** for agent state:

```sql
agent_memory (
  client_id    INTEGER NOT NULL,
  memory_type  TEXT NOT NULL,   -- 'extraction', 'profile', 'resolution', etc.
  key          TEXT NOT NULL,   -- 'doc:42', 'tax_year:2024', etc.
  value_json   TEXT NOT NULL,
  source_run_id TEXT,
  confidence   REAL,
  expires_at   TEXT,
  UNIQUE(client_id, memory_type, key)
)
```

### Memory Types

| Type | Purpose | Example Key |
|---|---|---|
| `extraction` | Document field extraction results | `doc:42` |
| `profile` | Client facts (filing status, entity type) | `filing_status` |
| `resolution` | IRS/FTB balance and case data | `irs_balance_2023` |
| `analysis` | Previous tax analysis results | `tax_year:2024` |

### Memory Lifecycle

1. **Check first**: `document_extractor` checks `agent_memory` before re-extracting.
2. **Write on success**: Results with `confidence >= 0.7` are persisted to memory.
3. **Expire stale data**: Use `expires_at` for time-sensitive data (IRS balances, etc.).
4. **Source tracking**: `source_run_id` links memory back to the originating run.

---

## Evidence & Citation Requirements

### Citation Types

| Type | Example |
|---|---|
| `IRC` | `IRC § 61(a)(1)` |
| `TREASURY_REG` | `Treas. Reg. § 1.1402(a)-1` |
| `IRS_PUB` | `IRS Publication 525` |
| `REVENUE_RULING` | `Rev. Rul. 2004-60` |
| `COURT_CASE` | `Commissioner v. Glenshaw Glass Co., 348 U.S. 426 (1955)` |
| `INTERNAL_WORKPAPER` | `PTS WP-001` |

### Rules

1. Every substantive tax or legal conclusion requires ≥1 citation.
2. If a citation cannot be provided: `{ supported: false, requires_human_review: true }`.
3. Estimates: `estimate_only: true` at both finding and output level.
4. **Never fabricate** references. Unknown → flag for human review.
5. `qa_reviewer` validates citation presence and structure for all agents in `requiredCitationAgents`.

### Citation Table

All citations are persisted to the `citations` table, linked to `run_id`:

```sql
citations (
  run_id        TEXT NOT NULL,
  citation_type TEXT NOT NULL,
  reference     TEXT NOT NULL,
  description   TEXT,
  url           TEXT
)
```

---

## Governance Layer

### Human Review Flags

The following conditions set `requires_human_review: true`:
- `document_extractor`: `confidence < 0.7`
- `tax_analyst`: missing income documentation, no documents provided
- `legal_agent`: always (for legal conclusions)
- `resolution_agent`: always (requires credentialed practitioner)
- `qa_reviewer`: any `critical` or `high` severity flag
- Any agent encountering an unhandled error

### Audit Events

Every significant action writes to `audit_events`:

| Event Type | Trigger |
|---|---|
| `run_started` | New Hermes run begins |
| `cache_hit` | KV or D1 cache hit, run skipped |
| `agent_completed` | Any agent finishes |
| `run_completed` | All agents finished, run persisted |
| `cache_clear` | Cache entry deleted |

### Attorney Review

`legal_agent` **always** sets `requires_attorney_review: true`. This is a hard rule — no legal conclusions are presented as legal advice. The governance layer enforces this via `qa_reviewer`, which flags any `legal_agent` output missing this field.

### Credentialed API Guard

IRS/FTB connector APIs are never called unless `IRS_CONNECTOR_KEY` or `FTB_CONNECTOR_KEY` are present in the environment. When absent, `resolution_agent` returns `credentialed_only: true` with a checklist.

---

## Cost Control Summary

| Rule | Mechanism |
|---|---|
| No duplicate processing | SHA-256 `input_hash` dedup in D1 |
| Fast cache | KV with 24h TTL |
| No LLM for classification | Rules-based `intake_classifier` |
| Conditional agents | `resolution_agent`, `gamma_agent` gated |
| No credentialed API calls | Connector key guard |
| Memory reuse | `agent_memory` checked before re-extraction |

---

## Adding a New Agent to the MoA Pipeline

See [HERMES_ORCHESTRATOR.md](./HERMES_ORCHESTRATOR.md) for step-by-step instructions.

Key principles for new agents:
- Export `async function run(context, input)`.
- Return `citations: []` for any substantive conclusions.
- Set `requires_human_review: true` when confidence is low or when attorney/practitioner review is mandatory.
- Never hardcode client data or fabricate references.
- Register in `AGENT_REGISTRY` and routing logic in `hermes.js`.
