/**
 * gamma_agent.js — Generates Gamma presentation prompt/output.
 * ONLY runs when explicitly requested (hermesOptions.requestGamma === true).
 * Saves URL or placeholder to gamma_presentations in D1.
 */

/**
 * @param {object} context - { env, db, kv, clientId, runId, hermesOptions }
 * @param {object} input - { clientId, taxYear?, summary?, gammaUrl? }
 */
export async function run(context, input) {
  const { hermesOptions } = context;

  // Enforcement: only run when explicitly requested
  if (!hermesOptions || hermesOptions.requestGamma !== true) {
    return {
      skipped: true,
      skipped_reason: 'gamma_agent only runs when hermesOptions.requestGamma is explicitly true',
    };
  }

  const { db } = context;
  const clientId = Number(input.clientId || context.clientId);
  const taxYear = Number(input.taxYear) || new Date().getUTCFullYear() - 1;
  const gammaUrl = typeof input.gammaUrl === 'string' && input.gammaUrl.trim() ? input.gammaUrl.trim() : null;

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { ok: false, error: 'valid clientId is required', skipped: false };
  }

  // Build the Gamma prompt structure
  const gammaPrompt = buildGammaPrompt(input, taxYear);

  // Persist to gamma_presentations
  if (db) {
    try {
      if (gammaUrl) {
        await db
          .prepare(
            'INSERT INTO gamma_presentations (client_id, url, status, source) VALUES (?, ?, ?, ?)'
          )
          .bind(clientId, gammaUrl, 'generated', 'hermes-gamma-agent')
          .run();
      } else {
        await db
          .prepare(
            'INSERT INTO gamma_presentations (client_id, url, status, source) VALUES (?, NULL, ?, ?)'
          )
          .bind(clientId, 'placeholder', 'hermes-gamma-agent-pending')
          .run();
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    ok: true,
    clientId,
    taxYear,
    gamma_url: gammaUrl,
    status: gammaUrl ? 'generated' : 'placeholder',
    gamma_prompt: gammaPrompt,
    message: gammaUrl
      ? 'Gamma presentation URL saved.'
      : 'Gamma prompt generated. Provide gammaUrl to save a completed presentation URL.',
  };
}

function buildGammaPrompt(input, taxYear) {
  const summary = typeof input.summary === 'string' ? input.summary : 'Tax analysis summary pending.';
  return {
    title: `Tax Summary — ${taxYear}`,
    sections: [
      { heading: 'Overview', content: summary },
      { heading: 'Key Findings', content: 'See attached workpaper for detailed findings.' },
      { heading: 'Next Steps', content: 'Review with your tax advisor before filing.' },
      { heading: 'Disclaimer', content: 'This presentation is informational only and does not constitute tax advice. Consult a licensed tax professional.' },
    ],
    instructions: 'Generate a professional tax summary presentation using the above sections. Keep language clear and client-friendly.',
  };
}
