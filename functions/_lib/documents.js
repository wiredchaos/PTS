const EXTENSION_MAP = {
  pdf: 'pdf',
  doc: 'document',
  docx: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  txt: 'text',
  json: 'json',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  zip: 'archive'
};

const CLASSIFICATION_RULES = [
  { classification: 'W-2', patterns: [/\bw[-_\s]?2\b/, /wage\s+and\s+tax\s+statement/] },
  { classification: '1099-NEC', patterns: [/1099[-_\s]?nec/, /nonemployee\s+comp/] },
  { classification: '1099-MISC', patterns: [/1099[-_\s]?misc/] },
  { classification: '1099-K', patterns: [/1099[-_\s]?k\b/, /payment\s+card/, /third\s+party\s+network/] },
  { classification: '1099-INT', patterns: [/1099[-_\s]?int/, /interest\s+income/] },
  { classification: '1099-DIV', patterns: [/1099[-_\s]?div/, /dividend/] },
  { classification: '1099-B', patterns: [/1099[-_\s]?b\b/, /broker(age)?\s+statement/, /proceeds\s+from\s+broker/] },
  { classification: 'K-1', patterns: [/\bk[-_\s]?1\b/, /schedule\s+k[-_\s]?1/] },
  { classification: 'Mortgage interest / Form 1098', patterns: [/1098/, /mortgage\s+interest/] },
  { classification: 'Bank statement', patterns: [/bank\s+statement/, /checking/, /savings/, /deposit\s+statement/] },
  { classification: 'Credit card statement', patterns: [/credit\s+card/, /card\s+statement/, /visa/, /mastercard/, /amex/, /american\s+express/] },
  { classification: 'Property tax', patterns: [/property\s+tax/, /secured\s+tax/, /parcel/] },
  { classification: 'Mileage log', patterns: [/mileage/, /vehicle\s+log/, /odometer/] },
  { classification: 'IRS notice', patterns: [/irs/, /internal\s+revenue/, /cp\d{2,4}/] },
  { classification: 'FTB notice', patterns: [/ftb/, /franchise\s+tax\s+board/, /california\s+tax\s+notice/] },
  { classification: 'Payroll report', patterns: [/payroll/, /941\b/, /940\b/, /wage\s+report/] },
  { classification: 'Profit and loss', patterns: [/profit\s+and\s+loss/, /p\s*&\s*l/, /income\s+statement/] },
  { classification: 'Balance sheet', patterns: [/balance\s+sheet/, /assets\s+liabilities/] },
  { classification: 'Invoice', patterns: [/invoice/, /bill\s+to/] },
  { classification: 'Receipt', patterns: [/receipt/, /proof\s+of\s+payment/] },
  { classification: 'Legal document', patterns: [/court/, /legal/, /lawsuit/, /judgment/, /lien/] },
  { classification: 'Entity document', patterns: [/articles\s+of\s+organization/, /statement\s+of\s+information/, /operating\s+agreement/, /ein/, /entity/] }
];

const ORGANIZER_MAPPING = {
  'W-2': ['Income', 'Wages'],
  '1099-NEC': ['Income', 'Nonemployee Compensation'],
  '1099-MISC': ['Income', 'Other 1099 Income'],
  '1099-K': ['Income Reconstruction', 'Payment Processor Income'],
  '1099-INT': ['Income', 'Interest'],
  '1099-DIV': ['Income', 'Dividends'],
  '1099-B': ['Investments', 'Brokerage Transactions'],
  'K-1': ['Income', 'Schedule K-1'],
  'Bank statement': ['Income Reconstruction', 'Banking'],
  'Credit card statement': ['Expense Substantiation', 'Credit Cards'],
  'Mortgage interest / Form 1098': ['Deductions', 'Mortgage Interest'],
  'Property tax': ['Deductions', 'Property Tax'],
  'Mileage log': ['Vehicle', 'Mileage'],
  Receipt: ['Expense Substantiation', 'Receipts'],
  Invoice: ['Expense Substantiation', 'Invoices'],
  'IRS notice': ['Resolution', 'IRS Notices'],
  'FTB notice': ['Resolution', 'CA FTB Notices'],
  'Legal document': ['Legal', 'Legal Documents'],
  'Entity document': ['Business Entity', 'Compliance'],
  'Payroll report': ['Payroll', 'Payroll Reports'],
  'Profit and loss': ['Financial Statements', 'Profit and Loss'],
  'Balance sheet': ['Financial Statements', 'Balance Sheet'],
  Unknown: ['Needs Review', 'Unclassified']
};

export function parseExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function normalizeSearchText({ filename = '', mimeType = '', metadata = {} }) {
  return [filename, mimeType, metadata.description, metadata.source, metadata.notes]
    .filter(Boolean)
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

export function classifyDocument({ filename = '', mimeType = '', metadata = {} }) {
  const extension = parseExtension(filename);
  const normalizedMime = mimeType.toLowerCase();
  const searchText = normalizeSearchText({ filename, mimeType, metadata });
  const matchedRule = CLASSIFICATION_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(searchText)));

  if (matchedRule) {
    return { extension, classification: matchedRule.classification, confidence: 0.9 };
  }

  if (EXTENSION_MAP[extension]) {
    return { extension, classification: 'Unknown', fileKind: EXTENSION_MAP[extension], confidence: 0.35 };
  }

  if (
    normalizedMime.startsWith('image/') ||
    normalizedMime.includes('pdf') ||
    normalizedMime.includes('word') ||
    normalizedMime.includes('document') ||
    normalizedMime.includes('sheet') ||
    normalizedMime.includes('excel') ||
    normalizedMime.includes('csv') ||
    normalizedMime.includes('json') ||
    normalizedMime.includes('zip') ||
    normalizedMime.startsWith('text/')
  ) {
    return { extension, classification: 'Unknown', confidence: 0.25 };
  }

  return { extension, classification: 'Unknown', confidence: 0.1 };
}

export function mapToOrganizer(classification, clientContext = {}) {
  const [organizerCategory, workpaperBucket] = ORGANIZER_MAPPING[classification] || ORGANIZER_MAPPING.Unknown;
  let notes = 'Rules-first intake mapping. Human review can refine placement.';
  let requiresHumanReview = classification === 'Unknown';

  if (classification === 'Mortgage interest / Form 1098') {
    const caseType = String(clientContext.caseType || clientContext.case_type || '').toLowerCase();
    if (caseType.includes('rental') || caseType.includes('schedule e')) {
      return {
        organizerCategory: 'Schedule E',
        workpaperBucket: 'Mortgage Interest',
        requiresHumanReview: false,
        notes: 'Mapped to Schedule E based on client context.'
      };
    }
    requiresHumanReview = true;
    notes = 'Form 1098 may belong on Schedule A or Schedule E depending on property use.';
  }

  return { organizerCategory, workpaperBucket, requiresHumanReview, notes };
}

export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return {
    buffer,
    hash: hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  };
}

export function buildR2Key({ clientId, taxYear, filename, fileHash }) {
  const extension = parseExtension(filename);
  const sanitizedExtension = extension.replace(/[^a-zA-Z0-9]/g, '');
  const suffix = sanitizedExtension ? `.${sanitizedExtension}` : '';
  const base = extension ? filename.slice(0, -(extension.length + 1)) : filename;
  const sanitizedBase = base.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitized = `${sanitizedBase}${suffix}`;
  const uniqueId = fileHash ? fileHash.slice(0, 16) : crypto.randomUUID();
  return `clients/${clientId}/tax-year/${taxYear}/${uniqueId}-${sanitized}`;
}
