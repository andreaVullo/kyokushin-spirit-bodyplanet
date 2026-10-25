import { allowedOrigins } from './service.mjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 30 * 60_000;
const STALE_AFTER = 60_000;
const MAX_BODY = 16_384;
const ROSTER = new Set(['angelo', 'samuel', 'marco-tabacco-collage', 'gabriele-carbonaro', 'leonardo-cappellani', 'gabriele-randazzo', 'matteo-spata', 'oscar-gueli', 'andrea-barbagallo', 'andrea-vullo', 'emanuele-micalizzi', 'francesco-privitera-1']);
const errors = {
  origin: 'Sito non autorizzato.', method: 'Operazione non disponibile.', 'not-configured': 'Servizio online non disponibile.',
  'content-type': 'Formato della richiesta non valido.', 'too-large': 'Richiesta troppo grande.', invalid: 'Dati della stanza non validi.',
  auth: 'Accesso alla stanza non valido.', 'room-unavailable': 'Stanza non disponibile o già occupata.',
  'room-expired': 'Stanza scaduta o avversario disconnesso.', 'rate-limit': 'Troppe richieste: attendi un momento.',
  storage: 'Connessione al servizio online non riuscita.', 'signal-limit': 'Connessione interrotta: crea una nuova stanza.',
};
function failure(code, status = 400) { return Object.assign(new Error(code), { status }); }
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function secret() { return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function roomCode() { return [...crypto.getRandomValues(new Uint8Array(6))].map(byte => CODE_ALPHABET[byte & 31]).join(''); }
function canonicalCode(value) {
  const code = String(value || '').toUpperCase();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) throw failure('invalid');
  return code;
}
async function jsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw failure('content-type', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw failure('too-large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw failure('invalid');
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw failure('too-large', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('invalid');
    return data;
  } catch { throw failure('invalid'); }
}
function playerOf(data) {
  if (typeof data.name !== 'string') throw failure('invalid');
  const name = data.name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 24 || /[\p{Cc}\p{Cf}]/u.test(name) || !ROSTER.has(data.fighter) || !['versus', 'training'].includes(data.mode) || data.protocol !== 1) throw failure('invalid');
  return { name, fighter: data.fighter, mode: data.mode };
}
export function onlineIceServers(env) {
  const servers = [{ urls: 'stun:stun.cloudflare.com:3478' }];
  if (!env.TURN_ICE_SERVERS_JSON) return servers;
  try {
    const supplied = JSON.parse(env.TURN_ICE_SERVERS_JSON);
    if (!Array.isArray(supplied) || supplied.length > 4) return servers;
    for (const item of supplied) {
      const urls = typeof item?.urls === 'string' ? [item.urls] : item?.urls;
      if (!Array.isArray(urls) || !urls.length || urls.length > 4 || urls.some(url => typeof url !== 'string' || url.length > 160 || !/^turns?:[^\s/?#]+(?::\d+)?(?:\?transport=(?:tcp|udp))?$/.test(url)) || typeof item.username !== 'string' || item.username.length > 256 || typeof item.credential !== 'string' || item.credential.length > 1024) continue;
      servers.push({ urls: item.urls, username: item.username, credential: item.credential });
    }
  } catch { /* A missing relay never invents credentials or exposes configuration errors. */ }
  return servers;
}
function publicRoom(row, role) {
  const players = [{ slot: 0, name: row.host_name, fighter: row.host_fighter, ready: !!row.host_ready, lastSeen: row.host_seen }];
  if (row.guest_token) players.push({ slot: 1, name: row.guest_name, fighter: row.guest_fighter, ready: !!row.guest_ready, lastSeen: row.guest_seen });
  return { code: row.code, mode: row.mode, status: row.status, revision: row.revision, players, role };
}
async function rate(env, request, now, tokenHash) {
  const window = Math.floor(now / 60_000);
  const identity = tokenHash || await digest(`kyokushin-dojo-online\n${window}\n${request.headers.get('cf-connecting-ip') || 'unknown'}`);
  const key = `online:${tokenHash ? 'session' : 'address'}:${window}:${identity}`;
  const row = await env.DB.prepare('INSERT INTO rate_buckets (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').bind(key, (window + 1) * 60_000).first();
  if (row.count > (tokenHash ? 180 : 12)) throw failure('rate-limit', 429);
}
async function cleanup(db, now) {
  await db.batch([
    db.prepare('DELETE FROM online_rooms WHERE code IN (SELECT code FROM online_rooms WHERE expires_at < ? ORDER BY expires_at LIMIT 100)').bind(now),
    db.prepare('DELETE FROM rate_buckets WHERE key IN (SELECT key FROM rate_buckets WHERE expires_at < ? LIMIT 100)').bind(now),
  ]);
}
function insertRoom(db, code, hash, player, isPublic, now) {
  return db.prepare(`INSERT INTO online_rooms (code, mode, public, protocol, status, revision, created_at, expires_at, host_token, host_name, host_fighter, host_ready, host_seen, host_poll, guest_ready, guest_poll)
    VALUES (?, ?, ?, 1, 'waiting', 1, ?, ?, ?, ?, ?, 0, ?, 0, 0, 0) ON CONFLICT(code) DO NOTHING`)
    .bind(code, player.mode, isPublic ? 1 : 0, now, now + ROOM_TTL, hash, player.name, player.fighter, now);
}
async function createRoom(request, env, now, matchmaking) {
  const player = playerOf(await jsonBody(request));
  await rate(env, request, now);
  await cleanup(env.DB, now);
  const token = secret(), hash = await digest(token);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = roomCode();
    const statements = [insertRoom(env.DB, code, hash, player, matchmaking, now)];
    if (matchmaking) {
      // D1 batch is transactional: no other match can claim either participant halfway through.
      statements.push(env.DB.prepare(`UPDATE online_rooms SET guest_token = ?, guest_name = ?, guest_fighter = ?, guest_seen = ?, guest_ready = 0, guest_poll = 0, status = 'paired', revision = revision + 1, expires_at = ?
        WHERE code = (SELECT code FROM online_rooms WHERE public = 1 AND mode = ? AND protocol = 1 AND status = 'waiting' AND guest_token IS NULL AND expires_at > ? AND host_seen >= ? AND code <> ? ORDER BY created_at, code LIMIT 1)
        AND guest_token IS NULL AND EXISTS (SELECT 1 FROM online_rooms WHERE code = ? AND host_token = ? AND guest_token IS NULL AND status = 'waiting')`)
        .bind(hash, player.name, player.fighter, now, now + ROOM_TTL, player.mode, now, now - STALE_AFTER, code, code, hash));
      statements.push(env.DB.prepare('DELETE FROM online_rooms WHERE code = ? AND host_token = ? AND EXISTS (SELECT 1 FROM online_rooms WHERE guest_token = ?)').bind(code, hash, hash));
    }
    statements.push(env.DB.prepare('SELECT * FROM online_rooms WHERE host_token = ? OR guest_token = ?').bind(hash, hash));
    const results = await env.DB.batch(statements);
    const row = results.at(-1).results?.[0];
    if (!row) continue;
    const role = row.host_token === hash ? 'host' : 'guest';
    return { status: 201, data: { code: row.code, token, role, room: publicRoom(row, role), iceServers: onlineIceServers(env), expiresAt: row.expires_at } };
  }
  throw failure('storage', 503);
}
async function joinRoom(request, env, code, now) {
  const player = playerOf(await jsonBody(request));
  await rate(env, request, now);
  const token = secret(), hash = await digest(token);
  const row = await env.DB.prepare(`UPDATE online_rooms SET guest_token = ?, guest_name = ?, guest_fighter = ?, guest_seen = ?, guest_ready = 0, guest_poll = 0, status = 'paired', revision = revision + 1, expires_at = ?
    WHERE code = ? AND protocol = 1 AND status = 'waiting' AND guest_token IS NULL AND expires_at > ? AND host_seen >= ? RETURNING *`)
    .bind(hash, player.name, player.fighter, now, now + ROOM_TTL, code, now, now - STALE_AFTER).first();
  if (!row) throw failure('room-unavailable', 409);
  return { status: 200, data: { code, token, role: 'guest', room: publicRoom(row, 'guest'), iceServers: onlineIceServers(env), expiresAt: row.expires_at } };
}
async function authorize(request, env, code, now) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if (!token) throw failure('auth', 401);
  const hash = await digest(token);
  const row = await env.DB.prepare('SELECT * FROM online_rooms WHERE code = ? AND (host_token = ? OR guest_token = ?)').bind(code, hash, hash).first();
  if (!row) throw failure('auth', 401);
  const role = row.host_token === hash ? 'host' : 'guest';
  if (row.status === 'closed' || row.expires_at <= now || row.host_seen < now - STALE_AFTER || (row.guest_token && row.guest_seen < now - STALE_AFTER)) throw failure('room-expired', 410);
  return { row, hash, role, slot: role === 'host' ? 0 : 1 };
}
async function readRoom(request, env, code, now) {
  const { row, role } = await authorize(request, env, code, now);
  const cursor = new URL(request.url).searchParams.get('after') || '0';
  if (!/^\d{1,15}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) throw failure('invalid');
  const changed = await env.DB.prepare(`UPDATE online_rooms SET ${role}_poll = ? WHERE code = ? AND ${role}_poll <= ? RETURNING code`).bind(now, code, now - 250).first();
  if (!changed) throw failure('rate-limit', 429);
  const { results } = await env.DB.prepare('SELECT seq, sender, type, payload FROM online_signals WHERE room_code = ? AND seq > ? AND sender <> ? ORDER BY seq LIMIT 128').bind(code, Number(cursor), role === 'host' ? 0 : 1).all();
  return { status: 200, data: { room: publicRoom(row, role), messages: results.map(message => ({ seq: message.seq, from: message.sender, type: message.type, payload: JSON.parse(message.payload) })), iceServers: onlineIceServers(env), expiresAt: row.expires_at } };
}
function signalOf(data, role) {
  if (!['offer', 'answer', 'candidate', 'control'].includes(data.type)) throw failure('invalid');
  const payload = data.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure('invalid');
  if (data.type === 'offer' || data.type === 'answer') {
    if ((data.type === 'offer' && role !== 'host') || (data.type === 'answer' && role !== 'guest') || payload.type !== data.type || typeof payload.sdp !== 'string' || !payload.sdp.startsWith('v=0') || payload.sdp.length > 12_000) throw failure('invalid');
    return { type: data.type, payload: JSON.stringify({ type: data.type, sdp: payload.sdp }) };
  }
  if (data.type === 'candidate') {
    if (typeof payload.candidate !== 'string' || payload.candidate.length > 1536 || (payload.sdpMid != null && (typeof payload.sdpMid !== 'string' || payload.sdpMid.length > 64)) || (payload.sdpMLineIndex != null && (!Number.isInteger(payload.sdpMLineIndex) || payload.sdpMLineIndex < 0 || payload.sdpMLineIndex > 32))) throw failure('invalid');
    return { type: 'candidate', payload: JSON.stringify({ candidate: payload.candidate, sdpMid: payload.sdpMid ?? null, sdpMLineIndex: payload.sdpMLineIndex ?? null }) };
  }
  const encoded = JSON.stringify(payload);
  // Control is only for connection negotiation. Combat input/state never goes through D1.
  if (encoded.length > 1024 || !['restart', 'connected', 'disconnected', 'rematch', 'start', 'cancel', 'ping', 'pong'].includes(payload.type)) throw failure('invalid');
  return { type: 'control', payload: encoded };
}
async function actOnRoom(request, env, code, now) {
  const { row, role, slot, hash } = await authorize(request, env, code, now);
  const data = await jsonBody(request);
  await rate(env, request, now, hash);
  if (data.action === 'leave') {
    const closed = await env.DB.prepare("UPDATE online_rooms SET status = 'closed', revision = revision + 1, expires_at = ? WHERE code = ? RETURNING *").bind(now, code).first();
    return { status: 200, data: { ok: true, room: publicRoom(closed, role) } };
  }
  if (data.action === 'heartbeat') {
    const touched = await env.DB.prepare(`UPDATE online_rooms SET ${role}_seen = ?, expires_at = ? WHERE code = ? AND status <> 'closed' RETURNING *`).bind(now, now + ROOM_TTL, code).first();
    if (!touched) throw failure('room-expired', 410);
    return { status: 200, data: { ok: true, room: publicRoom(touched, role), expiresAt: touched.expires_at } };
  }
  if (data.action === 'update') {
    if (data.fighter !== undefined && !ROSTER.has(data.fighter)) throw failure('invalid');
    if (data.ready !== undefined && typeof data.ready !== 'boolean') throw failure('invalid');
    if (data.fighter === undefined && data.ready === undefined) throw failure('invalid');
    const fighter = data.fighter ?? row[role + '_fighter'];
    const ready = data.ready ?? (fighter === row[role + '_fighter'] && !!row[role + '_ready']);
    const updated = await env.DB.prepare(`UPDATE online_rooms SET ${role}_fighter = ?, ${role}_ready = ?, ${role}_seen = ?, expires_at = ?, revision = revision + 1 WHERE code = ? AND status <> 'closed' RETURNING *`).bind(fighter, ready ? 1 : 0, now, now + ROOM_TTL, code).first();
    if (!updated) throw failure('room-expired', 410);
    return { status: 200, data: { ok: true, room: publicRoom(updated, role), expiresAt: updated.expires_at } };
  }
  if (data.action === 'signal') {
    if (!row.guest_token) throw failure('room-unavailable', 409);
    const signal = signalOf(data, role);
    const inserted = await env.DB.prepare(`INSERT INTO online_signals (room_code, sender, type, payload, created_at)
      SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM online_signals WHERE room_code = ?) < 512 AND EXISTS (SELECT 1 FROM online_rooms WHERE code = ? AND status = 'paired') RETURNING seq`).bind(code, slot, signal.type, signal.payload, now, code, code).first();
    if (!inserted) throw failure('signal-limit', 409);
    return { status: 200, data: { ok: true, seq: inserted.seq } };
  }
  throw failure('invalid');
}

/** Authentication and CORS wrap every online endpoint; rooms are never publicly enumerable. */
export async function handleOnline(request, env, options = {}) {
  const origin = request.headers.get('origin') || '', allowed = allowedOrigins(env);
  const reply = (status, data) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } : {}),
    ...(status === 429 ? { 'Retry-After': '1' } : {}),
  } });
  if (!allowed.has(origin)) return reply(403, { error: errors.origin, code: 'origin' });
  if (request.method === 'OPTIONS') return reply(204, null);
  if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: errors.method, code: 'method' });
  if (!env.DB) return reply(503, { error: errors['not-configured'], code: 'not-configured' });
  const now = options.now ?? Date.now();
  try {
    const pathname = new URL(request.url).pathname.replace(/\/$/, '');
    let result;
    if (request.method === 'POST' && ['/online/rooms', '/online/match'].includes(pathname)) result = await createRoom(request, env, now, pathname === '/online/match');
    else {
      const match = pathname.match(/^\/online\/rooms\/([^/]+)(\/join)?$/);
      if (!match) throw failure('method', 405);
      const code = canonicalCode(match[1]);
      if (match[2]) {
        if (request.method !== 'POST') throw failure('method', 405);
        result = await joinRoom(request, env, code, now);
      } else result = request.method === 'GET' ? await readRoom(request, env, code, now) : await actOnRoom(request, env, code, now);
    }
    return reply(result.status, result.data);
  } catch (error) {
    const code = error.status ? error.message : 'storage';
    return reply(error.status || 503, { error: errors[code] || errors.storage, code });
  }
}
