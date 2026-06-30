/**
 * POST /api/hermes/cache/clear
 * Clears the KV cache for a specific input hash or all Hermes cache entries.
 */
import { jsonResponse, readJsonBody, validationError } from '../../../_lib/http.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PTS_KV) {
    return jsonResponse(503, { ok: false, error: 'Missing PTS_KV binding' });
  }

  const body = await readJsonBody(request);
  if (!body) return validationError('JSON body required');

  const { inputHash, runId } = body;

  if (!inputHash && !runId) {
    return validationError('inputHash or runId is required');
  }

  let cleared = 0;

  if (inputHash) {
    if (typeof inputHash !== 'string' || !/^[0-9a-f]{64}$/i.test(inputHash)) {
      return validationError('inputHash must be a valid SHA-256 hex string');
    }
    try {
      await env.PTS_KV.delete(`hermes:cache:${inputHash}`);
      cleared++;
    } catch {
      return jsonResponse(500, { ok: false, error: 'Failed to clear KV cache entry' });
    }
  }

  // Write audit event if DB available
  if (env.DB) {
    try {
      await env.DB
        .prepare(
          `INSERT INTO audit_events (event_type, run_id, actor, description, metadata_json)
           VALUES ('cache_clear', ?, 'api', ?, ?)`
        )
        .bind(runId || null, `Cache cleared for inputHash=${inputHash || 'n/a'}`, JSON.stringify({ inputHash, runId }))
        .run();
    } catch {
      // Non-fatal
    }
  }

  return jsonResponse(200, {
    ok: true,
    cleared,
    inputHash: inputHash || null,
    runId: runId || null,
  });
}
