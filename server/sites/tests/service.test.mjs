import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleRecord, readRecords, status } from '../lib/service.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(new URL('../drizzle/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  return { sqlite, prepare(sql) {
    const statement = sqlite.prepare(sql); let parameters = [];
    const bound = { bind(...values) { parameters = values; return bound; },
      async first() { return statement.get(...parameters) || null; },
      async all() { return { results: statement.all(...parameters) }; },
      async run() { return statement.run(...parameters); } };
    return bound;
  } };
}
const origin = 'https://andreavullo.github.io';
function record(fields = {}) { return { version: 1, id: 'run-01234567', name: 'Anna Dojo', gender: 'female', hairstyle: 3, score: 2000, wins: 1, rankIndex: 1, rankId: '10-kyu', rankLabel: '10 KYU', completed: false, reason: 'defeat', matches: 2, elapsedSeconds: 90.123, createdAt: '2026-10-24T15:20:00.000Z', ...fields }; }
function request(fields = {}) { return new Request('https://scores.example/records', { method: fields.method || 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', ...fields.headers }, ...(fields.method === 'OPTIONS' ? {} : { body: fields.raw === undefined ? JSON.stringify(fields.body || record()) : fields.raw }) }); }
const now = Date.now();

test('stores final records durably with only a name and no GitHub credential', async () => {
  const DB = database(), env = { DB };
  const response = await handleRecord(request(), env, { now });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: record().id, stored: true, duplicate: false, githubSynced: false, archiveUrl: 'https://github.com/andreaVullo/kyokushin-spirit-bodyplanet/blob/main/data/arcade-leaderboard.json' });
  assert.equal(status(env).ready, true);
  const read = await readRecords(new Request('https://scores.example/records'), env);
  assert.equal(read.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await read.json()).records[0].name, 'Anna Dojo');
});

test('duplicate concurrent requests count once and altered records cannot overwrite a run', async () => {
  const env = { DB: database() };
  const results = await Promise.all([handleRecord(request(), env, { now }), handleRecord(request(), env, { now })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  assert.equal((await handleRecord(request({ body: record({ score: 3000 }) }), env, { now })).status, 409);
  assert.equal((await readRecords(new Request('https://scores.example/records'), env).then(r => r.json())).total, 1);
});

test('unconfigured, foreign origins, wrong content type, oversized and invalid records never save', async () => {
  assert.equal((await handleRecord(request(), {})).status, 503);
  const cases = [
    [{ headers: { origin: 'https://evil.example' } }, 403], [{ headers: { origin: '' } }, 403],
    [{ headers: { 'content-type': 'text/plain' } }, 415], [{ raw: 'x'.repeat(4097) }, 413],
    [{ raw: '{bad' }, 400], [{ body: record({ score: 1000000 }) }, 400],
  ];
  for (const [input, expected] of cases) {
    const env = { DB: database() };
    assert.equal((await handleRecord(request(input), env, { now })).status, expected);
    assert.equal((await readRecords(new Request('https://scores.example/records'), env).then(r => r.json())).total, 0);
  }
});

test('preflight and D1-backed rate limits work across handler calls without storing raw IPs', async () => {
  const DB = database(), env = { DB };
  assert.equal((await handleRecord(request({ method: 'OPTIONS' }), env)).status, 204);
  for (let i = 0; i < 5; i++) assert.ok([200, 201].includes((await handleRecord(request(), env, { now })).status));
  assert.equal((await handleRecord(request(), env, { now })).status, 429);
  assert.equal(JSON.stringify(DB.sqlite.prepare('SELECT * FROM rate_buckets').all()).includes('203.0.113.5'), false);
  assert.equal((await handleRecord(request(), env, { now: now + 600000 })).status, 200);
});

test('snapshot paginates without dropping records at equal timestamps', async () => {
  const DB = database(), env = { DB };
  const insert = DB.sqlite.prepare('INSERT INTO arcade_records (id, fingerprint, record_json, received_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < 1001; i++) { const data = record({ id: 'run-' + String(i).padStart(8, '0') }); insert.run(data.id, 'test', JSON.stringify(data), now); }
  const first = await readRecords(new Request('https://scores.example/records'), env).then(r => r.json());
  assert.equal(first.records.length, 1000); assert.equal(first.total, 1001); assert.ok(first.nextCursor);
  const second = await readRecords(new Request('https://scores.example/records?after=' + encodeURIComponent(first.nextCursor)), env).then(r => r.json());
  assert.equal(second.records.length, 1); assert.equal(second.records[0].id, 'run-00001000'); assert.equal(second.nextCursor, null);
  assert.equal((await readRecords(new Request('https://scores.example/records?after=bad'), env)).status, 400);
});

test('storage failures remain generic and do not claim a successful save', async () => {
  const env = { DB: { prepare() { throw new Error('private database internals'); } } };
  const result = await handleRecord(request(), env);
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { code: 'storage' });
  assert.equal((await readRecords(new Request('https://scores.example/records'), env)).status, 503);
});


test('ordered snapshot reads use the received-at/id index without a temporary sort', () => {
  const DB = database();
  const plan = DB.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id, record_json, received_at FROM arcade_records WHERE received_at > ? OR (received_at = ? AND id > ?) ORDER BY received_at, id LIMIT ?').all(now, now, 'run-01234567', 1001);
  assert.ok(plan.some(row => row.detail.includes('arcade_records_received_at_id_idx')));
  assert.ok(plan.every(row => !row.detail.includes('TEMP B-TREE')));
});
