/**
 * document_extractor.js — Extracts structured fields from uploaded documents.
 * Checks agent_memory first to avoid redundant extraction.
 * Sets requires_human_review: true when confidence < 0.7.
 */

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * @param {object} context - { env, db, kv, clientId, documentId }
 * @param {object} input - { filename, mimeType, classification, content?, storageKey? }
 */
export async function run(context, input) {
  const { db, clientId, documentId } = context;

  // Check agent_memory for a previously extracted result for this document
  if (db && clientId && documentId) {
    try {
      const cached = await db
        .prepare(
          `SELECT value_json FROM agent_memory
           WHERE client_id = ? AND memory_type = 'extraction' AND key = ?`
        )
        .bind(clientId, `doc:${documentId}`)
        .first();
      if (cached) {
        const value = JSON.parse(cached.value_json);
        return { ...value, from_memory: true };
      }
    } catch {
      // Graceful degradation — proceed without memory
    }
  }

  const classification = input.classification || 'other';
  const filename = typeof input.filename === 'string' ? input.filename.toLowerCase() : '';

  // Rules-based field extraction for common tax document types
  const fields = extractRulesBasedFields(filename, classification);
  const confidence = fields.confidence;
  const requiresHumanReview = confidence < CONFIDENCE_THRESHOLD;

  const result = {
    classification,
    fields: fields.extracted,
    confidence,
    requires_human_review: requiresHumanReview,
    llm_used: false,
    from_memory: false,
  };

  // Persist to agent_memory for future lookups
  if (db && clientId && documentId && !requiresHumanReview) {
    try {
      await db
        .prepare(
          `INSERT INTO agent_memory (client_id, memory_type, key, value_json, confidence)
           VALUES (?, 'extraction', ?, ?, ?)
           ON CONFLICT(client_id, memory_type, key) DO UPDATE SET
             value_json = excluded.value_json,
             confidence = excluded.confidence,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(clientId, `doc:${documentId}`, JSON.stringify(result), confidence)
        .run();
    } catch {
      // Non-fatal
    }
  }

  return result;
}

function extractRulesBasedFields(filename, classification) {
  const extracted = {};
  let confidence = 0.5;

  if (classification === 'pdf' || classification === 'document') {
    if (/w[-_ ]?2/i.test(filename)) {
      extracted.document_type = 'W-2';
      extracted.expected_fields = ['employer_name', 'wages', 'federal_tax_withheld', 'state_tax_withheld', 'social_security_wages'];
      confidence = 0.85;
    } else if (/1099[-_ ]?nec/i.test(filename)) {
      extracted.document_type = '1099-NEC';
      extracted.expected_fields = ['payer_name', 'nonemployee_compensation', 'federal_tax_withheld'];
      confidence = 0.85;
    } else if (/1099[-_ ]?misc/i.test(filename)) {
      extracted.document_type = '1099-MISC';
      extracted.expected_fields = ['payer_name', 'rents', 'royalties', 'other_income'];
      confidence = 0.85;
    } else if (/1099[-_ ]?int/i.test(filename)) {
      extracted.document_type = '1099-INT';
      extracted.expected_fields = ['payer_name', 'interest_income', 'early_withdrawal_penalty'];
      confidence = 0.85;
    } else if (/1099[-_ ]?div/i.test(filename)) {
      extracted.document_type = '1099-DIV';
      extracted.expected_fields = ['payer_name', 'ordinary_dividends', 'qualified_dividends', 'capital_gain_distributions'];
      confidence = 0.85;
    } else if (/1040/i.test(filename)) {
      extracted.document_type = '1040';
      extracted.expected_fields = ['filing_status', 'total_income', 'agi', 'taxable_income', 'total_tax'];
      confidence = 0.8;
    } else if (/schedule[-_ ]?[abc]/i.test(filename)) {
      extracted.document_type = 'Schedule';
      extracted.expected_fields = ['schedule_type', 'total_amount'];
      confidence = 0.75;
    } else if (/bank.*statement|statement.*bank/i.test(filename)) {
      extracted.document_type = 'bank_statement';
      extracted.expected_fields = ['account_number_last4', 'beginning_balance', 'ending_balance', 'period'];
      confidence = 0.8;
    } else {
      extracted.document_type = 'unknown_tax_document';
      confidence = 0.45;
    }
  } else if (classification === 'spreadsheet') {
    extracted.document_type = 'spreadsheet';
    extracted.expected_fields = ['sheet_names', 'row_count'];
    confidence = 0.65;
  } else if (classification === 'image') {
    extracted.document_type = 'image';
    extracted.expected_fields = [];
    confidence = 0.4;
  }

  return { extracted, confidence };
}
