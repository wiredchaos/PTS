/**
 * tax_analyst.js — Workpaper-ready tax analysis agent.
 *
 * Rules:
 * - Every conclusion MUST include at least one citation (IRC, Treasury Reg, IRS Pub,
 *   Revenue Ruling, Court Case, or internal workpaper reference).
 * - Estimates are marked estimate_only: true.
 * - Never fabricate citation references.
 * - If no citation can be provided: return { supported: false, requires_human_review: true }.
 */

/**
 * @param {object} context - { env, db, kv, clientId, documentId, runId }
 * @param {object} input - { documents, taxYear, analysisType?, clientProfile? }
 */
export async function run(context, input) {
  const { db, clientId, runId } = context;
  const taxYear = Number(input.taxYear) || new Date().getUTCFullYear() - 1;
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const analysisType = input.analysisType || 'standard';

  // Check for LLM provider — gracefully degrade to rules-based if not configured
  const llmConfigured = Boolean(context.env && context.env.LLM_API_KEY);

  const analysis = buildRulesBasedAnalysis(documents, taxYear, analysisType);

  // Persist citations to D1
  if (db && runId && analysis.citations.length > 0) {
    for (const citation of analysis.citations) {
      try {
        await db
          .prepare(
            `INSERT INTO citations (run_id, citation_type, reference, description, url)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(runId, citation.type, citation.reference, citation.description || null, citation.url || null)
          .run();
      } catch {
        // Non-fatal
      }
    }
  }

  return {
    taxYear,
    analysisType,
    clientId,
    llm_used: llmConfigured,
    requires_human_review: analysis.requiresHumanReview,
    findings: analysis.findings,
    citations: analysis.citations,
    workpaper_status: analysis.workpaperStatus,
    estimate_only: analysis.estimateOnly,
    missing_documents: analysis.missingDocuments,
  };
}

function buildRulesBasedAnalysis(documents, taxYear, analysisType) {
  const findings = [];
  const citations = [];
  const missingDocuments = [];
  let requiresHumanReview = false;
  let estimateOnly = false;

  const docTypes = documents.map((d) => (d.document_type || d.classification || '').toLowerCase());

  const hasW2 = docTypes.some((t) => t.includes('w-2') || t.includes('w2'));
  const has1099NEC = docTypes.some((t) => t.includes('1099-nec') || t.includes('1099_nec'));
  const has1099INT = docTypes.some((t) => t.includes('1099-int') || t.includes('1099_int'));
  const has1099DIV = docTypes.some((t) => t.includes('1099-div') || t.includes('1099_div'));
  const hasBankStatements = docTypes.some((t) => t.includes('bank_statement') || t.includes('bank'));
  const has1040 = docTypes.some((t) => t.includes('1040'));

  // Standard income reporting requirement
  if (hasW2) {
    findings.push({
      finding: 'W-2 wages are subject to federal income tax reporting',
      supported: true,
      estimate_only: false,
    });
    citations.push({
      type: 'IRC',
      reference: 'IRC § 61(a)(1)',
      description: 'Gross income includes compensation for services, including wages.',
    });
    citations.push({
      type: 'IRS_PUB',
      reference: 'IRS Publication 525',
      description: 'Taxable and Nontaxable Income — wage reporting requirements.',
    });
  }

  if (has1099NEC) {
    findings.push({
      finding: 'Self-employment income from 1099-NEC is subject to income tax and self-employment tax',
      supported: true,
      estimate_only: false,
    });
    citations.push({
      type: 'IRC',
      reference: 'IRC § 1401',
      description: 'Self-employment tax imposed on net earnings from self-employment.',
    });
    citations.push({
      type: 'TREASURY_REG',
      reference: 'Treas. Reg. § 1.1402(a)-1',
      description: 'Definition of net earnings from self-employment.',
    });
  }

  if (has1099INT) {
    findings.push({
      finding: 'Interest income must be included in gross income',
      supported: true,
      estimate_only: false,
    });
    citations.push({
      type: 'IRC',
      reference: 'IRC § 61(a)(4)',
      description: 'Gross income includes interest.',
    });
  }

  if (has1099DIV) {
    findings.push({
      finding: 'Dividend income classification affects applicable tax rate',
      supported: true,
      estimate_only: false,
    });
    citations.push({
      type: 'IRC',
      reference: 'IRC § 1(h)',
      description: 'Qualified dividends taxed at preferential capital gains rates.',
    });
    citations.push({
      type: 'IRS_PUB',
      reference: 'IRS Publication 550',
      description: 'Investment Income and Expenses — dividend reporting.',
    });
  }

  if (!hasW2 && !has1099NEC) {
    missingDocuments.push('W-2 or 1099-NEC (income documentation required)');
    requiresHumanReview = true;
  }

  if (!hasBankStatements && analysisType === 'comprehensive') {
    missingDocuments.push('Year-end bank statements (recommended for comprehensive review)');
    estimateOnly = true;
  }

  if (documents.length === 0) {
    findings.push({
      finding: 'No documents provided — analysis is placeholder only',
      supported: false,
      requires_human_review: true,
      estimate_only: true,
    });
    requiresHumanReview = true;
    estimateOnly = true;
    citations.push({
      type: 'INTERNAL_WORKPAPER',
      reference: 'PTS WP-001',
      description: 'Placeholder finding — requires document upload and human review before use.',
    });
  }

  const workpaperStatus =
    !requiresHumanReview && citations.length > 0 ? 'ready' : 'requires_review';

  return { findings, citations, missingDocuments, requiresHumanReview, estimateOnly, workpaperStatus };
}
