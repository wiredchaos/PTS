import { parseExtension } from './documents.js';

const RULES = [
  ['W-2', ['w-2', 'w2', 'form w2', 'form-w2'], 'Income', 'Wages'],
  ['1099-NEC', ['1099-nec', '1099 nec', '1099nec', 'nonemployee'], 'Income', 'Nonemployee Compensation'],
  ['1099-MISC', ['1099-misc', '1099 misc', '1099misc'], 'Income', 'Miscellaneous Income'],
  ['1099-K', ['1099-k', '1099 k', '1099k', 'payment card', 'third party network'], 'Income', 'Payment Settlement'],
  ['1099-INT', ['1099-int', '1099 int', '1099int', 'interest income'], 'Income', 'Interest'],
  ['1099-DIV', ['1099-div', '1099 div', '1099div', 'dividend'], 'Income', 'Dividends'],
  ['1099-B', ['1099-b', '1099 b', '1099b', 'brokerage', 'proceeds from broker'], 'Income', 'Brokerage and Capital Gains'],
  ['K-1', ['k-1', 'k1', 'schedule k', 'schedule-k'], 'Income', 'Pass-through K-1'],
  ['Bank statement', ['bank statement', 'checking', 'savings', 'deposit statement', 'account statement'], 'Income Reconstruction', 'Banking'],
  ['Credit card statement', ['credit card', 'card statement', 'visa statement', 'mastercard', 'amex', 'american express'], 'Expense Reconstruction', 'Credit Cards'],
  ['Mortgage interest / Form 1098', ['1098', 'mortgage interest', 'mortgage statement'], 'Deductions', 'Schedule A or Schedule E Review'],
  ['Property tax', ['property tax', 'real estate tax', 'secured tax', 'county tax'], 'Deductions', 'Property Tax'],
  ['Mileage log', ['mileage', 'mile log', 'vehicle log', 'trip log', 'odometer'], 'Vehicle', 'Mileage'],
  ['Receipt', ['receipt', 'purchase', 'expense receipt'], 'Expenses', 'Receipts'],
  ['Invoice', ['invoice', 'bill to', 'statement of work'], 'Income or Expenses', 'Invoices'],
  ['IRS notice', ['irs notice', 'cp2000', 'cp14', 'ltr', 'letter 12c', 'internal revenue'], 'Resolution', 'IRS Notices'],
  ['FTB notice', ['ftb notice', 'franchise tax board', 'ca notice', 'california notice'], 'Resolution', 'CA FTB Notices'],
  ['Legal document', ['legal', 'contract', 'settlement', 'lawsuit', 'court', 'attorney'], 'Legal', 'Legal Review'],
  ['Entity document', ['articles of organization', 'articles of incorporation', 'operating agreement', 'bylaws', 'entity', 'ein letter'], 'Business Entity', 'Compliance'],
  ['Payroll report', ['payroll', '941', '940', 'de 9', 'wage report'], 'Payroll', 'Payroll Reports'],
  ['Profit and loss', ['profit and loss', 'p&l', 'income statement', 'profit_loss'], 'Business Financials', 'Profit and Loss'],
  ['Balance sheet', ['balance sheet', 'statement of financial position'], 'Business Financials', 'Balance Sheet'],
];

const DEFAULT_MAPPING = { organizerCategory: 'Needs Review', workpaperBucket: 'Unclassified' };

export function classifyIntakeDocument({ filename = '', mimeType = '', metadata = {} } = {}) {
  const extension = parseExtension(filename);
  const haystack = [filename, extension, mimeType, ...Object.values(metadata || {})]
    .filter((value) => value != null)
    .join(' ')
    .toLowerCase()
    .replace(/[_+.]+/g, ' ');

  for (const [classification, terms, organizerCategory, workpaperBucket] of RULES) {
    if (terms.some((term) => haystack.includes(term))) {
      return {
        classification,
        organizerCategory,
        workpaperBucket,
        confidence: extension || mimeType ? 0.86 : 0.78,
        requiresHumanReview: false,
        notes: `Matched deterministic intake rule for ${classification}.`,
      };
    }
  }

  return {
    classification: 'Unknown',
    ...DEFAULT_MAPPING,
    confidence: 0.35,
    requiresHumanReview: true,
    notes: 'No deterministic filename, extension, MIME type, or metadata rule matched.',
  };
}

export function mapOrganizerWorkpaper(classification) {
  const rule = RULES.find(([name]) => name === classification);
  if (!rule) return DEFAULT_MAPPING;
  return { organizerCategory: rule[2], workpaperBucket: rule[3] };
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
