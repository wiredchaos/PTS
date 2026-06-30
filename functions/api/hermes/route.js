/**
 * POST /api/hermes/route
 * Returns the routing decision for a given taskType + clientId without executing agents.
 */
import { jsonResponse, readJsonBody, validationError } from '../../_lib/http.js';

const TASK_AGENT_MAP = {
  classify: ['intake_classifier'],
  upload: ['intake_classifier'],
  document: ['intake_classifier', 'document_extractor', 'qa_reviewer'],
  extract: ['intake_classifier', 'document_extractor', 'qa_reviewer'],
  analysis: ['intake_classifier', 'document_extractor', 'tax_analyst', 'qa_reviewer'],
  tax: ['intake_classifier', 'document_extractor', 'tax_analyst', 'qa_reviewer'],
  resolution: ['resolution_agent (if case_type=resolution)'],
  legal: ['legal_agent', 'qa_reviewer'],
  full: ['intake_classifier', 'document_extractor', 'tax_analyst', 'resolution_agent (if case_type=resolution)', 'legal_agent', 'qa_reviewer'],
};

export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await readJsonBody(request);
  if (!body) return validationError('JSON body required');

  const { taskType, clientId } = body;
  if (!taskType) return validationError('taskType is required');

  const agents = TASK_AGENT_MAP[taskType] || [];

  // Look up client case_type if clientId provided
  let clientInfo = null;
  if (env.DB && clientId) {
    try {
      clientInfo = await env.DB
        .prepare('SELECT id, case_type FROM clients WHERE id = ?')
        .bind(Number(clientId))
        .first();
    } catch {
      // Graceful degradation
    }
  }

  const notes = [];
  if (clientInfo && clientInfo.case_type !== 'resolution' && agents.some((a) => a.includes('resolution_agent'))) {
    notes.push('resolution_agent will be skipped (client.case_type !== resolution)');
  }
  if (!body.hermesOptions || body.hermesOptions.requestGamma !== true) {
    notes.push('gamma_agent will be skipped (not explicitly requested)');
  }

  return jsonResponse(200, {
    ok: true,
    taskType,
    clientId: clientId || null,
    client_case_type: clientInfo ? clientInfo.case_type : null,
    agents_would_run: agents,
    notes,
    cost_controls: [
      'SHA-256 dedup: identical inputs return cached result',
      'No LLM for classification — rules layer first',
      'resolution_agent: only for case_type=resolution',
      'gamma_agent: only when explicitly requested',
    ],
  });
}
