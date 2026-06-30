import { jsonResponse, validationError } from '../_lib/http.js';

const MAX_FUTURE_TAX_YEAR_OFFSET = 2; // allows near-term planning/estimated filings

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return jsonResponse(503, { ok: false, error: 'Missing DB binding' });

  const url = new URL(request.url);
  const clientId = Number(url.searchParams.get('clientId'));
  const taxYear = Number(url.searchParams.get('taxYear'));
  const maxTaxYear = new Date().getUTCFullYear() + MAX_FUTURE_TAX_YEAR_OFFSET;
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > maxTaxYear) return validationError('valid taxYear is required');

  const client = await env.DB.prepare('SELECT id, name, type, case_type, status FROM clients WHERE id = ?').bind(clientId).first();
  if (!client) return jsonResponse(404, { ok: false, error: 'Client not found' });

  const docs = await env.DB
    .prepare('SELECT processing_status FROM documents WHERE client_id = ? AND tax_year = ?')
    .bind(clientId, taxYear)
    .all();

  const checklist = [
    { key: 'upload_documents', label: 'Upload Documents', done: (docs.results || []).length > 0 },
    { key: 'complete_organizer', label: 'Complete Organizer', done: false },
    { key: 'review_tax_status', label: 'View Tax Status', done: (docs.results || []).some((d) => d.processing_status === 'processed') },
    { key: 'gamma_presentation', label: 'View Generated Gamma Presentation', done: false }
  ];

  const featureFlagsRaw = env.CONFIG_KV ? await env.CONFIG_KV.get('feature_flags') : null;
  let flags = { gammaViewerEnabled: true, organizerEnabled: true };
  let featureFlagsWarning = null;
  if (featureFlagsRaw) {
    try {
      flags = JSON.parse(featureFlagsRaw);
    } catch {
      flags = { ...flags, invalidConfig: true };
      featureFlagsWarning = 'feature_flags in KV is not valid JSON';
    }
  }

  return jsonResponse(200, {
    ok: true,
    client: {
      id: client.id,
      name: client.name,
      type: client.type,
      caseType: client.case_type,
      status: client.status,
      showResolutionGuide: client.type === 'resolution' || client.case_type === 'resolution'
    },
    taxYear,
    checklist,
    featureFlags: flags,
    featureFlagsWarning
  });
}
