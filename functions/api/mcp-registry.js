import { jsonResponse } from '../_lib/http.js';

export async function onRequestGet(context) {
  const cached = context.env.CONFIG_KV ? await context.env.CONFIG_KV.get('mcp_registry_cache', { type: 'json' }) : null;
  if (cached) {
    return jsonResponse(200, { ok: true, registry: cached, cached: true });
  }

  const registry = [
    {
      name: 'IRS Transcript API',
      category: 'tax',
      restricted: true,
      requiresCredentials: true,
      status: 'placeholder-only'
    },
    {
      name: 'FTB API',
      category: 'state-tax',
      restricted: true,
      requiresCredentials: true,
      status: 'placeholder-only'
    },
    {
      name: 'Cloudflare D1',
      category: 'storage',
      restricted: false,
      requiresCredentials: false,
      status: context.env.DB ? 'connected' : 'not-configured'
    }
  ];

  if (context.env.CONFIG_KV) {
    await context.env.CONFIG_KV.put('mcp_registry_cache', JSON.stringify(registry), { expirationTtl: 300 });
  }

  return jsonResponse(200, { ok: true, registry });
}
