import { getDocumentById, upsertIntakeResult } from '../../../_lib/db.js';
import { classifyIntakeDocument } from '../../../_lib/intake.js';
import { jsonResponse, readJsonBody, validationError } from '../../../_lib/http.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.DOCS) return jsonResponse(503, { ok: false, error: 'Missing DB or DOCS binding' });

  const body = await readJsonBody(request);
  if (!body) return validationError('JSON body required');
  const documentId = Number(body.documentId);
  if (!Number.isInteger(documentId) || documentId <= 0) return validationError('documentId must be a positive integer');

  const document = await getDocumentById(env.DB, documentId);
  if (!document) return jsonResponse(404, { ok: false, error: 'Document not found' });

  const object = await env.DOCS.head(document.storage_key);
  if (!object) {
    await env.DB.prepare('UPDATE processing_queue SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE document_id = ?')
      .bind('failed', 'R2 object not found', documentId)
      .run();
    return jsonResponse(404, { ok: false, error: 'Stored document could not be found' });
  }

  const intake = classifyIntakeDocument({
    filename: document.original_filename,
    mimeType: document.mime_type,
    metadata: { extension: document.extension, size: document.file_size },
  });

  const resultId = await upsertIntakeResult(env.DB, document, intake);
  await env.DB.prepare('UPDATE documents SET classification = ?, processing_status = ?, duplicate_of_document_id = ? WHERE id = ?')
    .bind(intake.classification, document.duplicate_of_document_id ? 'duplicate' : 'intake_complete', document.duplicate_of_document_id || null, documentId)
    .run();
  await env.DB.prepare('UPDATE processing_queue SET status = ?, processor = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE document_id = ?')
    .bind(document.duplicate_of_document_id ? 'duplicate' : 'completed', 'hermes-intake', documentId)
    .run();

  return jsonResponse(200, {
    ok: true,
    message: intake.requiresHumanReview ? 'Intake completed. Needs tax team review.' : 'Intake completed and organized for tax team review.',
    intake: {
      id: resultId,
      documentId,
      classification: intake.classification,
      organizerCategory: intake.organizerCategory,
      workpaperBucket: intake.workpaperBucket,
      confidence: intake.confidence,
      duplicate: Boolean(document.duplicate_of_document_id),
      requiresHumanReview: intake.requiresHumanReview,
    },
  });
}
