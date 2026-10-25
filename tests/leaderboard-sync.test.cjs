'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectSnapshot } = require('../tools/sync-arcade-leaderboard.cjs');
function record(fields = {}) { return { version: 1, id: 'run-01234567', name: 'Anna Dojo', gender: 'female', hairstyle: 3, score: 2000, wins: 1, rankIndex: 1, rankId: '10-kyu', rankLabel: '10 KYU', completed: false, reason: 'defeat', matches: 2, elapsedSeconds: 90.123, createdAt: '2026-10-24T15:20:00.000Z', ...fields }; }
const reply = data => ({ ok: true, text: async () => JSON.stringify(data) });

test('archives all pages deterministically and strips fields outside the record schema', async () => {
  let count = 0;
  const snapshot = await collectSnapshot(async url => {
    count++;
    assert.ok(url.startsWith('https://kyokushin-dojo-classifica.flazio1.chatgpt.site/records'));
    if (count === 2) assert.ok(url.includes('after='));
    return reply({ version: 1, updatedAt: '2026-10-25T00:00:00Z',
      records: [record({ id: count === 1 ? 'run-00000002' : 'run-00000001', shell: 'untrusted text' })],
      nextCursor: count === 1 ? '123456789.run-00000002' : null });
  });
  assert.deepEqual(snapshot.records.map(row => row.id), ['run-00000001', 'run-00000002']);
  assert.equal(snapshot.records[0].shell, undefined);
});

test('empty production snapshot produces no invented records', async () => {
  assert.deepEqual(await collectSnapshot(async () => reply({ version: 1, updatedAt: null, records: [], nextCursor: null })), { version: 1, updatedAt: null, records: [] });
});

test('bad schema, foreign cursors, oversized responses and failed reads reject the entire archive update', async () => {
  const valid = { version: 1, updatedAt: null, records: [], nextCursor: null };
  for (const data of [{ ...valid, records: [record({ score: 999999 })] }, { ...valid, nextCursor: 'https://evil.example' }, { ...valid, version: 9 }]) {
    await assert.rejects(collectSnapshot(async () => reply(data)));
  }
  await assert.rejects(collectSnapshot(async () => ({ ok: true, text: async () => 'x'.repeat(2000001) })));
  await assert.rejects(collectSnapshot(async () => ({ ok: false })));
});

test('a repeated cursor or conflicting id cannot silently truncate or overwrite a record', async () => {
  await assert.rejects(collectSnapshot(async () => reply({ version: 1, updatedAt: null, records: [], nextCursor: '123456789.run-00000001' })));
  let count = 0;
  await assert.rejects(collectSnapshot(async () => reply({ version: 1, updatedAt: null,
    records: [record({ score: ++count === 1 ? 2000 : 3000 })], nextCursor: count === 1 ? '123456789.run-01234567' : null })));
});
