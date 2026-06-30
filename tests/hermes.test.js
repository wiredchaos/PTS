/**
 * tests/hermes.test.js — Hermes Core v1 tests
 *
 * Uses node:test (built-in, no dependencies required).
 * Tests run in a Node.js environment without Cloudflare bindings.
 * Mocks are used in place of D1/KV.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { run as runIntakeClassifier } from '../functions/_lib/agents/intake_classifier.js';
import { run as runResolutionAgent } from '../functions/_lib/agents/resolution_agent.js';
import { run as runGammaAgent } from '../functions/_lib/agents/gamma_agent.js';
import { run as runQaReviewer } from '../functions/_lib/agents/qa_reviewer.js';
import { runHermes } from '../functions/_lib/hermes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock D1 database that stores key-value data in memory.
 * Supports the subset of D1 APIs used by Hermes agents.
 */
function makeMockDb(initialRuns = []) {
  const rows = { agent_runs: [...initialRuns], citations: [], agent_memory: [], audit_events: [], route_decisions: [] };

  function makeStmt(sql) {
    let boundValues = [];
    return {
      bind(...args) { boundValues = args; return this; },
      async first() {
        // agent_runs SELECT by input_hash
        if (sql.includes('agent_runs') && sql.includes('input_hash')) {
          const hash = boundValues[0];
          return rows.agent_runs.find((r) => r.input_hash === hash && r.status === 'completed') || null;
        }
        // clients SELECT
        if (sql.includes('clients WHERE id')) {
          return null;
        }
        // agent_memory SELECT
        if (sql.includes('agent_memory')) {
          return null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        // Track INSERT into agent_runs
        if (sql.includes('INSERT INTO agent_runs')) {
          rows.agent_runs.push({
            run_id: boundValues[0],
            client_id: boundValues[1],
            document_id: boundValues[2],
            agent_name: boundValues[3],
            status: 'running',
            input_hash: boundValues[4],
            input_summary: boundValues[5],
            started_at: boundValues[6],
          });
        }
        // Track UPDATE agent_runs
        if (sql.includes('UPDATE agent_runs') && sql.includes('completed')) {
          const run = rows.agent_runs.find((r) => r.run_id === boundValues[3]);
          if (run) {
            run.output_json = boundValues[0];
            run.requires_human_review = boundValues[1];
            run.completed_at = boundValues[2];
            run.status = 'completed';
          }
        }
        return { meta: { last_row_id: 1 } };
      },
    };
  }

  return {
    prepare(sql) { return makeStmt(sql); },
    _rows: rows,
  };
}

/**
 * Build a mock KV namespace.
 */
function makeMockKv(initial = {}) {
  const store = { ...initial };
  return {
    async get(key, type) {
      const val = store[key];
      if (val === undefined) return null;
      if (type === 'json') return typeof val === 'string' ? JSON.parse(val) : val;
      return val;
    },
    async put(key, value) { store[key] = value; },
    async delete(key) { delete store[key]; },
    _store: store,
  };
}

// ---------------------------------------------------------------------------
// Test 1: intake_classifier correctly classifies known MIME types without LLM
// ---------------------------------------------------------------------------

test('intake_classifier: classifies PDF by MIME without LLM', async () => {
  const result = await runIntakeClassifier({}, { filename: 'tax_return.pdf', mimeType: 'application/pdf' });
  assert.equal(result.classification, 'pdf');
  assert.equal(result.llm_used, false);
  assert.equal(result.method, 'mime');
  assert.equal(result.requires_human_review, false);
});

test('intake_classifier: classifies docx by extension when MIME is octet-stream', async () => {
  const result = await runIntakeClassifier({}, { filename: 'letter.docx', mimeType: 'application/octet-stream' });
  assert.equal(result.classification, 'document');
  assert.equal(result.llm_used, false);
  assert.equal(result.method, 'extension');
});

test('intake_classifier: classifies Excel spreadsheet by MIME', async () => {
  const result = await runIntakeClassifier({}, { filename: 'financials.xlsx', mimeType: 'application/vnd.ms-excel' });
  assert.equal(result.classification, 'spreadsheet');
  assert.equal(result.llm_used, false);
});

test('intake_classifier: classifies image by MIME prefix', async () => {
  const result = await runIntakeClassifier({}, { filename: 'scan.tiff', mimeType: 'image/tiff' });
  assert.equal(result.classification, 'image');
  assert.equal(result.llm_used, false);
});

test('intake_classifier: unknown type returns other + slm_hint + requires_human_review', async () => {
  const result = await runIntakeClassifier({}, { filename: 'mystery.xyz', mimeType: 'application/x-unknown-binary' });
  assert.equal(result.classification, 'other');
  assert.equal(result.llm_used, false);
  assert.equal(result.requires_human_review, true);
  assert.ok(result.slm_hint, 'Should include slm_hint for unknown types');
});

// ---------------------------------------------------------------------------
// Test 2: resolution_agent skips when case_type !== 'resolution'
// ---------------------------------------------------------------------------

test('resolution_agent: skips when client.case_type is standard', async () => {
  const context = { client: { id: 1, case_type: 'standard' }, env: {} };
  const result = await runResolutionAgent(context, {});
  assert.equal(result.skipped, true);
  assert.ok(result.skipped_reason.includes('case_type=resolution'));
});

test('resolution_agent: skips when no client is provided', async () => {
  const context = { client: null, env: {} };
  const result = await runResolutionAgent(context, {});
  assert.equal(result.skipped, true);
});

test('resolution_agent: returns credentialed_only when connector not configured', async () => {
  const context = { client: { id: 2, case_type: 'resolution' }, env: {} };
  const result = await runResolutionAgent(context, {});
  assert.equal(result.credentialed_only, true);
  assert.equal(result.skipped, undefined);
  assert.equal(result.requires_human_review, true);
  assert.ok(Array.isArray(result.citations) && result.citations.length > 0, 'Should include citations even in placeholder mode');
});

test('resolution_agent: includes resolution checklist', async () => {
  const context = { client: { id: 3, case_type: 'resolution' }, env: {} };
  const result = await runResolutionAgent(context, { noticeCodes: [] });
  assert.ok(Array.isArray(result.resolution_checklist));
  assert.ok(result.resolution_checklist.length > 0);
});

// ---------------------------------------------------------------------------
// Test 3: gamma_agent skips unless explicitly requested
// ---------------------------------------------------------------------------

test('gamma_agent: skips when requestGamma is not set', async () => {
  const context = { hermesOptions: {}, env: {} };
  const result = await runGammaAgent(context, { clientId: 1 });
  assert.equal(result.skipped, true);
  assert.ok(result.skipped_reason.includes('requestGamma'));
});

test('gamma_agent: skips when hermesOptions is undefined', async () => {
  const context = { hermesOptions: undefined, env: {} };
  const result = await runGammaAgent(context, { clientId: 1 });
  assert.equal(result.skipped, true);
});

test('gamma_agent: runs when requestGamma is true', async () => {
  const context = { hermesOptions: { requestGamma: true }, clientId: 1, env: {} };
  const result = await runGammaAgent(context, { clientId: 1, taxYear: 2024 });
  assert.equal(result.skipped, undefined);
  assert.equal(result.ok, true);
  assert.ok(result.gamma_prompt);
});

test('gamma_agent: saves URL placeholder when no gammaUrl provided', async () => {
  let inserted = null;
  const mockDb = {
    prepare(sql) {
      return {
        bind(...args) { inserted = { sql, args }; return this; },
        async run() { return { meta: { last_row_id: 1 } }; },
      };
    },
  };
  const context = { hermesOptions: { requestGamma: true }, clientId: 1, db: mockDb, env: {} };
  const result = await runGammaAgent(context, { clientId: 1 });
  assert.equal(result.status, 'placeholder');
  assert.ok(inserted, 'Should have called db.prepare');
});

// ---------------------------------------------------------------------------
// Test 4: qa_reviewer flags missing citations
// ---------------------------------------------------------------------------

test('qa_reviewer: flags tax_analyst output missing citations', async () => {
  const agentOutputs = [
    {
      agentName: 'tax_analyst',
      result: {
        findings: [{ finding: 'Some finding', supported: true }],
        citations: [],
        requires_human_review: false,
      },
    },
  ];
  const result = await runQaReviewer({}, { agentOutputs, requiredCitationAgents: ['tax_analyst'] });
  const citationFlag = result.flags.find((f) => f.issue === 'missing_citations');
  assert.ok(citationFlag, 'Should flag missing citations');
  assert.equal(citationFlag.severity, 'high');
  assert.equal(result.qa_status, 'warn');
});

test('qa_reviewer: passes when citations are present', async () => {
  const agentOutputs = [
    {
      agentName: 'tax_analyst',
      result: {
        findings: [{ finding: 'Wages taxable', supported: true }],
        citations: [{ type: 'IRC', reference: 'IRC § 61(a)(1)', description: 'Gross income.' }],
        requires_human_review: false,
      },
    },
  ];
  const result = await runQaReviewer({}, { agentOutputs, requiredCitationAgents: ['tax_analyst'] });
  assert.equal(result.qa_status, 'pass');
  assert.equal(result.flags.filter((f) => f.issue === 'missing_citations').length, 0);
});

test('qa_reviewer: flags legal_agent missing attorney review flag', async () => {
  const agentOutputs = [
    {
      agentName: 'legal_agent',
      result: {
        requires_attorney_review: false,
        citations: [{ type: 'IRC', reference: 'IRC § 701', description: 'Partnership.' }],
      },
    },
  ];
  const result = await runQaReviewer({}, { agentOutputs });
  const flag = result.flags.find((f) => f.issue === 'missing_attorney_review_flag');
  assert.ok(flag, 'Should flag missing attorney review');
  assert.equal(flag.severity, 'critical');
  assert.equal(result.qa_status, 'fail');
});

test('qa_reviewer: flags suspicious citation references', async () => {
  const agentOutputs = [
    {
      agentName: 'tax_analyst',
      result: {
        findings: [],
        citations: [{ type: 'IRC', reference: 'placeholder', description: 'Test.' }],
        requires_human_review: false,
      },
    },
  ];
  const result = await runQaReviewer({}, { agentOutputs, requiredCitationAgents: ['tax_analyst'] });
  const hallucinationFlag = result.flags.find((f) => f.issue === 'hallucination_risk');
  assert.ok(hallucinationFlag, 'Should flag suspicious citation');
});

// ---------------------------------------------------------------------------
// Test 5: Duplicate input_hash returns cached: true without re-running
// ---------------------------------------------------------------------------

test('runHermes: duplicate input_hash returns cached:true from D1', async () => {
  // Pre-populate a completed run with known hash
  const inputHash = await computeSha256(JSON.stringify({
    taskType: 'classify',
    clientId: undefined,
    documentId: undefined,
    input: { filename: 'test.pdf', mimeType: 'application/pdf' },
  }));

  const completedRun = {
    run_id: 'run_cached_001',
    status: 'completed',
    input_hash: inputHash,
    output_json: JSON.stringify({ classification: 'pdf' }),
    requires_human_review: 0,
    input_summary: 'taskType=classify clientId=none documentId=none',
  };

  const mockDb = makeMockDb([completedRun]);
  const mockKv = makeMockKv();

  const env = { DB: mockDb, PTS_KV: mockKv };

  const result = await runHermes(
    {
      taskType: 'classify',
      input: { filename: 'test.pdf', mimeType: 'application/pdf' },
    },
    env
  );

  assert.equal(result.cached, true);
  assert.equal(result.runId, 'run_cached_001');
});

test('runHermes: different input runs fresh (not cached)', async () => {
  const mockDb = makeMockDb([]);
  const mockKv = makeMockKv();
  const env = { DB: mockDb, PTS_KV: mockKv };

  const result = await runHermes(
    {
      taskType: 'classify',
      input: { filename: 'new_file.pdf', mimeType: 'application/pdf' },
    },
    env
  );

  assert.equal(result.cached, false);
  assert.equal(result.status, 'completed');
  assert.ok(result.runId);
});

test('runHermes: forceRerun bypasses cache', async () => {
  // Put a value in KV cache that would normally be hit
  const inputHash = await computeSha256(JSON.stringify({
    taskType: 'classify',
    clientId: undefined,
    documentId: undefined,
    input: { filename: 'cached.pdf', mimeType: 'application/pdf' },
  }));

  const cachedResponse = {
    runId: 'run_kv_cached',
    status: 'completed',
    cached: true,
    result: {},
    requiresHumanReview: false,
    citations: [],
  };

  const mockDb = makeMockDb([]);
  const mockKv = makeMockKv({ [`hermes:cache:${inputHash}`]: JSON.stringify(cachedResponse) });
  const env = { DB: mockDb, PTS_KV: mockKv };

  const result = await runHermes(
    {
      taskType: 'classify',
      input: { filename: 'cached.pdf', mimeType: 'application/pdf' },
      hermesOptions: { forceRerun: true },
    },
    env
  );

  // Should run fresh, not return the cached value
  assert.equal(result.cached, false);
  assert.notEqual(result.runId, 'run_kv_cached');
});

// ---------------------------------------------------------------------------
// Test 6: runHermes works without any bindings (graceful degradation)
// ---------------------------------------------------------------------------

test('runHermes: works without DB or KV bindings', async () => {
  const result = await runHermes(
    {
      taskType: 'classify',
      input: { filename: 'test.xlsx', mimeType: 'application/vnd.ms-excel' },
    },
    {} // empty env — no bindings
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.cached, false);
  assert.ok(result.runId);
  // intake_classifier should still run
  assert.ok(result.result.agent_results.intake_classifier);
  assert.equal(result.result.agent_results.intake_classifier.classification, 'spreadsheet');
});

// ---------------------------------------------------------------------------
// Test 7: resolution_agent in full pipeline
// ---------------------------------------------------------------------------

test('runHermes: resolution_agent skipped in full pipeline for standard client', async () => {
  const mockDb = makeMockDb([]);
  const mockDb2 = {
    ...mockDb,
    prepare(sql) {
      const stmt = mockDb.prepare(sql);
      if (sql.includes('clients WHERE id')) {
        return {
          bind() { return this; },
          async first() { return { id: 1, name: 'Test Client', type: 'individual', case_type: 'standard' }; },
          async all() { return { results: [] }; },
          async run() { return { meta: { last_row_id: 1 } }; },
        };
      }
      return stmt;
    },
  };

  const env = { DB: mockDb2, PTS_KV: makeMockKv() };

  const result = await runHermes(
    { taskType: 'full', clientId: 1, input: { filename: 'w2.pdf', mimeType: 'application/pdf' } },
    env
  );

  const resolutionResult = result.result.agent_results.resolution_agent;
  assert.ok(resolutionResult === undefined || resolutionResult.skipped === true,
    'resolution_agent should not run or be skipped for standard client');
});

test('runHermes: resolution_agent runs for resolution client', async () => {
  const mockDb = makeMockDb([]);
  const mockDb2 = {
    ...mockDb,
    prepare(sql) {
      const stmt = mockDb.prepare(sql);
      if (sql.includes('clients WHERE id')) {
        return {
          bind() { return this; },
          async first() { return { id: 2, name: 'Resolution Client', type: 'individual', case_type: 'resolution' }; },
          async all() { return { results: [] }; },
          async run() { return { meta: { last_row_id: 1 } }; },
        };
      }
      return stmt;
    },
  };

  const env = { DB: mockDb2, PTS_KV: makeMockKv() };

  const result = await runHermes(
    { taskType: 'resolution', clientId: 2, input: {} },
    env
  );

  const resolutionResult = result.result.agent_results.resolution_agent;
  assert.ok(resolutionResult, 'resolution_agent should run for resolution client');
  assert.ok(resolutionResult.skipped !== true, 'Should not be skipped');
});

// ---------------------------------------------------------------------------
// Helper: SHA-256 (mirrors hermes.js implementation)
// ---------------------------------------------------------------------------

async function computeSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
