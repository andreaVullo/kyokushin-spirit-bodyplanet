'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHandler } = require('../server/leaderboard-server.cjs');

const origin = 'https://andreavullo.github.io';
function record(fields = {}) {
  return { version: 1, id: 'run-01234567', name: 'Anna Dojo', gender: 'female', hairstyle: 3, score: 2000,
    wins: 1, rankIndex: 1, rankId: '10-kyu', rankLabel: '10 KYU', completed: false, reason: 'defeat',
    matches: 2, elapsedSeconds: 90.123, createdAt: '2026-10-24T15:20:00.000Z', ...fields };
}
function github() {
  const calls = [], issues = [];
  return { calls, issues, fetch: async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      const issue = { ...payload, number: issues.length + 1, user: { login: 'dojo-service' }, labels: [] };
      issues.unshift(issue);
      return { ok: true, json: async () => issue };
    }
    return { ok: true, json: async () => issues };
  } };
}
function handler(api, options = {}) { return createHandler({ token: 'test-server-only-secret', origins: [origin], fetch: api.fetch, ...options }); }
async function request(handle, options = {}) {
  const payload = options.raw === undefined ? JSON.stringify(options.body || record()) : options.raw;
  const req = Readable.from([Buffer.from(payload)]);
  req.method = options.method || 'POST'; req.url = options.url || '/records';
  req.headers = { origin, 'content-type': 'application/json', ...options.headers };
  req.socket = { remoteAddress: options.ip || '127.0.0.1' };
  let status, headers, result;
  const res = { writeHead(code, values) { status = code; headers = values; }, end(body) { result = JSON.parse(body || '{}'); } };
  await handle(req, res);
  return { status, headers, body: result };
}

test('anonymous record is stored through GitHub using only the server credential', async () => {
  const api = github(), result = await request(handler(api));
  assert.equal(result.status, 201);
  assert.equal(result.body.id, record().id);
  assert.equal(result.body.issueNumber, 1);
  assert.equal(result.headers['Access-Control-Allow-Origin'], origin);
  const write = api.calls.find(call => call.options.method === 'POST');
  assert.equal(write.options.headers.Authorization, 'Bearer test-server-only-secret');
  assert.ok(JSON.parse(write.options.body).body.includes('il giocatore non deve avere un account GitHub'));
  assert.equal(JSON.stringify(result).includes('test-server-only-secret'), false);
});

test('origin allowlist, JSON type, payload size and schema reject writes before GitHub', async () => {
  const api = github(), handle = handler(api, { perIpLimit: 20 });
  assert.equal((await request(handle, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request(handle, { headers: { origin: '' } })).status, 403);
  assert.equal((await request(handle, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(handle, { raw: 'x'.repeat(4097) })).status, 413);
  assert.equal((await request(handle, { raw: '{broken' })).status, 400);
  assert.equal((await request(handle, { body: record({ score: 999999 }) })).status, 400);
  assert.equal((await request(handle, { headers: { 'content-length': '5000' } })).status, 413);
  assert.equal(api.calls.length, 0);
});

test('preflight allows only configured origin and exposes no credentials', async () => {
  const api = github(), handle = handler(api);
  const preflight = await request(handle, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Headers'], 'Content-Type');
  assert.equal(preflight.headers['Access-Control-Allow-Credentials'], undefined);
  assert.equal((await request(handle, { method: 'OPTIONS', headers: { origin: 'null' } })).status, 403);
  assert.equal(api.calls.length, 0);
});

test('repeat and concurrent submissions create only one issue; changed payload cannot overwrite it', async () => {
  const api = github(), handle = handler(api);
  const results = await Promise.all([request(handle), request(handle)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  assert.equal(api.calls.filter(call => call.options.method === 'POST').length, 1);
  assert.equal((await request(handle)).body.duplicate, true);
  assert.equal((await request(handle, { body: record({ score: 2100 }) })).status, 409);
});

test('persistent index survives server restart without creating or reading another GitHub issue', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dojo-leaderboard-'));
  const storePath = path.join(directory, 'index.json');
  try {
    const api = github(), first = handler(api, { storePath }); await first.ready;
    assert.equal((await request(first)).status, 201);
    const count = api.calls.length;
    const second = handler(api, { storePath }); await second.ready;
    assert.equal((await request(second)).body.duplicate, true);
    assert.equal(api.calls.length, count);
    assert.equal((await fs.readFile(storePath, 'utf8')).includes('test-server-only-secret'), false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('GitHub archive recovers deduplication if the service has no local index', async () => {
  const api = github(); await request(handler(api));
  const result = await request(handler(api));
  assert.equal(result.status, 200);
  assert.equal(result.body.duplicate, true);
  assert.equal(api.calls.filter(call => call.options.method === 'POST').length, 1);
});

test('per-address and global limits reject excessive publication without trusting forwarded headers', async () => {
  const api = github(), handle = handler(api, { perIpLimit: 2, globalLimit: 10 });
  await request(handle);
  await request(handle, { headers: { 'x-forwarded-for': '203.0.113.8' } });
  const blocked = await request(handle, { headers: { 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '600');
  const globalHandle = handler(github(), { globalLimit: 2 });
  await request(globalHandle, { ip: '1.1.1.1' });
  await request(globalHandle, { ip: '2.2.2.2' });
  assert.equal((await request(globalHandle, { ip: '3.3.3.3' })).status, 429);
});

test('upstream errors and missing setup return safe failures without leaking server secrets', async () => {
  const handle = handler({ fetch: async () => { throw new Error('Authorization test-server-only-secret'); } });
  const failed = await request(handle);
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.body, { code: 'upstream' });
  assert.equal(JSON.stringify(failed).includes('test-server-only-secret'), false);
  const unconfigured = handler(github(), { token: '' });
  assert.equal((await request(unconfigured)).status, 503);
  const health = await request(unconfigured, { method: 'GET', url: '/health' });
  assert.deepEqual(health.body, { ready: false });
});
