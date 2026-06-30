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
    .prepare('SELECT classification, processing_status, original_filename FROM documents WHERE client_id = ? AND tax_year = ?')
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
  const filenames = rows.map((row) => String(row.original_filename || '').toLowerCase());
  const hasW2Or1099 = filenames.some((name) => /(?:w[-_ ]?2|1099)/i.test(name));
  const hasYearEndBankStatements = filenames.some((name) => name.includes('bank') && (name.includes('statement') || name.includes('statements')));
  const missingDocuments = [];
  if (!hasW2Or1099) missingDocuments.push('w2-or-1099');
  if (!hasYearEndBankStatements) missingDocuments.push('year-end-bank-statements');
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
