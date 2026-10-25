'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Leaderboard = require('../scripts/leaderboard.js');
const ENDPOINT = 'https://kyokushin-dojo-classifica.flazio1.chatgpt.site/records';

async function collectSnapshot(fetcher = fetch) {
  const records = new Map();
  let cursor = null, updatedAt = null;
  for (let page = 0; page < 50; page++) {
    const url = new URL(ENDPOINT);
    if (cursor) url.searchParams.set('after', cursor);
    const response = await fetcher(url.href, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Snapshot request failed');
    const text = await response.text();
    if (Buffer.byteLength(text) > 2000000) throw new Error('Snapshot page exceeds size limit');
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || !Array.isArray(data.records) || data.records.length > 1000 ||
        (data.updatedAt !== null && (typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))))) throw new Error('Invalid snapshot');
    for (const input of data.records) {
      const record = Leaderboard.validateRecord(input);
      if (records.has(record.id) && JSON.stringify(records.get(record.id)) !== JSON.stringify(record)) throw new Error('Conflicting record');
      records.set(record.id, record);
    }
    updatedAt = data.updatedAt;
    if (data.nextCursor === null) return { version: 1, updatedAt, records: [...records.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')) };
    if (typeof data.nextCursor !== 'string' || !/^\d{1,16}\.[A-Za-z0-9_-]{8,80}$/.test(data.nextCursor) || data.nextCursor === cursor) throw new Error('Invalid snapshot cursor');
    cursor = data.nextCursor;
  }
  throw new Error('Snapshot exceeds pagination limit; keeping the existing archive');
}

async function sync() {
  const snapshot = await collectSnapshot();
  const destination = path.join(__dirname, '..', 'data', 'arcade-leaderboard.json');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await fs.rename(temporary, destination);
  console.log(`Archived ${snapshot.records.length} final Arcade results.`);
}

module.exports = { collectSnapshot, sync };
if (require.main === module) sync().catch(() => { console.error('Arcade archive synchronization failed; the previous file was preserved.'); process.exitCode = 1; });
