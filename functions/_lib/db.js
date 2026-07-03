export async function ensureClientExists(db, clientId) {
  const row = await db
    .prepare('SELECT id, name, type, case_type FROM clients WHERE id = ?')
    .bind(clientId)
    .first();
  return row || null;
}

export async function findDuplicateDocument(db, { clientId, taxYear, fileHash }) {
  if (!fileHash) return null;
  return await db
    .prepare(`SELECT id, original_filename, storage_key, processing_status
      FROM documents
      WHERE client_id = ? AND tax_year = ? AND file_hash = ?
      ORDER BY id ASC
      LIMIT 1`)
    .bind(clientId, taxYear, fileHash)
    .first();
}

export async function insertDocument(db, doc) {
  const result = await db
    .prepare(`INSERT INTO documents (client_id, tax_year, original_filename, mime_type, extension, storage_key, file_size, upload_status, processing_status, classification, file_hash, duplicate_of_document_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?)`) 
    .bind(
      doc.clientId,
      doc.taxYear,
      doc.filename,
      doc.mimeType,
      doc.extension,
      doc.storageKey,
      doc.size,
      doc.processingStatus || 'queued',
      doc.classification,
      doc.fileHash || null,
      doc.duplicateOfDocumentId || null
    )
    .run();
  return result.meta.last_row_id;
}

export async function enqueueDocument(db, documentId) {
  const existing = await db
    .prepare('SELECT id, status FROM processing_queue WHERE document_id = ? LIMIT 1')
    .bind(documentId)
    .first();
  if (existing) return existing;

  const result = await db
    .prepare('INSERT INTO processing_queue (document_id, status, processor) VALUES (?, ?, ?)')
    .bind(documentId, 'queued', 'hermes-intake')
    .run();
  return { id: result.meta.last_row_id, status: 'queued' };
}

export async function getDocumentById(db, documentId) {
  return await db
    .prepare(`SELECT id, client_id, tax_year, original_filename, mime_type, extension, storage_key, file_size,
        processing_status, classification, file_hash, duplicate_of_document_id
      FROM documents WHERE id = ?`)
    .bind(documentId)
    .first();
}

export async function upsertIntakeResult(db, doc, intake) {
  const existing = await db.prepare('SELECT id FROM document_intake_results WHERE document_id = ? LIMIT 1').bind(doc.id).first();
  if (existing) {
    await db
      .prepare(`UPDATE document_intake_results
        SET classification = ?, organizer_category = ?, workpaper_bucket = ?, confidence = ?, duplicate_of_document_id = ?, requires_human_review = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ?`)
      .bind(intake.classification, intake.organizerCategory, intake.workpaperBucket, intake.confidence, doc.duplicate_of_document_id || null, intake.requiresHumanReview ? 1 : 0, intake.notes, doc.id)
      .run();
    return existing.id;
  }

  const result = await db
    .prepare(`INSERT INTO document_intake_results
      (document_id, client_id, tax_year, classification, organizer_category, workpaper_bucket, confidence, duplicate_of_document_id, requires_human_review, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
    .bind(doc.id, doc.client_id, doc.tax_year, intake.classification, intake.organizerCategory, intake.workpaperBucket, intake.confidence, doc.duplicate_of_document_id || null, intake.requiresHumanReview ? 1 : 0, intake.notes)
    .run();
  return result.meta.last_row_id;
}
