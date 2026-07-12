import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntakeDocument, mapOrganizerWorkpaper, sha256Hex } from '../functions/_lib/intake.js';
import { findDuplicateDocument, enqueueDocument } from '../functions/_lib/db.js';

function fakeDb(rows = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; calls.push({ sql, values }); return this; },
        async first() {
          if (sql.includes('FROM documents') && sql.includes('file_hash')) return rows.duplicate || null;
          if (sql.includes('FROM processing_queue')) return rows.queue || null;
          return null;
        },
        async run() { return { meta: { last_row_id: 44 } }; },
      };
      return statement;
    },
  };
}

test('sha256 duplicate detection uses stable file hash lookup', async () => {
  const hashA = await sha256Hex(new TextEncoder().encode('same-pdf-bytes'));
  const hashB = await sha256Hex(new TextEncoder().encode('same-pdf-bytes'));
  assert.equal(hashA, hashB);

  const db = fakeDb({ duplicate: { id: 7, original_filename: 'W-2.pdf' } });
  const duplicate = await findDuplicateDocument(db, { clientId: 1, taxYear: 2024, fileHash: hashA });
  assert.equal(duplicate.id, 7);
  assert.deepEqual(db.calls[0].values, [1, 2024, hashA]);
});

test('classification rules identify expected tax intake documents', () => {
  assert.equal(classifyIntakeDocument({ filename: '2024 W-2 Acme.pdf', mimeType: 'application/pdf' }).classification, 'W-2');
  assert.equal(classifyIntakeDocument({ filename: 'stripe 1099-k.csv', mimeType: 'text/csv' }).classification, '1099-K');
  assert.equal(classifyIntakeDocument({ filename: 'IRS Notice CP2000.pdf', mimeType: 'application/pdf' }).classification, 'IRS notice');
  assert.equal(classifyIntakeDocument({ filename: 'random-upload.bin', mimeType: 'application/octet-stream' }).classification, 'Unknown');
});

test('organizer and workpaper mapping returns configured buckets', () => {
  assert.deepEqual(mapOrganizerWorkpaper('W-2'), { organizerCategory: 'Income', workpaperBucket: 'Wages' });
  assert.deepEqual(mapOrganizerWorkpaper('Bank statement'), { organizerCategory: 'Income Reconstruction', workpaperBucket: 'Banking' });
  assert.deepEqual(mapOrganizerWorkpaper('Mileage log'), { organizerCategory: 'Vehicle', workpaperBucket: 'Mileage' });
  assert.deepEqual(mapOrganizerWorkpaper('IRS notice'), { organizerCategory: 'Resolution', workpaperBucket: 'IRS Notices' });
  assert.deepEqual(mapOrganizerWorkpaper('Not matched'), { organizerCategory: 'Needs Review', workpaperBucket: 'Unclassified' });
});

test('queue update behavior prevents duplicate queue rows', async () => {
  const existingDb = fakeDb({ queue: { id: 3, status: 'queued' } });
  const existing = await enqueueDocument(existingDb, 99);
  assert.equal(existing.id, 3);
  assert.equal(existingDb.calls.length, 1);

  const newDb = fakeDb();
  const queued = await enqueueDocument(newDb, 100);
  assert.equal(queued.id, 44);
  assert.equal(queued.status, 'queued');
  assert.equal(newDb.calls.length, 2);
});
