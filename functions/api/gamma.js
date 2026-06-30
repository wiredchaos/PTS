import { jsonResponse, readJsonBody, validationError } from '../_lib/http.js';

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.DB) return jsonResponse(503, { ok: false, error: 'Missing DB binding' });

  const body = await readJsonBody(context.request);
  if (!body) return validationError('JSON body required');

  const clientId = Number(body.clientId);
  const gammaUrl = typeof body.gammaUrl === 'string' ? body.gammaUrl.trim() : '';
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!gammaUrl) {
    await env.DB
      .prepare('INSERT INTO gamma_presentations (client_id, url, status, source) VALUES (?, NULL, ?, ?)')
      .bind(clientId, 'placeholder', 'pending-credentials')
      .run();

    return jsonResponse(200, {
      ok: true,
      gamma: { clientId, status: 'placeholder', message: 'Deck not generated yet. Add generated URL when available.' }
    });
  }

  await env.DB
    .prepare('INSERT INTO gamma_presentations (client_id, url, status, source) VALUES (?, ?, ?, ?)')
    .bind(clientId, gammaUrl, 'generated', 'agent-or-admin')
    .run();

  return jsonResponse(200, { ok: true, gamma: { clientId, status: 'generated', url: gammaUrl } });
}
