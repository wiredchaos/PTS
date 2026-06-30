/**
 * GET /api/hermes/usage
 * Returns model usage and cost summary from model_usage table.
 */
import { jsonResponse } from '../../_lib/http.js';

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DB) {
    return jsonResponse(503, { ok: false, error: 'Missing DB binding' });
  }

  try {
    const usageRows = await env.DB
      .prepare(
        `SELECT provider, model,
                COUNT(*) as call_count,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(estimated_cost_usd) as total_cost_usd
         FROM model_usage
         GROUP BY provider, model
         ORDER BY total_cost_usd DESC`
      )
      .all();

    const runStats = await env.DB
      .prepare(
        `SELECT status, COUNT(*) as count FROM agent_runs GROUP BY status`
      )
      .all();

    const auditStats = await env.DB
      .prepare(
        `SELECT event_type, COUNT(*) as count FROM audit_events
         WHERE created_at >= datetime('now', '-30 days')
         GROUP BY event_type ORDER BY count DESC`
      )
      .all();

    const totalCost = ((usageRows.results || []).reduce(
      (sum, row) => sum + (row.total_cost_usd || 0), 0
    )).toFixed(6);

    return jsonResponse(200, {
      ok: true,
      usage_by_model: usageRows.results || [],
      run_stats: runStats.results || [],
      audit_stats_30d: auditStats.results || [],
      total_estimated_cost_usd: parseFloat(totalCost),
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Internal error' });
  }
}
