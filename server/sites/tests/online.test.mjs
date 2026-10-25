import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleOnline, onlineIceServers } from '../lib/online.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of fs.readdirSync(new URL('../drizzle/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  return { sqlite, prepare(sql) {
    const statement = sqlite.prepare(sql); let parameters = [];
    const bound = { bind(...values) { parameters = values; return bound; },
      async first() { return statement.get(...parameters) || null; },
      async all() { return { results: statement.all(...parameters) }; },
      async run() { return statement.run(...parameters); },
      execute() { return { results: statement.all(...parameters) }; } };
    return bound;
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
}
const origin = 'https://andreavullo.github.io', now = 1792911600000;
const player = (fields = {}) => ({ name: 'Anna Dojo', mode: 'versus', fighter: 'samuel', protocol: 1, ...fields });
function request(path, { method = 'POST', body, token, headers, raw } = {}) {
  return new Request('https://scores.example' + path, { method, headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: raw ?? JSON.stringify(body ?? player()) }) });
}
async function call(env, path, fields = {}, time = now) { const response = await handleOnline(request(path, fields), env, { now: time }); return { response, status: response.status, data: response.status === 204 ? null : await response.json() }; }
async function pair(env, mode = 'versus') {
  const host = (await call(env, '/online/rooms', { body: player({ mode, name: 'Host' }) })).data;
  const guest = (await call(env, `/online/rooms/${host.code}/join`, { body: player({ name: 'Guest', fighter: 'angelo' }) })).data;
  return { host, guest, path: `/online/rooms/${host.code}` };
}

test('private room hides all credentials, joins the host mode, and authenticates both slots', async () => {
  const env = { DB: database() }, { host, guest, path } = await pair(env, 'training');
  assert.match(host.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/); assert.match(host.token, /^[a-f0-9]{64}$/);
  assert.equal(host.role, 'host'); assert.equal(guest.role, 'guest'); assert.equal(guest.room.mode, 'training');
  assert.deepEqual(guest.room.players.map(p => p.slot), [0, 1]); assert.equal(guest.room.status, 'paired');
  assert.equal(JSON.stringify(env.DB.sqlite.prepare('SELECT * FROM online_rooms').all()).includes(host.token), false);
  const read = await call(env, path, { method: 'GET', token: host.token });
  assert.equal(read.status, 200); assert.equal(read.data.room.players[1].name, 'Guest');
  assert.equal(JSON.stringify(read.data).includes('token'), false);
  assert.equal(read.response.headers.get('Access-Control-Allow-Origin'), origin);
  for (const token of [undefined, 'a'.repeat(64), guest.token + 'x']) assert.equal((await call(env, path, { method: 'GET', token })).status, 401);
  assert.equal((await call(env, '/online/rooms/AAAAAA', { method: 'GET', token: host.token })).status, 401);
});

test('concurrent joins allow exactly one guest and never a third player', async () => {
  const env = { DB: database() }, host = (await call(env, '/online/rooms')).data;
  const responses = await Promise.all([call(env, `/online/rooms/${host.code}/join`), call(env, `/online/rooms/${host.code}/join`)]);
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 409]);
  assert.equal(responses.find(result => result.status === 200).data.room.players.length, 2);
});

test('transactional public matchmaking pairs each player once and separates modes', async () => {
  const env = { DB: database() };
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => call(env, '/online/match', { body: player({ name: 'Player ' + i }), headers: { 'cf-connecting-ip': '203.0.113.' + i } })));
  assert.ok(responses.every(result => result.status === 201));
  const counts = new Map();
  for (const response of responses) counts.set(response.data.code, (counts.get(response.data.code) || 0) + 1);
  assert.equal(counts.size, 5); assert.ok([...counts.values()].every(count => count === 2));
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM online_rooms').get().n, 5);
  const training = await call(env, '/online/match', { body: player({ mode: 'training' }) });
  assert.equal(training.data.room.status, 'waiting');
  const versus = await call(env, '/online/match'); assert.equal(versus.data.room.status, 'waiting');
  assert.notEqual(training.data.code, versus.data.code);
});

