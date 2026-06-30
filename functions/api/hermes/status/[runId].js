/**
 * GET /api/hermes/status/:runId
 * Returns the status and result of a Hermes run by runId.
 */
import { jsonResponse } from '../../../_lib/http.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const runId = params && params.runId;

  if (!runId) return jsonResponse(400, { ok: false, error: 'runId is required' });

  if (!env.DB) {
    return jsonResponse(503, { ok: false, error: 'Missing DB binding' });
  }

  try {
    const run = await env.DB
      .prepare(
        `SELECT run_id, client_id, document_id, agent_name, status,
                input_summary, output_json, confidence, requires_human_review,
                skipped_reason, started_at, completed_at, created_at
         FROM agent_runs WHERE run_id = ? LIMIT 1`
      )
      .bind(runId)
      .first();

    if (!run) {
      return jsonResponse(404, { ok: false, error: `Run not found: ${runId}` });
    }

    // Fetch citations for this run
    const citationsResult = await env.DB
      .prepare('SELECT citation_type, reference, description, url FROM citations WHERE run_id = ?')
      .bind(runId)
      .all();

    return jsonResponse(200, {
      ok: true,
      run: {
        runId: run.run_id,
        clientId: run.client_id,
        documentId: run.document_id,
        agentName: run.agent_name,
        status: run.status,
        inputSummary: run.input_summary,
        result: run.output_json ? JSON.parse(run.output_json) : null,
        confidence: run.confidence,
        requiresHumanReview: Boolean(run.requires_human_review),
        skippedReason: run.skipped_reason,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
        citations: (citationsResult && citationsResult.results) || [],
      },
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Internal error' });
  }
}
