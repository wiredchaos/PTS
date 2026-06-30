import { jsonResponse, validationError } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return jsonResponse(503, { ok: false, error: 'Missing DB binding' });

  const url = new URL(request.url);
  const clientId = Number(url.searchParams.get('clientId'));
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');

  const row = await env.DB
    .prepare('SELECT url, status, created_at FROM gamma_presentations WHERE client_id = ? ORDER BY id DESC LIMIT 1')
    .bind(clientId)
    .first();

  if (!row || !row.url) {
    return jsonResponse(200, {
      ok: true,
      exists: false,
      message: 'Deck not generated yet.'
    });
  }

  return jsonResponse(200, {
    ok: true,
    exists: true,
    url: row.url,
    status: row.status,
    createdAt: row.created_at
  });
}
