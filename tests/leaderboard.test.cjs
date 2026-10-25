'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DojoLeaderboard = require('../scripts/leaderboard.js');

function record(overrides = {}) {
  return { version: 1, id: 'run-01234567', name: 'Andrea Vullo', gender: 'male', hairstyle: 0,
    score: 3000, wins: 2, rankIndex: 2, rankId: '9-kyu', rankLabel: '9 Kyu', completed: false,
    reason: 'defeat', matches: 3, elapsedSeconds: 120, createdAt: '2026-10-24T15:20:00.000Z', ...overrides };
}
function issue(result = record(), overrides = {}) {
  return { title: `[ARCADE RECORD] ${result.name}`, number: 1, labels: [],
    body: DojoLeaderboard.issueBody(result), user: { login: 'andreaVullo' }, ...overrides };
}
function response(issues = [], { status = 200, next = false } = {}) {
  return { ok: status === 200, status, json: async () => issues,
    headers: { get: name => name === 'link' && next ? '<https://api.github.com/next>; rel="next"' : null } };
}

test('normalizes Unicode names without accepting hidden controls or markup', () => {
  assert.equal(DojoLeaderboard.validateRecord(record({ name: '  Jose\u0301  D’Angelo  ' })).name, 'José D’Angelo');
  for (const name of ['A', ' '.repeat(40), 'A'.repeat(25), '- .', '<img src=x>', '@github', 'Nome\u200B', 'A\nB', '\tAndrea']) {
    assert.throws(() => DojoLeaderboard.validateRecord(record({ name })), { code: 'invalid-record' }, name);
  }
});

test('only final records with consistent progression and bounded scores are accepted', () => {
  for (const update of [
    { version: 2 }, { id: '../id' }, { gender: 'other' }, { hairstyle: 5 }, { score: 91401 },
    { score: -1 }, { score: NaN }, { score: 1.5 }, { wins: 21 }, { rankIndex: 3 },
    { matches: 2 }, { matches: 21 }, { elapsedSeconds: 72001 }, { elapsedSeconds: -1 },
    { completed: true }, { reason: 'playing' }, { reason: 'completed' },
    { reason: 'abandoned', matches: 3 }, { createdAt: 'tomorrow' }, { createdAt: '2099-01-01T00:00:00Z' },
  ]) assert.throws(() => DojoLeaderboard.validateRecord(record(update)), { code: 'invalid-record' });
  assert.equal(DojoLeaderboard.validateRecord(record({ wins: 20, rankIndex: 20, matches: 20, completed: true, reason: 'completed', score: 91400 })).rankId, '10-dan');
  assert.equal(DojoLeaderboard.validateRecord(record({ wins: 0, rankIndex: 0, matches: 0, reason: 'abandoned', score: 0 })).rankId, 'mukyu');
  assert.throws(() => DojoLeaderboard.validateRecord(record({ wins: 0, rankIndex: 0, matches: 0, reason: 'abandoned', score: 1 })));
});

test('server-facing payload discards extra fields and untrusted rank labels', () => {
  const result = DojoLeaderboard.validateRecord(record({ rankLabel: '<script>', rankId: '10-dan', githubUser: 'admin', saveGame: { phase: 'fight' } }));
  assert.equal(result.rankLabel, '9 KYU');
  assert.equal(result.rankId, '9-kyu');
  assert.equal(Object.hasOwn(result, 'githubUser'), false);
  assert.equal(Object.hasOwn(result, 'saveGame'), false);
  assert.equal(Object.isFrozen(result), true);
});

test('publication uses an anonymous relay and never sends the player to a GitHub login', () => {
  const client = new DojoLeaderboard();
  const submission = client.submission(record({ name: 'D’Angelo José' }));
  assert.equal(submission.requiresLogin, false);
  assert.equal(submission.configured, false);
  assert.equal(submission.public, true);
  assert.equal(submission.url, undefined);
  const body = DojoLeaderboard.issueBody(record({ name: 'D’Angelo José' }));
  assert.ok(body.includes('non permette di riprendere la partita'));
  const parsed = DojoLeaderboard.parseIssue(issue(record(), { body }));
  assert.equal(parsed.name, 'D’Angelo José');
});

test('only marked issue records are accepted, excluding pull requests and moderated records', () => {
  assert.equal(DojoLeaderboard.parseIssue(issue()).githubUser, 'andreaVullo');
  assert.equal(DojoLeaderboard.parseIssue(issue(record(), { labels: [null] })).githubUser, 'andreaVullo');
  for (const update of [
    { title: 'Unrelated issue' }, { body: '{}' }, { body: '<!-- kyokushin-arcade-record-v1 -->\n```json\ninvalid\n```' },
    { pull_request: {} }, { labels: [{ name: 'arcade-rejected' }] }, { labels: ['arcade-rejected'] },
    { user: { login: '<script>' } }, { labels: null }, { body: 'a'.repeat(6001) },
  ]) assert.equal(DojoLeaderboard.parseIssue(issue(record(), update)), null);
});

