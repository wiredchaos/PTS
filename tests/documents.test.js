import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocument, buildR2Key } from '../functions/_lib/documents.js';

test('classify supported extensions', () => {
  assert.equal(classifyDocument({ filename: 'file.pdf', mimeType: 'application/pdf' }).classification, 'pdf');
  assert.equal(classifyDocument({ filename: 'file.docx', mimeType: 'application/octet-stream' }).classification, 'document');
  assert.equal(classifyDocument({ filename: 'file.xlsx', mimeType: 'application/vnd.ms-excel' }).classification, 'spreadsheet');
  assert.equal(classifyDocument({ filename: 'file.zip', mimeType: 'application/zip' }).classification, 'archive');
  assert.equal(classifyDocument({ filename: 'file.unknown', mimeType: 'application/x-unknown' }).classification, 'other');
});

test('build R2 key includes client and year context', () => {
  const key = buildR2Key({ clientId: 12, taxYear: 2025, filename: 'W-2 Form.pdf' });
  assert.match(key, /^clients\/12\/tax-year\/2025\//);
  assert.match(key, /W-2_Form\.pdf$/);
});
