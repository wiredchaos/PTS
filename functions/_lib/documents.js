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

export function parseExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function classifyDocument({ filename = '', mimeType = '' }) {
  const extension = parseExtension(filename);
  const normalizedMime = mimeType.toLowerCase();

  if (EXTENSION_MAP[extension]) {
    return { extension, classification: EXTENSION_MAP[extension] };
  }

  if (normalizedMime.startsWith('image/')) {
    return { extension, classification: 'image' };
  }
  if (normalizedMime.includes('pdf')) {
    return { extension, classification: 'pdf' };
  }
  if (normalizedMime.includes('word') || normalizedMime.includes('document')) {
    return { extension, classification: 'document' };
  }
  if (normalizedMime.includes('sheet') || normalizedMime.includes('excel') || normalizedMime.includes('csv')) {
    return { extension, classification: 'spreadsheet' };
  }
  if (normalizedMime.includes('json')) {
    return { extension, classification: 'json' };
  }
  if (normalizedMime.includes('zip') || normalizedMime.includes('archive')) {
    return { extension, classification: 'archive' };
  }
  if (normalizedMime.startsWith('text/')) {
    return { extension, classification: 'text' };
  }

  return { extension, classification: 'other' };
}

export function buildR2Key({ clientId, taxYear, filename }) {
  const extension = parseExtension(filename);
  const sanitizedExtension = extension.replace(/[^a-zA-Z0-9]/g, '');
  const suffix = sanitizedExtension ? `.${sanitizedExtension}` : '';
  const base = extension ? filename.slice(0, -(extension.length + 1)) : filename;
  const sanitizedBase = base.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitized = `${sanitizedBase}${suffix}`;
  const uniqueId = crypto.randomUUID();
  return `clients/${clientId}/tax-year/${taxYear}/${uniqueId}-${sanitized}`;
}
