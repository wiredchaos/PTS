import { jsonResponse, validationError } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return jsonResponse(503, { ok: false, error: 'Missing DB binding' });

  const url = new URL(request.url);
  const clientId = Number(url.searchParams.get('clientId'));
  const taxYear = Number(url.searchParams.get('taxYear') || new Date().getFullYear());
  if (!Number.isInteger(clientId) || clientId <= 0) return validationError('valid clientId is required');

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

  const flagsRaw = env.CONFIG_KV ? await env.CONFIG_KV.get('feature_flags') : null;
  let flags = { gammaViewerEnabled: true, organizerEnabled: true };
  if (flagsRaw) {
    try {
      flags = JSON.parse(flagsRaw);
    } catch {
      flags = { ...flags, invalidConfig: true };
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
    featureFlags: flags
  });
}
