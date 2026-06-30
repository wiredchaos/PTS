export async function ensureClientExists(db, clientId) {
  const row = await db
    .prepare('SELECT id, name, type, case_type FROM clients WHERE id = ?')
    .bind(clientId)
    .first();
  return row || null;
}

export async function insertDocument(db, doc) {
  const result = await db
    .prepare(`INSERT INTO documents (client_id, tax_year, original_filename, mime_type, extension, storage_key, file_size, upload_status, processing_status, classification)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', 'queued', ?)`)
    .bind(doc.clientId, doc.taxYear, doc.filename, doc.mimeType, doc.extension, doc.storageKey, doc.size, doc.classification)
    .run();
  return result.meta.last_row_id;
}
