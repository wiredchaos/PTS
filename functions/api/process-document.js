import { jsonResponse, readJsonBody, validationError } from '../_lib/http.js';

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.DB) {
    return jsonResponse(503, { ok: false, error: 'Missing DB binding' });
  }

  const body = await readJsonBody(context.request);
  if (!body) return validationError('JSON body required');

  const documentId = Number(body.documentId);
  if (!Number.isInteger(documentId) || documentId <= 0) return validationError('valid documentId is required');

  const document = await env.DB
    .prepare('SELECT id, client_id, tax_year, classification FROM documents WHERE id = ?')
    .bind(documentId)
    .first();

  if (!document) return jsonResponse(404, { ok: false, error: 'Document not found' });

  const extracted = {
    source: 'deterministic-placeholder',
    taxSignals: [`classification:${document.classification}`],
    notes: 'External extraction services are not configured. Replace placeholder processor in production.'
  };

  await env.DB.prepare('UPDATE documents SET processing_status = ? WHERE id = ?').bind('processed', documentId).run();
  await env.DB
    .prepare('UPDATE processing_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE document_id = ? AND status != ?')
    .bind('processed', documentId, 'processed')
    .run();

  return jsonResponse(200, {
    ok: true,
    processing: {
      documentId,
      state: 'processed',
      extracted
    }
  });
}
