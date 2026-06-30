import { classifyDocument, buildR2Key } from '../_lib/documents.js';
import { jsonResponse, validationError } from '../_lib/http.js';
import { ensureClientExists, insertDocument } from '../_lib/db.js';

const MAX_FUTURE_TAX_YEAR_OFFSET = 2; // allows near-term planning/estimated filings

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.UPLOADS) {
    return jsonResponse(503, { ok: false, error: 'Missing DB or UPLOADS binding' });
  }

  const form = await request.formData();
  const files = form.getAll('files');
  const clientId = Number(form.get('clientId'));
  const taxYear = Number(form.get('taxYear'));
  const maxTaxYear = new Date().getUTCFullYear() + MAX_FUTURE_TAX_YEAR_OFFSET;

  if (!files.length) return validationError('files are required');
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > maxTaxYear) return validationError('valid taxYear is required');

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

  for (const file of files) {
    if (!(file instanceof File)) {
      failed += 1;
      results.push({ ok: false, error: 'Invalid file payload' });
      continue;
    }

    try {
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

      completed += 1;
      results.push({ ok: true, documentId, filename: file.name, classification });
    } catch (error) {
      failed += 1;
      results.push({ ok: false, filename: file.name, error: String(error) });
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
