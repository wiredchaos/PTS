/**
 * legal_agent.js — Entity/trust/POA/contract support.
 *
 * Rules:
 * - ALWAYS sets requires_attorney_review: true for legal conclusions.
 * - Never provides legal advice as a lawyer.
 * - Provides informational analysis only.
 */

const LEGAL_TASK_TYPES = ['entity', 'trust', 'poa', 'contract', 'legal'];

/**
 * @param {object} context - { env, db, kv, clientId, client }
 * @param {object} input - { legalTaskType?, documents?, entityType? }
 */
export async function run(_context, input) {
  const legalTaskType = typeof input.legalTaskType === 'string'
    ? input.legalTaskType.toLowerCase()
    : 'general';

  const result = {
    legal_task_type: legalTaskType,
    requires_attorney_review: true,
    disclaimer:
      'This output is informational only and does not constitute legal advice. ' +
      'Consult a licensed attorney for legal conclusions.',
    analysis: null,
    citations: [],
  };

  switch (legalTaskType) {
    case 'entity':
      result.analysis = buildEntityAnalysis(input);
      result.citations = [
        {
          type: 'IRC',
          reference: 'IRC § 11',
          description: 'Corporate income tax — applicable to C corporations.',
        },
        {
          type: 'IRC',
          reference: 'IRC § 1363',
          description: 'S corporation — effect of election.',
        },
        {
          type: 'IRC',
          reference: 'IRC § 701',
          description: 'Partnership — partners, not partnership, subject to tax.',
        },
        {
          type: 'IRC',
          reference: 'IRC § 301.7701-3',
          description: 'Classification of certain business entities (check-the-box regulations).',
        },
      ];
      break;

    case 'trust':
      result.analysis = buildTrustAnalysis(input);
      result.citations = [
        {
          type: 'IRC',
          reference: 'IRC § 641',
          description: 'Imposition of tax on trusts and estates.',
        },
        {
          type: 'IRC',
          reference: 'IRC § 671',
          description: 'Grantor trust rules — trust treated as owned by grantor.',
        },
        {
          type: 'IRS_PUB',
          reference: 'IRS Publication 559',
          description: 'Survivors, Executors, and Administrators — estate and trust basics.',
        },
      ];
      break;

    case 'poa':
      result.analysis = {
        form_required: 'IRS Form 2848',
        scope: 'Power of Attorney and Declaration of Representative',
        note: 'CAF number required for practitioner. Verify taxpayer authorization covers relevant tax years and tax types.',
      };
      result.citations = [
        {
          type: 'IRS_PUB',
          reference: 'IRS Publication 947',
          description: 'Practice Before the IRS and Power of Attorney.',
        },
      ];
      break;

    case 'contract':
      result.analysis = {
        note: 'Contract review requires attorney analysis. Tax implications of contractual arrangements may be reviewable by a CPA or EA.',
        considerations: ['character of payments', 'constructive receipt', 'economic benefit doctrine'],
      };
      result.citations = [
        {
          type: 'IRC',
          reference: 'IRC § 451',
          description: 'General rule for taxable year of inclusion — cash vs. accrual method.',
        },
      ];
      break;

    default:
      result.analysis = {
        note: 'General legal inquiry. Provide legalTaskType (entity/trust/poa/contract) for specific analysis.',
        requires_attorney_review: true,
      };
      result.citations = [
        {
          type: 'INTERNAL_WORKPAPER',
          reference: 'PTS WP-LEGAL-001',
          description: 'Placeholder — general legal inquiry requires attorney review.',
        },
      ];
  }

  return result;
}

function buildEntityAnalysis(input) {
  const entityType = typeof input.entityType === 'string' ? input.entityType.toLowerCase() : 'unknown';
  return {
    entity_type: entityType,
    tax_treatment: getEntityTaxTreatment(entityType),
    considerations: [
      'Verify entity classification election (Form 8832 or Form 2553 if applicable)',
      'Confirm state registration and annual filing requirements',
      'Review operating/shareholder agreement for tax distribution provisions',
      'Assess self-employment tax implications for pass-through entities',
    ],
    requires_attorney_review: true,
  };
}

function getEntityTaxTreatment(entityType) {
  const treatments = {
    llc: 'Default disregarded (sole member) or partnership; may elect C or S corp via Form 8832/2553',
    scorp: 'Pass-through — income/loss flows to shareholders; Form 1120-S required',
    ccorp: 'Entity-level tax at corporate rates; Form 1120 required; potential double taxation',
    partnership: 'Pass-through — income/loss allocated per operating agreement; Form 1065 required',
    'sole-proprietor': 'Disregarded — reported on Schedule C of Form 1040; subject to SE tax',
  };
  return treatments[entityType] || 'Unknown entity type — attorney review required';
}

function buildTrustAnalysis(input) {
  const trustType = typeof input.trustType === 'string' ? input.trustType.toLowerCase() : 'unknown';
  return {
    trust_type: trustType,
    filing_requirement: trustType !== 'grantor' ? 'Form 1041 required if gross income > $600' : 'Grantor trust — income reported on grantor Form 1040',
    considerations: [
      'Identify grantor trust vs. non-grantor trust status',
      'Review trust document for distribution provisions affecting DNI',
      'Confirm trustee fiduciary obligations under state law',
      'Assess generation-skipping transfer tax (GST) exposure if applicable',
    ],
    requires_attorney_review: true,
  };
}
