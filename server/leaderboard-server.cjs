'use strict';

// Run this on a Node server, never on GitHub Pages or inside the browser bundle.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Leaderboard = require('../scripts/leaderboard.js');

function createHandler(options = {}) {
  const owner = options.owner || 'andreaVullo';
  const repository = options.repository || 'kyokushin-spirit-bodyplanet';
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repository)) throw new Error('Invalid repository configuration');
  const token = options.token || '';
  const allowed = new Set((options.origins || []).map(origin => {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password || (parsed.protocol !== 'https:' &&
        !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw new Error('Invalid origin configuration');
    return parsed.origin;
  }));
  const fetcher = options.fetch || globalThis.fetch;
  const now = options.now || Date.now;
  const maxBody = 4096;
  const records = new Map(), pending = new Map(), limits = new Map();
  const storePath = options.storePath || '';
  let storeReady = !storePath;
  let saveQueue = Promise.resolve();
  const ready = (async () => {
    if (!storePath) return;
    try {
      const parsed = JSON.parse(await fs.readFile(storePath, 'utf8'));
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error('Invalid index');
      for (const entry of parsed.records.slice(-20000)) {
        if (entry && typeof entry.id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(entry.id) &&
            Number.isSafeInteger(entry.issueNumber) && entry.issueNumber > 0 && /^[a-f0-9]{64}$/.test(entry.fingerprint)) records.set(entry.id, entry);
      }
      storeReady = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot load leaderboard index');
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      storeReady = true;
    }
  })();

  function save() {
    if (!storePath) return Promise.resolve();
    const content = JSON.stringify({ version: 1, records: [...records.values()].slice(-20000) });
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const temporary = `${storePath}.tmp`;
      await fs.writeFile(temporary, content, { mode: 0o600 });
      await fs.rename(temporary, storePath);
    });
    return saveQueue;
  }
  function reply(res, status, body, origin) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      ...(origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {}),
      ...(status === 429 ? { 'Retry-After': '600' } : {}),
    });
    res.end(JSON.stringify(body));
  }
  function rate(key, ceiling, milliseconds) {
    const stamp = now();
    if (limits.size > 10000) for (const [id, value] of limits) if (value.until <= stamp) limits.delete(id);
    const bucket = limits.get(key);
    if (!bucket || bucket.until <= stamp) { limits.set(key, { count: 1, until: stamp + milliseconds }); return true; }
    if (bucket.count >= ceiling) return false;
    bucket.count++; return true;
  }
  async function github(endpoint, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(`https://api.github.com${endpoint}`, { method, signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Kyokushin-Arcade-Leaderboard',
          ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error('GitHub request failed');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  const fingerprint = record => crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
  function result(entry, duplicate) {
    return { id: entry.id, issueNumber: entry.issueNumber, url: `https://github.com/${owner}/${repository}/issues/${entry.issueNumber}`, duplicate };
  }
  async function publish(record) {
    const signature = fingerprint(record);
    let existing = records.get(record.id);
    if (existing) {
      if (existing.fingerprint !== signature) { const error = new Error('Record conflict'); error.code = 'conflict'; throw error; }
      return result(existing, true);
    }
    // Read existing records before writing; the local index also survives service restarts.
    for (let page = 1; page <= 5; page++) {
      const issues = await github(`/repos/${owner}/${repository}/issues?state=all&per_page=100&page=${page}&sort=created&direction=desc`);
      if (!Array.isArray(issues)) throw new Error('Invalid GitHub response');
      for (const issue of issues) {
        const saved = Leaderboard.parseIssue(issue);
        if (saved && saved.id === record.id) {
          existing = { id: saved.id, issueNumber: issue.number, fingerprint: fingerprint(Leaderboard.validateRecord(saved)) };
          if (existing.fingerprint !== signature) { const error = new Error('Record conflict'); error.code = 'conflict'; throw error; }
          records.set(existing.id, existing); await save(); return result(existing, true);
        }
      }
      if (issues.length < 100) break;
    }
    const issue = await github(`/repos/${owner}/${repository}/issues`, { method: 'POST', body: {
      title: `[ARCADE RECORD] ${record.name} · ${record.rankLabel} · ${record.score}`,
      body: Leaderboard.issueBody(record),
    } });
    if (!issue || !Number.isSafeInteger(issue.number) || issue.number < 1) throw new Error('Invalid GitHub response');
    const entry = { id: record.id, issueNumber: issue.number, fingerprint: signature };
    records.set(record.id, entry);
    if (records.size > 20000) records.delete(records.keys().next().value);
    await save();
    return result(entry, false);
  }
  async function handler(req, res) {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/health') return reply(res, 200, { ready: !!token && !!allowed.size && storeReady }, origin);
    if (pathname !== '/records') return reply(res, 404, { code: 'not-found' }, origin);
    if (!allowed.has(origin)) return reply(res, 403, { code: 'origin' });
    if (req.method === 'OPTIONS') return reply(res, 204, {}, origin);
    if (req.method !== 'POST') return reply(res, 405, { code: 'method' }, origin);
    if (!token || !allowed.size) return reply(res, 503, { code: 'not-configured' }, origin);
    const forwarded = options.trustProxy && typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '';
    const ip = forwarded || req.socket?.remoteAddress || 'unknown';
    if (!rate('global', options.globalLimit || 30, 60000) || !rate(`ip:${ip}`, options.perIpLimit || 5, 600000)) return reply(res, 429, { code: 'rate-limit' }, origin);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(res, 415, { code: 'content-type' }, origin);
    if (Number(req.headers['content-length']) > maxBody) return reply(res, 413, { code: 'too-large' }, origin);
    let record;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > maxBody) return reply(res, 413, { code: 'too-large' }, origin);
        chunks.push(bytes);
      }
      record = Leaderboard.validateRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch (_) { return reply(res, 400, { code: 'invalid-record' }, origin); }
    try {
      await ready;
      const active = pending.get(record.id);
      if (active && active.signature !== fingerprint(record)) return reply(res, 409, { code: 'conflict' }, origin);
      const operation = active || { signature: fingerprint(record), promise: publish(record) };
      if (!active) pending.set(record.id, operation);
      try {
        const saved = await operation.promise;
        return reply(res, active || saved.duplicate ? 200 : 201, { ...saved, duplicate: !!active || saved.duplicate }, origin);
      } finally { if (!active) pending.delete(record.id); }
    } catch (error) {
      return reply(res, error.code === 'conflict' ? 409 : 502, { code: error.code === 'conflict' ? 'conflict' : 'upstream' }, origin);
    }
  }
  handler.ready = ready;
  return handler;
}

module.exports = { createHandler };

if (require.main === module) {
  const token = process.env.GITHUB_TOKEN || '';
  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!token || !origins.length) { console.error('Configure GITHUB_TOKEN and ALLOWED_ORIGINS on the server.'); process.exitCode = 1; }
  else {
    const handler = createHandler({ token, origins,
      owner: process.env.GITHUB_OWNER, repository: process.env.GITHUB_REPOSITORY_NAME,
      storePath: process.env.LEADERBOARD_STORE || path.join(__dirname, 'data', 'records-index.json'),
      trustProxy: process.env.TRUST_PROXY === '1',
    });
    handler.ready.then(() => {
      const server = http.createServer((req, res) => { handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
      server.requestTimeout = 70000; server.headersTimeout = 10000;
      server.listen(Number(process.env.PORT) || 8787, process.env.HOST || '127.0.0.1', () => console.log('Arcade leaderboard service is listening.'));
    }).catch(() => { console.error('Cannot initialize the leaderboard index. Check the writable storage path.'); process.exitCode = 1; });
  }
}
