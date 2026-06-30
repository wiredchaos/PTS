/**
 * hermes.js — Hermes Core v1 Orchestrator
 *
 * Central operating layer for the PTS platform.
 * Handles SHA-256 dedup, KV/D1 cache, agent routing, cost controls, and audit logging.
 *
 * Usage:
 *   import { runHermes } from '../_lib/hermes.js';
 *   const result = await runHermes({ taskType, clientId, documentId, input, requestedBy }, env);
 */

import { run as runIntakeClassifier } from './agents/intake_classifier.js';
import { run as runDocumentExtractor } from './agents/document_extractor.js';
import { run as runTaxAnalyst } from './agents/tax_analyst.js';
import { run as runResolutionAgent } from './agents/resolution_agent.js';
import { run as runLegalAgent } from './agents/legal_agent.js';
import { run as runQaReviewer } from './agents/qa_reviewer.js';
import { run as runGammaAgent } from './agents/gamma_agent.js';

const AGENT_REGISTRY = {
  intake_classifier: { run: runIntakeClassifier, description: 'Rules-based MIME/extension classification; no LLM for known types.' },
  document_extractor: { run: runDocumentExtractor, description: 'Structured field extraction; checks agent_memory first.' },
  tax_analyst: { run: runTaxAnalyst, description: 'Workpaper-ready analysis with mandatory citations.' },
  resolution_agent: { run: runResolutionAgent, description: 'IRS/FTB resolution; only for case_type=resolution.' },
  legal_agent: { run: runLegalAgent, description: 'Entity/trust/POA/contract support; always requires attorney review.' },
  qa_reviewer: { run: runQaReviewer, description: 'Validates other agent outputs; flags hallucination and missing citations.' },
  gamma_agent: { run: runGammaAgent, description: 'Gamma presentation generation; only when explicitly requested.' },
};

export { AGENT_REGISTRY };

/**
 * Compute SHA-256 hash of a string. Works in Cloudflare Workers (Web Crypto API).
 */
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a unique run ID.
 */
function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Determine which agents to run based on taskType and client context.
 * Cost-control rules are enforced here.
 */
function routeAgents(taskType, client, hermesOptions = {}) {
  const agents = [];
  const reasons = [];
  const t = (taskType || '').toLowerCase();

  // Always run intake classifier for document-related tasks (no LLM cost)
  if (['classify', 'upload', 'document', 'extract', 'analysis', 'full'].includes(t)) {
    agents.push('intake_classifier');
    reasons.push('intake_classifier: rules-based, no LLM cost');
  }

  if (['extract', 'document', 'analysis', 'full'].includes(t)) {
    agents.push('document_extractor');
    reasons.push('document_extractor: memory-backed extraction');
  }

  if (['analysis', 'tax', 'full'].includes(t)) {
    agents.push('tax_analyst');
    reasons.push('tax_analyst: citation-backed analysis');
  }

  // resolution_agent: ONLY for resolution clients
  if (['resolution', 'full'].includes(t)) {
    if (client && client.case_type === 'resolution') {
      agents.push('resolution_agent');
      reasons.push('resolution_agent: client.case_type=resolution');
    } else {
      reasons.push('resolution_agent: SKIPPED — client.case_type !== resolution');
    }
  }

  if (['legal', 'entity', 'trust', 'poa', 'contract', 'full'].includes(t)) {
    agents.push('legal_agent');
    reasons.push('legal_agent: legal/entity/trust/POA analysis');
  }

  // QA reviewer runs after substantive agents
  if (agents.some((a) => ['tax_analyst', 'legal_agent', 'document_extractor'].includes(a))) {
    agents.push('qa_reviewer');
    reasons.push('qa_reviewer: post-run quality gate');
  }

  // gamma_agent: ONLY when explicitly requested
  if (hermesOptions.requestGamma === true) {
    agents.push('gamma_agent');
    reasons.push('gamma_agent: explicitly requested');
  } else {
    reasons.push('gamma_agent: SKIPPED — not explicitly requested');
  }

  return { agents, reasons };
}

/**
 * Write an audit event to D1.
 */
async function writeAuditEvent(db, event) {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO audit_events (event_type, run_id, client_id, actor, description, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.event_type,
        event.run_id || null,
        event.client_id || null,
        event.actor || 'system',
        event.description,
        event.metadata_json ? JSON.stringify(event.metadata_json) : null
      )
      .run();
  } catch {
    // Non-fatal audit failure
  }
}

