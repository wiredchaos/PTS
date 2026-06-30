/**
 * GET /api/hermes/history/:clientId
 * Returns the Hermes run history for a given client.
 */
import { jsonResponse } from '../../../_lib/http.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const clientId = params && params.clientId ? Number(params.clientId) : NaN;

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return jsonResponse(400, { ok: false, error: 'valid clientId is required' });
  }

  if (!env.DB) {
    return jsonResponse(503, { ok: false, error: 'Missing DB binding' });
  }

  try {
    const runs = await env.DB
      .prepare(
        `SELECT run_id, agent_name, status, input_summary,
                requires_human_review, started_at, completed_at, created_at
         FROM agent_runs WHERE client_id = ?
         ORDER BY created_at DESC LIMIT 50`
      )
      .bind(clientId)
      .all();

    return jsonResponse(200, {
      ok: true,
      clientId,
      runs: (runs.results || []).map((r) => ({
        runId: r.run_id,
        agentName: r.agent_name,
        status: r.status,
        inputSummary: r.input_summary,
        requiresHumanReview: Boolean(r.requires_human_review),
        startedAt: r.started_at,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Internal error' });
  }
}
