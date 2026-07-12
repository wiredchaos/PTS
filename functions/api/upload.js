import { classifyDocument, buildR2Key } from '../_lib/documents.js';
import { classifyIntakeDocument, sha256Hex } from '../_lib/intake.js';
import { jsonResponse, validationError } from '../_lib/http.js';
import { ensureClientExists, findDuplicateDocument, insertDocument, enqueueDocument } from '../_lib/db.js';

const MAX_FUTURE_TAX_YEAR_OFFSET = 2; // allows near-term planning/estimated filings

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.DOCS) {
    return jsonResponse(503, { ok: false, error: 'Missing DB or DOCS binding' });
  }

  const form = await request.formData();
  const file = form.get('file');
  const clientId = Number(form.get('clientId'));
  const taxYear = Number(form.get('taxYear'));
  const maxTaxYear = new Date().getUTCFullYear() + MAX_FUTURE_TAX_YEAR_OFFSET;

  if (!(file instanceof File)) return validationError('file is required');
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > maxTaxYear) return validationError('valid taxYear is required');

  const client = await ensureClientExists(env.DB, clientId);
  if (!client) return jsonResponse(404, { ok: false, error: 'Client not found' });

  const bytes = await file.arrayBuffer();
  const fileHash = await sha256Hex(bytes);
  const duplicate = await findDuplicateDocument(env.DB, { clientId, taxYear, fileHash });
  if (duplicate) {
    return jsonResponse(200, {
      ok: true,
      duplicate: true,
      message: 'Duplicate already received. No new Hermes intake work was queued.',
      document: {
        id: duplicate.id,
        clientId,
        taxYear,
        filename: duplicate.original_filename,
        processingStatus: duplicate.processing_status || 'queued',
      },
    });
  }

  const { extension, classification } = classifyDocument({ filename: file.name, mimeType: file.type });
  const intake = classifyIntakeDocument({ filename: file.name, mimeType: file.type, metadata: { extension } });
  const storageKey = buildR2Key({ clientId, taxYear, filename: file.name });

  await env.DOCS.put(storageKey, bytes, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { fileHash, clientId: String(clientId), taxYear: String(taxYear) },
  });

  const documentId = await insertDocument(env.DB, {
    clientId,
    taxYear,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    extension,
    storageKey,
    size: file.size,
    classification: intake.classification || classification,
    fileHash,
  });

  await enqueueDocument(env.DB, documentId);

  return jsonResponse(201, {
    ok: true,
    duplicate: false,
    message: 'Upload complete. Stored securely and queued for Hermes intake.',
    document: {
      id: documentId,
      clientId,
      taxYear,
      filename: file.name,
      mimeType: file.type,
      extension,
      classification: intake.classification,
      requiresHumanReview: intake.requiresHumanReview,
      processingStatus: 'queued',
    },
  });
}
