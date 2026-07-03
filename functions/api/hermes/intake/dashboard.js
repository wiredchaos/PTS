import { jsonResponse } from '../../../_lib/http.js';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return jsonResponse(503, { ok: false, error: 'Missing DB binding' });

  const { results } = await env.DB.prepare(`SELECT d.id, d.client_id, d.tax_year, d.original_filename, d.processing_status,
      d.duplicate_of_document_id, q.status AS queue_status, r.classification, r.organizer_category,
      r.workpaper_bucket, r.requires_human_review, d.created_at
    FROM documents d
    LEFT JOIN processing_queue q ON q.document_id = d.id
    LEFT JOIN document_intake_results r ON r.document_id = d.id
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT 50`).all();

  return jsonResponse(200, { ok: true, documents: results || [] });
}
