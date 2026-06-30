/**
 * POST /api/hermes/run
 * Runs the Hermes orchestrator for a given task.
 */
import { runHermes } from '../../_lib/hermes.js';
import { jsonResponse, readJsonBody, validationError } from '../../_lib/http.js';

const VALID_TASK_TYPES = ['classify', 'extract', 'document', 'analysis', 'tax', 'resolution', 'legal', 'full'];

export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await readJsonBody(request);
  if (!body) return validationError('JSON body required');

  const { taskType, clientId, documentId, input, requestedBy, hermesOptions } = body;

  if (!taskType || !VALID_TASK_TYPES.includes(taskType)) {
    return validationError(`taskType must be one of: ${VALID_TASK_TYPES.join(', ')}`);
  }

  const parsedClientId = clientId != null ? Number(clientId) : undefined;
  if (parsedClientId !== undefined && (!Number.isInteger(parsedClientId) || parsedClientId <= 0)) {
    return validationError('clientId must be a positive integer');
  }

  try {
    const result = await runHermes(
      {
        taskType,
        clientId: parsedClientId,
        documentId: documentId != null ? Number(documentId) : undefined,
        input: input || {},
        requestedBy: typeof requestedBy === 'string' ? requestedBy : 'api',
        hermesOptions: hermesOptions && typeof hermesOptions === 'object' ? hermesOptions : {},
      },
      env
    );

    return jsonResponse(200, { ok: true, ...result });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Internal error' });
  }
}
