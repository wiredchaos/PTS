import { classifyDocument, buildR2Key } from '../_lib/documents.js';
import { jsonResponse, validationError } from '../_lib/http.js';
import { ensureClientExists, insertDocument } from '../_lib/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.UPLOADS) {
    return jsonResponse(503, { ok: false, error: 'Missing DB or UPLOADS binding' });
  }

  const form = await request.formData();
  const files = form.getAll('files');
  const clientId = Number(form.get('clientId'));
  const taxYear = Number(form.get('taxYear'));

  if (!files.length) return validationError('files are required');
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000) return validationError('valid taxYear is required');

  const client = await ensureClientExists(env.DB, clientId);
  if (!client) return jsonResponse(404, { ok: false, error: 'Client not found' });

  const job = await env.DB
    .prepare('INSERT INTO upload_jobs (client_id, tax_year, request_id, total_files, status) VALUES (?, ?, ?, ?, ?)')
    .bind(clientId, taxYear, crypto.randomUUID(), files.length, 'processing')
    .run();

  const jobId = job.meta.last_row_id;
  const results = [];
  let completed = 0;
  let failed = 0;

  for (const candidate of files) {
    if (!(candidate instanceof File)) {
      failed += 1;
      results.push({ ok: false, error: 'Invalid file payload' });
      continue;
    }

    try {
      const { extension, classification } = classifyDocument({ filename: candidate.name, mimeType: candidate.type });
      const storageKey = buildR2Key({ clientId, taxYear, filename: candidate.name });
      await env.UPLOADS.put(storageKey, await candidate.arrayBuffer(), {
        httpMetadata: { contentType: candidate.type || 'application/octet-stream' }
      });

      const documentId = await insertDocument(env.DB, {
        clientId,
        taxYear,
        filename: candidate.name,
        mimeType: candidate.type || 'application/octet-stream',
        extension,
        storageKey,
        size: candidate.size,
        classification
      });

      await env.DB.prepare('INSERT INTO processing_queue (document_id, status) VALUES (?, ?)').bind(documentId, 'queued').run();

      completed += 1;
      results.push({ ok: true, documentId, filename: candidate.name, classification });
    } catch (error) {
      failed += 1;
      results.push({ ok: false, filename: candidate.name, error: String(error) });
    }
  }

  await env.DB
    .prepare('UPDATE upload_jobs SET completed_files = ?, failed_files = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(completed, failed, failed > 0 ? 'completed_with_errors' : 'completed', jobId)
    .run();

  return jsonResponse(200, {
    ok: true,
    jobId,
    summary: { total: files.length, completed, failed },
    files: results
  });
}
