import { classifyDocument, buildR2Key } from '../_lib/documents.js';
import { jsonResponse, validationError } from '../_lib/http.js';
import { ensureClientExists, insertDocument } from '../_lib/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.UPLOADS) {
    return jsonResponse(503, { ok: false, error: 'Missing DB or UPLOADS binding' });
  }

  const form = await request.formData();
  const file = form.get('file');
  const clientId = Number(form.get('clientId'));
  const taxYear = Number(form.get('taxYear'));

  if (!(file instanceof File)) return validationError('file is required');
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000) return validationError('valid taxYear is required');

  const client = await ensureClientExists(env.DB, clientId);
  if (!client) return jsonResponse(404, { ok: false, error: 'Client not found' });

  const { extension, classification } = classifyDocument({ filename: file.name, mimeType: file.type });
  const storageKey = buildR2Key({ clientId, taxYear, filename: file.name });

  await env.UPLOADS.put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' }
  });

  const documentId = await insertDocument(env.DB, {
    clientId,
    taxYear,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    extension,
    storageKey,
    size: file.size,
    classification
  });

  await env.DB.prepare('INSERT INTO processing_queue (document_id, status) VALUES (?, ?)').bind(documentId, 'queued').run();

  return jsonResponse(201, {
    ok: true,
    document: {
      id: documentId,
      clientId,
      taxYear,
      filename: file.name,
      mimeType: file.type,
      extension,
      classification,
      processingStatus: 'queued'
    }
  });
}
