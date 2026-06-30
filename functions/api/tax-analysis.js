import { jsonResponse, readJsonBody, validationError } from '../_lib/http.js';

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.DB) {
    return jsonResponse(503, { ok: false, error: 'Missing DB binding' });
  }

  const body = await readJsonBody(context.request);
  if (!body) return validationError('JSON body required');

  const clientId = Number(body.clientId);
  const taxYear = Number(body.taxYear);
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000) return validationError('valid taxYear is required');

  const docs = await env.DB
    .prepare('SELECT classification, processing_status FROM documents WHERE client_id = ? AND tax_year = ?')
    .bind(clientId, taxYear)
    .all();

  const rows = docs.results || [];
  const processedCount = rows.filter((d) => d.processing_status === 'processed').length;
  const classifications = [...new Set(rows.map((d) => d.classification))];

  const summary = {
    pipeline: 'placeholder-tax-analysis',
    documentCount: rows.length,
    processedCount,
    classifications,
    workpaperStatus: processedCount === rows.length && rows.length > 0 ? 'ready' : 'in_progress'
  };
  const missingDocuments = ['w2-or-1099', 'year-end-bank-statements'].filter((item) => !classifications.includes('spreadsheet'));
  const reconciliations = {
    highLevelReconciliation: rows.length > 0 ? 'partial' : 'pending',
    notes: 'Deterministic placeholder. Integrate credentialed systems when available.'
  };

  await env.DB
    .prepare(`INSERT INTO analysis_results (client_id, tax_year, status, summary_json, missing_documents_json, reconciliations_json)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(clientId, taxYear, 'completed', JSON.stringify(summary), JSON.stringify(missingDocuments), JSON.stringify(reconciliations))
    .run();

  return jsonResponse(200, {
    ok: true,
    analysis: {
      clientId,
      taxYear,
      summary,
      missingDocuments,
      reconciliations
    }
  });
}
