export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getSessionContext(request) {
  return {
    clientIdHeader: request.headers.get('x-client-id') || null,
    authState: 'placeholder-auth-hook'
  };
}

export function validationError(message) {
  return jsonResponse(400, { ok: false, error: message });
}