test('GitHub authorship comes from the issue API, never the submitted JSON', () => {
  const item = issue();
  item.body = item.body.replace('"version": 1,', '"version": 1, "githubUser":"spoofed",');
  assert.equal(DojoLeaderboard.parseIssue(item).githubUser, 'andreaVullo');
});

test('ranking favors belt progress, then points, then lower duration; duplicate runs count once', () => {
  const rows = [
    record({ id: 'run-00000001', score: 9000 }),
    record({ id: 'run-00000002', rankIndex: 3, wins: 3, matches: 4, score: 1000 }),
    record({ id: 'run-00000003', score: 9000, elapsedSeconds: 100 }),
    record({ id: 'run-00000003', score: 9000, elapsedSeconds: 100 }),
    { invalid: true },
  ];
  assert.deepEqual(DojoLeaderboard.rankRecords(rows).map(row => row.id), ['run-00000002', 'run-00000003', 'run-00000001']);
});

test('pagination reads public issues without sending cookies or authorization and exposes truncation', async () => {
  const calls = [];
  const client = new DojoLeaderboard({ maxPages: 2, fetch: async (url, options) => {
    calls.push({ url, options });
    return response([issue(record({ id: `run-0000000${calls.length}` }), { number: calls.length })], { next: true });
  } });
  const result = await client.load();
  assert.equal(result.entries.length, 2);
  assert.equal(result.partial, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes('page=2'));
  for (const { options } of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(Object.keys(options.headers).some(key => key.toLowerCase() === 'authorization'), false);
  }
});

test('real empty leaderboard remains empty instead of adding sample records', async () => {
  const result = await new DojoLeaderboard({ fetch: async () => response([]) }).load();
  assert.deepEqual(result.entries, []);
  assert.equal(result.partial, false);
});

test('publication checks retain records outside the visible top fifty and the first hundred', async () => {
  let page = 0;
  const client = new DojoLeaderboard({ fetch: async () => {
    page++;
    return response(Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => issue(record({
      id: `run-${String((page - 1) * 100 + index).padStart(8, '0')}`,
      score: page === 1 ? 3000 : 1,
    }), { number: (page - 1) * 100 + index + 1 })), { next: page === 1 });
  } });
  const details = await client.load();
  assert.equal(details.entries.length, 101);
  assert.equal(details.entries[100].id, 'run-00000100');
});