test('matchmaking ignores private, expired and stale host rooms', async () => {
  const env = { DB: database() };
  const privateRoom = (await call(env, '/online/rooms')).data;
  const staleRoom = (await call(env, '/online/match')).data;
  const next = (await call(env, '/online/match', {}, now + 61000)).data;
  assert.equal(next.room.status, 'waiting'); assert.notEqual(next.code, staleRoom.code); assert.notEqual(next.code, privateRoom.code);
  assert.equal((await call(env, `/online/rooms/${privateRoom.code}/join`, {}, now + 61000)).status, 409);
});

test('ready and fighter updates affect only the authenticated slot and reset readiness on changed fighter', async () => {
  const env = { DB: database() }, { host, guest, path } = await pair(env);
  const update = await call(env, path, { token: guest.token, body: { action: 'update', fighter: 'andrea-vullo', ready: true } });
  assert.equal(update.status, 200); assert.equal(update.data.room.players[1].fighter, 'andrea-vullo'); assert.equal(update.data.room.players[1].ready, true);
  assert.equal(update.data.room.players[0].fighter, 'samuel'); assert.equal(update.data.room.revision, 3);
  const changed = await call(env, path, { token: guest.token, body: { action: 'update', fighter: 'angelo' } });
  assert.equal(changed.data.room.players[1].ready, false);
  assert.equal((await call(env, path, { token: host.token, body: { action: 'update', fighter: 'marco-tabacco-foto-gruppo' } })).status, 400);
});

test('signalling is ordered, recipient-only, bounded and never a frame relay', async () => {
  const env = { DB: database() }, { host, guest, path } = await pair(env);
  const offer = { action: 'signal', type: 'offer', payload: { type: 'offer', sdp: 'v=0\r\ns=test\r\n' } };
  const first = await call(env, path, { token: host.token, body: offer }); assert.equal(first.status, 200);
  const second = await call(env, path, { token: host.token, body: { action: 'signal', type: 'candidate', payload: { candidate: 'candidate:123', sdpMid: '0', sdpMLineIndex: 0 } } });
  assert.ok(second.data.seq > first.data.seq);
  const received = await call(env, path, { method: 'GET', token: guest.token });
  assert.deepEqual(received.data.messages.map(m => [m.type, m.from]), [['offer', 0], ['candidate', 0]]);
  const own = await call(env, path, { method: 'GET', token: host.token }); assert.deepEqual(own.data.messages, []);
  const after = await call(env, path + '?after=' + first.data.seq, { method: 'GET', token: guest.token }, now + 300);
  assert.deepEqual(after.data.messages.map(m => m.type), ['candidate']);
  assert.equal((await call(env, path, { token: guest.token, body: offer })).status, 400);
  assert.equal((await call(env, path, { token: host.token, body: { action: 'signal', type: 'snapshot', payload: { x: 2 } } })).status, 400);
  assert.equal((await call(env, path, { token: host.token, body: { action: 'signal', type: 'control', payload: { type: 'frame', x: 2 } } })).status, 400);
  assert.equal((await call(env, path, { token: host.token, body: { ...offer, payload: { type: 'offer', sdp: 'v=0' + 'x'.repeat(12001) } } })).status, 400);
});

test('heartbeats extend lifetime without changing revision; stale sessions and leave expire both peers', async () => {
  const env = { DB: database() }, { host, guest, path } = await pair(env);
  for (const token of [host.token, guest.token]) {
    const beat = await call(env, path, { token, body: { action: 'heartbeat' } }, now + 55000);
    assert.equal(beat.status, 200); assert.equal(beat.data.room.revision, 2); assert.equal(beat.data.expiresAt, now + 55000 + 1800000);
  }
  assert.equal((await call(env, path, { method: 'GET', token: host.token }, now + 114000)).status, 200);
  assert.equal((await call(env, path, { method: 'GET', token: host.token }, now + 116000)).status, 410);
  const env2 = { DB: database() }, active = await pair(env2);
  assert.equal((await call(env2, active.path, { token: active.host.token, body: { action: 'leave' } })).data.room.status, 'closed');
  assert.equal((await call(env2, active.path, { method: 'GET', token: active.guest.token })).status, 410);
});

