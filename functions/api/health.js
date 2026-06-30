import { jsonResponse } from '../_lib/http.js';

export async function onRequestGet(context) {
  const env = context.env || {};
  const checks = {
    d1: Boolean(env.DB),
    r2: Boolean(env.DOCS),
    kv: Boolean(env.PTS_KV)
  };

  return jsonResponse(200, {
    ok: true,
    service: 'pts-cloudflare-pages-functions',
    readiness: checks,
    ready: checks.d1 && checks.r2 && checks.kv,
    timestamp: new Date().toISOString()
  });
}