test('concurrent requests coalesce and successful responses cache only in the client instance', async () => {
  let calls = 0;
  const client = new DojoLeaderboard({ fetch: async () => { calls++; return response([issue()]); } });
  const [first, second] = await Promise.all([client.load(), client.load()]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(await client.load(), first);
  await client.load({ force: true });
  assert.equal(calls, 2);
  assert.equal(new DojoLeaderboard().cached, null);
});

test('rate limits, disabled issues and broken network stay visible and permit manual retry', async () => {
  for (const [status, code] of [[403, 'rate-limit'], [429, 'rate-limit'], [404, 'not-enabled'], [410, 'not-enabled'], [500, 'unavailable']]) {
    let working = false;
    const client = new DojoLeaderboard({ fetch: async () => response([], { status: working ? 200 : status }) });
    await assert.rejects(client.load(), { code });
    working = true;
    assert.deepEqual((await client.load({ force: true })).entries, []);
  }
  await assert.rejects(new DojoLeaderboard({ fetch: async () => { throw new Error('network'); } }).load(), { code: 'offline' });
  await assert.rejects(new DojoLeaderboard({ fetch: async () => response({}) }).load(), { code: 'invalid-response' });
});

test('timeout aborts a pending request without retaining a stuck promise', async () => {
  const client = new DojoLeaderboard({ timeout: 5, fetch: (_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) });
  await assert.rejects(client.load(), { code: 'offline' });
  assert.equal(client.pending, null);
});

test('static API exposes the integration functions without a persistent game save', () => {
  assert.equal(typeof DojoLeaderboard.load, 'function');
  assert.equal(typeof DojoLeaderboard.submission, 'function');
  assert.equal(DojoLeaderboard.details(), null);
  const source = require('node:fs').readFileSync(require.resolve('../scripts/leaderboard.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
});

test('actual Arcade runs submit with fractional real-time duration through defeat and all twenty ranks', () => {
  const Arcade = require('../scripts/arcade.js');
  function run() { return Arcade.createRun({ name: 'Anna Dojo', gender: 'female', hairstyle: 4, now: () => Date.UTC(2026, 9, 24) }); }
  function finishMatch(session, winner) {
    session.recordMatch({ matchId: session.nextMatch().matchId, winner, elapsed: 45.267,
      playerMaxHp: 1000, playerHp: winner === 0 ? 700 : 0, playerRounds: winner === 0 ? 2 : 1,
      opponentRounds: winner === 0 ? 1 : 2, hits: 10, blocks: 2, maxCombo: 3 });
  }
  const lost = run();
  finishMatch(lost, 1);
  assert.equal(DojoLeaderboard.validateRecord(lost.finalRecord()).elapsedSeconds, 45.267);
  const champion = run();
  for (let i = 0; i < 20; i++) finishMatch(champion, 0);
  assert.equal(DojoLeaderboard.validateRecord(champion.finalRecord()).rankLabel, '10 DAN');
  assert.equal(DojoLeaderboard.submission(champion.finalRecord()).requiresLogin, false);
  const abandoned = run();
  abandoned.finish();
  assert.equal(DojoLeaderboard.validateRecord(abandoned.finalRecord()).score, 0);
});

test('anonymous submit confirms only a matching GitHub record and sends no browser credentials', async () => {
  let call;
  const client = new DojoLeaderboard({ endpoint: 'https://scores.example.org/records', fetch: async (url, options) => {
    call = { url, options };
    return { ok: true, status: 201, json: async () => ({ id: 'run-01234567', issueNumber: 9,
      url: 'https://github.com/andreaVullo/kyokushin-spirit-bodyplanet/issues/9', duplicate: false }) };
  } });
  const saved = await client.submit(record());
  assert.equal(saved.issueNumber, 9);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'omit');
  assert.equal(call.options.headers.Authorization, undefined);
  assert.equal(JSON.parse(call.options.body).name, 'Andrea Vullo');
  assert.equal(client.submission(record()).configured, true);
});

test('unconfigured or failing relay reports errors without pretending a result was saved', async () => {
  await assert.rejects(new DojoLeaderboard().submit(record()), { code: 'not-configured' });
  for (const [status, code] of [[400, 'invalid-record'], [403, 'origin'], [409, 'conflict'], [429, 'rate-limit'], [502, 'unavailable'], [503, 'unavailable']]) {
    const client = new DojoLeaderboard({ endpoint: 'https://scores.example.org/records', fetch: async () => ({ ok: false, status }) });
    await assert.rejects(client.submit(record()), { code });
  }
  await assert.rejects(new DojoLeaderboard({ endpoint: 'https://scores.example.org/records', fetch: async () => response({ id: 'wrong' }) }).submit(record()), { code: 'invalid-response' });
  assert.throws(() => new DojoLeaderboard({ endpoint: 'http://scores.example.org/records' }));
  assert.throws(() => new DojoLeaderboard({ endpoint: 'https://secret@example.org/records' }));
});

test('D1 service confirms immediate storage while explicitly leaving GitHub synchronization pending', async () => {
  const client = new DojoLeaderboard({ endpoint: 'https://scores.example.org/records', fetch: async () => response({
    id: record().id, stored: true, duplicate: false, githubSynced: false,
    archiveUrl: 'https://github.com/andreaVullo/kyokushin-spirit-bodyplanet/blob/main/data/arcade-leaderboard.json',
  }) });
  const saved = await client.submit(record());
  assert.equal(saved.stored, true); assert.equal(saved.githubSynced, false);
  assert.equal(saved.issueNumber, undefined);
});

test('live service pagination and GitHub archive fallback preserve real result provenance', async () => {
  const calls = [];
  const client = new DojoLeaderboard({ endpoint: 'https://scores.example.org/records', fetch: async url => {
    calls.push(url);
    return response({ version: 1, records: [record({ id: calls.length === 1 ? 'run-00000001' : 'run-00000002' })],
      updatedAt: '2026-10-25T00:00:00Z', nextCursor: calls.length === 1 ? '123456789.run-00000001' : null });
  } });
  const live = await client.load();
  assert.equal(live.entries.length, 2); assert.equal(live.archive, false);
  assert.ok(calls[1].includes('after='));
  const fallback = new DojoLeaderboard({ endpoint: 'https://scores.example.org/records', fetch: async url => {
    if (url.startsWith('https://scores.')) throw new Error('offline');
    assert.ok(url.startsWith('https://raw.githubusercontent.com/andreaVullo/kyokushin-spirit-bodyplanet/'));
    return response({ version: 1, records: [record()], updatedAt: '2026-10-24T00:00:00Z' });
  } });
  const archived = await fallback.load();
  assert.equal(archived.archive, true); assert.equal(archived.entries.length, 1);
});