test('strict CORS, input validation and preflight protect every room endpoint', async () => {
  const env = { DB: database() };
  const preflight = await call(env, '/online/rooms', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204); assert.match(preflight.response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  for (const fields of [{ headers: { origin: 'https://evil.example' } }, { headers: { origin: '' } }]) assert.equal((await call(env, '/online/rooms', fields)).status, 403);
  assert.equal((await call(env, '/online/rooms', { raw: 'x'.repeat(16385) })).status, 413);
  assert.equal((await call(env, '/online/rooms', { raw: '{}' })).status, 400);
  assert.equal((await call(env, '/online/rooms', { headers: { 'content-type': 'text/plain' } })).status, 415);
  for (const fields of [{ name: 'x'.repeat(25) }, { protocol: 2 }, { fighter: 'arcade-male' }, { mode: 'ranked' }, { name: 'x\u202ey' }]) assert.equal((await call(env, '/online/rooms', { body: player(fields) })).status, 400);
  assert.equal((await call({ DB: env.DB, ALLOWED_ORIGINS: 'http://127.0.0.1:8765' }, '/online/rooms', { headers: { origin: 'http://127.0.0.1:8765' } })).status, 201);
});

test('creation rate limits hash addresses and authenticated polling has no global counter', async () => {
  const env = { DB: database() }, host = (await call(env, '/online/rooms')).data;
  for (let i = 0; i < 11; i++) assert.equal((await call(env, '/online/rooms')).status, 201);
  assert.equal((await call(env, '/online/rooms')).status, 429);
  const count = env.DB.sqlite.prepare('SELECT SUM(count) AS n FROM rate_buckets').get().n;
  const path = '/online/rooms/' + host.code;
  assert.equal((await call(env, path, { method: 'GET', token: host.token })).status, 200);
  assert.equal((await call(env, path, { method: 'GET', token: host.token })).status, 429);
  assert.equal((await call(env, path, { method: 'GET', token: host.token }, now + 300)).status, 200);
  assert.equal(env.DB.sqlite.prepare('SELECT SUM(count) AS n FROM rate_buckets').get().n, count);
  assert.equal(JSON.stringify(env.DB.sqlite.prepare('SELECT * FROM rate_buckets').all()).includes('203.0.113.5'), false);
});

test('expired room cleanup cascades signals and preserves leaderboard records', async () => {
  const env = { DB: database() }, { host, path } = await pair(env);
  await call(env, path, { token: host.token, body: { action: 'signal', type: 'offer', payload: { type: 'offer', sdp: 'v=0' } } });
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM online_signals').get().n, 1);
  env.DB.sqlite.prepare('INSERT INTO arcade_records VALUES (?, ?, ?, ?)').run('keep-me', 'fingerprint', '{}', now);
  await call(env, '/online/rooms', {}, now + 1800001);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM online_signals').get().n, 0);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM arcade_records').get().n, 1);
});

test('relay configuration is optional and validates only TURN URLs; errors do not leak internals', async () => {
  assert.deepEqual(onlineIceServers({}), [{ urls: 'stun:stun.cloudflare.com:3478' }]);
  assert.equal(onlineIceServers({ TURN_ICE_SERVERS_JSON: 'bad' }).length, 1);
  assert.equal(onlineIceServers({ TURN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'https://evil.example', username: 'u', credential: 'secret' }]) }).length, 1);
  assert.equal(onlineIceServers({ TURN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turns:turn.example:443?transport=tcp', username: 'ephemeral', credential: 'short-lived' }]) }).length, 2);
  const failed = await call({ DB: { prepare() { throw new Error('private database error'); } } }, '/online/rooms');
  assert.equal(failed.status, 503); assert.deepEqual(failed.data, { error: 'Connessione al servizio online non riuscita.', code: 'storage' });
  assert.equal((await call({}, '/online/rooms')).status, 503);
});

test('new white-belt karateka can create and join an online room', async () => {
  const env = { DB: database() };
  const host = await call(env, '/online/rooms', { body: player({ fighter: 'emanuele-micalizzi' }) });
  assert.equal(host.status, 201);
  const guest = await call(env, `/online/rooms/${host.data.code}/join`, { body: player({ fighter: 'francesco-privitera-1' }) });
  assert.equal(guest.status, 200);
  assert.deepEqual(guest.data.room.players.map(p => p.fighter), ['emanuele-micalizzi', 'francesco-privitera-1']);
});
