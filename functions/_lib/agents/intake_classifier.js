/**
 * intake_classifier.js — Rules-based MIME/extension classifier.
 * No LLM required for known types; SLM fallback hint returned for unknowns.
 */

const MIME_MAP = {
  'application/pdf': 'pdf',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'text/csv': 'spreadsheet',
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
  'application/json': 'json',
  'text/plain': 'text',
  'text/html': 'text',
};

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
  gif: 'image',
  webp: 'image',
  tiff: 'image',
  tif: 'image',
  zip: 'archive',
  htm: 'text',
  html: 'text',
  xml: 'text',
};

function parseExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

/**
 * Classify a document by MIME type and filename extension without LLM.
 * @param {object} context - Hermes agent context (env, db, kv)
 * @param {object} input - { filename, mimeType, content? }
 * @returns {object} Agent result
 */
export async function run(_context, input) {
  const filename = typeof input.filename === 'string' ? input.filename : '';
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.toLowerCase().split(';')[0].trim() : '';

  // 1. Try exact MIME match
  if (mimeType && MIME_MAP[mimeType]) {
    return {
      classification: MIME_MAP[mimeType],
      method: 'mime',
      confidence: 1.0,
      llm_used: false,
      requires_human_review: false,
    };
  }

  // 2. Try MIME prefix heuristics
  if (mimeType.startsWith('image/')) {
    return { classification: 'image', method: 'mime-prefix', confidence: 0.95, llm_used: false, requires_human_review: false };
  }
  if (mimeType.startsWith('text/')) {
    return { classification: 'text', method: 'mime-prefix', confidence: 0.9, llm_used: false, requires_human_review: false };
  }
  if (mimeType.includes('pdf')) {
    return { classification: 'pdf', method: 'mime-heuristic', confidence: 0.95, llm_used: false, requires_human_review: false };
  }
  if (mimeType.includes('word') || mimeType.includes('document')) {
    return { classification: 'document', method: 'mime-heuristic', confidence: 0.9, llm_used: false, requires_human_review: false };
  }
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return { classification: 'spreadsheet', method: 'mime-heuristic', confidence: 0.9, llm_used: false, requires_human_review: false };
  }
  if (mimeType.includes('zip') || mimeType.includes('archive')) {
    return { classification: 'archive', method: 'mime-heuristic', confidence: 0.9, llm_used: false, requires_human_review: false };
  }

  // 3. Fall back to extension
  const ext = parseExtension(filename);
  if (ext && EXTENSION_MAP[ext]) {
    return {
      classification: EXTENSION_MAP[ext],
      method: 'extension',
      confidence: 0.85,
      llm_used: false,
      requires_human_review: false,
    };
  }

  // 4. Unknown — recommend SLM fallback; do not invoke LLM here
  return {
    classification: 'other',
    method: 'fallback',
    confidence: 0.5,
    llm_used: false,
    requires_human_review: true,
    slm_hint: 'unknown file type — consider SLM classification',
  };
}