/**
 * Main Hermes orchestrator entry point.
 *
 * @param {object} params
 * @param {string} params.taskType - classify|extract|analysis|tax|resolution|legal|full
 * @param {number} [params.clientId]
 * @param {number} [params.documentId]
 * @param {object} params.input - Task-specific input payload
 * @param {string} [params.requestedBy] - Actor identifier for audit
 * @param {object} [params.hermesOptions] - { requestGamma?, forceRerun? }
 * @param {object} env - Cloudflare env bindings (DB, DOCS, PTS_KV)
 * @returns {Promise<object>} { runId, status, cached, result, requiresHumanReview, citations }
 */
export async function runHermes(params, env) {
  const {
    taskType,
    clientId,
    documentId,
    input = {},
    requestedBy = 'system',
    hermesOptions = {},
  } = params;

  const db = env && env.DB ? env.DB : null;
  const kv = env && env.PTS_KV ? env.PTS_KV : null;

  // 1. Compute SHA-256 input hash for deduplication
  const inputString = JSON.stringify({ taskType, clientId, documentId, input });
  const inputHash = await sha256(inputString);
  const inputSummary = `taskType=${taskType} clientId=${clientId || 'none'} documentId=${documentId || 'none'}`;

  // 2. Cache check — KV first (fast), then D1
  if (!hermesOptions.forceRerun) {
    // KV cache check
    if (kv) {
      try {
        const kvCached = await kv.get(`hermes:cache:${inputHash}`, 'json');
        if (kvCached) {
          await writeAuditEvent(db, {
            event_type: 'cache_hit',
            run_id: kvCached.runId,
            client_id: clientId,
            actor: requestedBy,
            description: `Cache hit (KV) for input_hash=${inputHash}`,
            metadata_json: { taskType, inputHash },
          });
          return { ...kvCached, cached: true, cache_source: 'kv' };
        }
      } catch {
        // KV unavailable — continue
      }
    }

    // D1 cache check
    if (db) {
      try {
        const existingRun = await db
          .prepare(
            `SELECT run_id, status, output_json, requires_human_review
             FROM agent_runs WHERE input_hash = ? AND status = 'completed'
             ORDER BY created_at DESC LIMIT 1`
          )
          .bind(inputHash)
          .first();

        if (existingRun) {
          const cachedResult = {
            runId: existingRun.run_id,
            status: existingRun.status,
            cached: true,
            cache_source: 'd1',
            result: existingRun.output_json ? JSON.parse(existingRun.output_json) : null,
            requiresHumanReview: Boolean(existingRun.requires_human_review),
            citations: [],
          };

          await writeAuditEvent(db, {
            event_type: 'cache_hit',
            run_id: existingRun.run_id,
            client_id: clientId,
            actor: requestedBy,
            description: `Cache hit (D1) for input_hash=${inputHash}`,
            metadata_json: { taskType, inputHash },
          });

          return cachedResult;
        }
      } catch {
        // D1 unavailable — continue
      }
    }
  }

  // 3. Create new run
  const runId = generateRunId();
  const startedAt = new Date().toISOString();

  // Write initial agent_run record
  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO agent_runs
             (run_id, client_id, document_id, agent_name, status, input_hash, input_summary, started_at)
           VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`
        )
        .bind(runId, clientId || null, documentId || null, 'hermes', inputHash, inputSummary, startedAt)
        .run();
    } catch {
      // Non-fatal
    }
  }

  await writeAuditEvent(db, {
    event_type: 'run_started',
    run_id: runId,
    client_id: clientId,
    actor: requestedBy,
    description: `Hermes run started: ${inputSummary}`,
    metadata_json: { taskType, inputHash, hermesOptions },
  });

  // 4. Load client record for routing decisions
  let client = null;
  if (db && clientId) {
    try {
      client = await db
        .prepare('SELECT id, name, type, case_type FROM clients WHERE id = ?')
        .bind(clientId)
        .first();
    } catch {
      // Graceful degradation
    }
  }

  // 5. Route to agents
  const { agents: agentsToRun, reasons } = routeAgents(taskType, client, hermesOptions);

  // Write route_decision
  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO route_decisions (run_id, input_type, chosen_agents, cache_hit, reason)
           VALUES (?, ?, ?, 0, ?)`
        )
        .bind(runId, taskType, JSON.stringify(agentsToRun), reasons.join('; '))
        .run();
    } catch {
      // Non-fatal
    }
  }

  // 6. Execute agents
  const agentResults = {};
  const allCitations = [];
  let requiresHumanReview = false;
  let agentOutputsForQA = [];

  // Build shared context
  const baseContext = {
    env,
    db,
    kv,
    clientId,
    documentId,
    client,
    runId,
    hermesOptions,
  };

  for (const agentName of agentsToRun) {
    const agentDef = AGENT_REGISTRY[agentName];
    if (!agentDef) continue;

    // QA reviewer gets all previous outputs
    let agentInput = input;
    if (agentName === 'qa_reviewer') {
      agentInput = {
        ...input,
        agentOutputs: agentOutputsForQA,
      };
    }

    let agentResult;
    try {
      agentResult = await agentDef.run(baseContext, agentInput);
    } catch (err) {
      agentResult = {
        error: err && err.message ? err.message : 'agent execution error',
        requires_human_review: true,
      };
    }

    agentResults[agentName] = agentResult;

    // Collect citations
    if (agentResult && Array.isArray(agentResult.citations)) {
      allCitations.push(...agentResult.citations);
    }

    // Track human review requirement
    if (agentResult && (agentResult.requires_human_review || agentResult.requires_attorney_review)) {
      requiresHumanReview = true;
    }

    // Accumulate for QA
    if (agentName !== 'qa_reviewer') {
      agentOutputsForQA.push({ agentName, result: agentResult });
    }

    // Write per-agent audit event
    await writeAuditEvent(db, {
      event_type: 'agent_completed',
      run_id: runId,
      client_id: clientId,
      actor: 'system',
      description: `Agent ${agentName} completed`,
      metadata_json: {
        agentName,
        skipped: agentResult && agentResult.skipped,
        requires_human_review: agentResult && agentResult.requires_human_review,
        citation_count: agentResult && Array.isArray(agentResult.citations) ? agentResult.citations.length : 0,
      },
    });
  }

  // 7. Build final output
  const completedAt = new Date().toISOString();
  const finalResult = {
    runId,
    taskType,
    clientId: clientId || null,
    documentId: documentId || null,
    agents_run: agentsToRun,
    agent_results: agentResults,
    summary: buildSummary(agentResults, agentsToRun),
  };

  const response = {
    runId,
    status: 'completed',
    cached: false,
    result: finalResult,
    requiresHumanReview,
    citations: allCitations,
  };

  // 8. Persist completed run to D1
  if (db) {
    try {
      await db
        .prepare(
          `UPDATE agent_runs SET
             status = 'completed',
             output_json = ?,
             requires_human_review = ?,
             completed_at = ?
           WHERE run_id = ?`
        )
        .bind(JSON.stringify(finalResult), requiresHumanReview ? 1 : 0, completedAt, runId)
        .run();
    } catch {
      // Non-fatal
    }
  }

  // 9. Populate KV cache
  if (kv) {
    try {
      await kv.put(`hermes:cache:${inputHash}`, JSON.stringify(response), { expirationTtl: 86400 });
    } catch {
      // Non-fatal
    }
  }

  await writeAuditEvent(db, {
    event_type: 'run_completed',
    run_id: runId,
    client_id: clientId,
    actor: requestedBy,
    description: `Hermes run completed: ${inputSummary}`,
    metadata_json: { taskType, requiresHumanReview, citationCount: allCitations.length },
  });

  return response;
}

function buildSummary(agentResults, agentsRun) {
  const summary = {};
  if (agentResults.intake_classifier) {
    summary.classification = agentResults.intake_classifier.classification;
  }
  if (agentResults.document_extractor) {
    summary.document_type = agentResults.document_extractor.fields && agentResults.document_extractor.fields.document_type;
    summary.extraction_confidence = agentResults.document_extractor.confidence;
  }
  if (agentResults.tax_analyst) {
    summary.workpaper_status = agentResults.tax_analyst.workpaper_status;
    summary.findings_count = Array.isArray(agentResults.tax_analyst.findings) ? agentResults.tax_analyst.findings.length : 0;
  }
  if (agentResults.qa_reviewer) {
    summary.qa_status = agentResults.qa_reviewer.qa_status;
    summary.qa_flags = agentResults.qa_reviewer.summary;
  }
  if (agentResults.resolution_agent && !agentResults.resolution_agent.skipped) {
    summary.resolution_status = agentResults.resolution_agent.credentialed_only ? 'credentialed_only' : 'active';
  }
  summary.agents_run = agentsRun.length;
  return summary;
}
