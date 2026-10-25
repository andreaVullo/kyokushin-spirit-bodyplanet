import { validateRecord } from './record.mjs';

const ARCHIVE_URL = 'https://github.com/andreaVullo/kyokushin-spirit-bodyplanet/blob/main/data/arcade-leaderboard.json';
const DEFAULT_ORIGIN = 'https://andreavullo.github.io';
const MAX_BYTES = 4096;
const PAGE_SIZE = 1000;

export function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN).split(',').map(item => item.trim()).filter(Boolean));
}
export function status(env) {
  return { service: 'kyokushin-arcade-leaderboard', ready: !!env.DB,
    storage: !!env.DB, playerAccountRequired: false, githubArchive: 'scheduled-sync' };
}
function response(code, data, origin, allowed, retryAfter, publicRead = false) {
  return new Response(code === 204 ? null : JSON.stringify(data), { status: code, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(publicRead ? { 'Access-Control-Allow-Origin': '*' } : allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {}),
    ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
  } });
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function bodyOf(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new Error('too-large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid-record');
  const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('too-large'); }
    parts.push(value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return validateRecord(JSON.parse(new TextDecoder().decode(result)));
}
async function increment(db, key, expires) {
  const row = await db.prepare('INSERT INTO rate_buckets (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(key, expires).first();
  return row.count;
}
async function rateLimited(env, request, now) {
  await env.DB.prepare('DELETE FROM rate_buckets WHERE expires_at < ?').bind(now).run();
  const minute = Math.floor(now / 60000);
  if (await increment(env.DB, `global:${minute}`, (minute + 1) * 60000) > 30) return true;
  // Cloudflare supplies this header. Do not trust a caller's X-Forwarded-For.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const window = Math.floor(now / 600000);
  const address = await digest(`kyokushin-dojo-classifica\n${window}\n${ip}`);
  return await increment(env.DB, `address:${window}:${address}`, (window + 1) * 600000) > 5;
}

export async function handleRecord(request, env, options = {}) {
  const allowed = allowedOrigins(env), origin = request.headers.get('origin') || '';
  const reply = (code, data, retry) => response(code, data, origin, allowed, retry);
  if (!allowed.has(origin)) return reply(403, { code: 'origin' });
  if (request.method === 'OPTIONS') return reply(204, null);
  if (request.method !== 'POST') return reply(405, { code: 'method' });
  if (!status(env).ready) return reply(503, { code: 'not-configured' });
  const now = options.now === undefined ? Date.now() : options.now;
  try {
    if (await rateLimited(env, request, now)) return reply(429, { code: 'rate-limit' }, 600);
  } catch (_) { return reply(503, { code: 'storage' }); }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415, { code: 'content-type' });
  let record;
  try { record = await bodyOf(request); }
  catch (error) { return reply(error.message === 'too-large' ? 413 : 400, { code: error.message === 'too-large' ? 'too-large' : 'invalid-record' }); }
  const signature = await digest(JSON.stringify(record));
  try {
    const inserted = await env.DB.prepare('INSERT INTO arcade_records (id, fingerprint, record_json, received_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING id')
      .bind(record.id, signature, JSON.stringify(record), now).first();
    if (!inserted) {
      const existing = await env.DB.prepare('SELECT fingerprint FROM arcade_records WHERE id = ?').bind(record.id).first();
      if (existing.fingerprint !== signature) return reply(409, { code: 'conflict' });
    }
    return reply(inserted ? 201 : 200, { id: record.id, stored: true, duplicate: !inserted,
      githubSynced: false, archiveUrl: ARCHIVE_URL });
  } catch (_) { return reply(503, { code: 'storage' }); }
}

export async function readRecords(request, env) {
  const reply = (code, data) => response(code, data, '', new Set(), null, true);
  if (!env.DB) return reply(503, { code: 'not-configured' });
  const after = new URL(request.url).searchParams.get('after') || '';
  let time = -1, id = '';
  if (after) {
    const parsed = after.match(/^(\d{1,16})\.([A-Za-z0-9_-]{8,80})$/);
    if (!parsed || !Number.isSafeInteger(Number(parsed[1]))) return reply(400, { code: 'cursor' });
    time = Number(parsed[1]); id = parsed[2];
  }
  try {
    const { results } = await env.DB.prepare('SELECT id, record_json, received_at FROM arcade_records WHERE received_at > ? OR (received_at = ? AND id > ?) ORDER BY received_at, id LIMIT ?')
      .bind(time, time, id, PAGE_SIZE + 1).all();
    const selected = results.slice(0, PAGE_SIZE), tail = selected[selected.length - 1];
    const info = await env.DB.prepare('SELECT COUNT(*) AS total, MAX(received_at) AS updated_at FROM arcade_records').first();
    return reply(200, { version: 1, records: selected.map(row => validateRecord(JSON.parse(row.record_json))),
      total: info.total, updatedAt: info.updated_at === null ? null : new Date(info.updated_at).toISOString(),
      nextCursor: results.length > PAGE_SIZE ? `${tail.received_at}.${tail.id}` : null,
      archiveUrl: ARCHIVE_URL });
  } catch (_) { return reply(503, { code: 'storage' }); }
}
