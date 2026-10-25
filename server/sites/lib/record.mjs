// Shared record contract; copied from the game at service creation.
  const TITLE_PREFIX = '[ARCADE RECORD] ';
  const MARKER = 'kyokushin-arcade-record-v1';
  const RANKS = [
    ['mukyu', 'BIANCA · MUKYU'],
    ...Array.from({ length: 10 }, (_, index) => [`${10 - index}-kyu`, `${10 - index} KYU`]),
    ...Array.from({ length: 10 }, (_, index) => [`${index + 1}-dan`, `${index + 1} DAN`]),
  ];
  const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;

  class LeaderboardError extends Error {
    constructor(code, message) { super(message); this.name = 'LeaderboardError'; this.code = code; }
  }

  export function normalizeName(value) {
    if (typeof value !== 'string') return '';
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  }

  export function validateRecord(input) {
    const invalid = () => { throw new LeaderboardError('invalid-record', 'Il risultato della sfida non è valido.'); };
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) invalid();
    const name = normalizeName(input.name);
    if (/[\p{Cc}\p{Cf}]/u.test(input.name) || Array.from(name).length < 2 || Array.from(name).length > 24 ||
        !/^[\p{L}\p{M}\p{N} .’'\-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) invalid();
    if (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.id)) invalid();
    if (!['male', 'female'].includes(input.gender) || !integer(input.hairstyle, 0, 4)) invalid();
    if (!integer(input.score, 0, 91400) || !integer(input.wins, 0, 20) || !integer(input.rankIndex, 0, 20)) invalid();
    if (!integer(input.matches, 0, 20) || input.wins !== input.rankIndex || input.matches < input.wins) invalid();
    if (!Number.isFinite(input.elapsedSeconds) || input.elapsedSeconds < 0 || input.elapsedSeconds > 72000) invalid();
    if (!['completed', 'defeat', 'abandoned'].includes(input.reason) || typeof input.completed !== 'boolean') invalid();
    if (input.completed !== (input.rankIndex === 20) || input.completed !== (input.reason === 'completed')) invalid();
    if (input.reason === 'defeat' && input.matches !== input.wins + 1) invalid();
    if (input.reason === 'abandoned' && input.matches !== input.wins) invalid();
    if (input.matches === 0 && input.score !== 0) invalid();
    const created = typeof input.createdAt === 'string' ? Date.parse(input.createdAt) : NaN;
    if (!Number.isFinite(created) || created < Date.UTC(2026, 0, 1) || created > Date.now() + 86400000) invalid();
    const [rankId, rankLabel] = RANKS[input.rankIndex];
    return Object.freeze({
      version: 1, id: input.id, name, gender: input.gender, hairstyle: input.hairstyle,
      score: input.score, wins: input.wins, rankIndex: input.rankIndex, rankId, rankLabel,
      completed: input.completed, reason: input.reason, matches: input.matches,
      elapsedSeconds: Math.round(input.elapsedSeconds * 1000) / 1000, createdAt: new Date(created).toISOString(),
    });
  }

  function compareRecords(a, b) {
    return b.rankIndex - a.rankIndex || b.score - a.score || b.wins - a.wins ||
      a.elapsedSeconds - b.elapsedSeconds || Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      String(a.id).localeCompare(String(b.id), 'en');
  }

  function rankRecords(records, limit = 100) {
    const seen = new Set();
    const valid = [];
    for (const item of records) {
      try {
        const record = validateRecord(item);
        const githubUser = typeof item.githubUser === 'string' && /^[a-zA-Z0-9-]{1,39}$/.test(item.githubUser) ? item.githubUser : '';
        const identity = `${githubUser.toLowerCase()}:${record.id}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        valid.push(Object.freeze({ ...record, githubUser,
          issueNumber: integer(item.issueNumber, 1, Number.MAX_SAFE_INTEGER) ? item.issueNumber : null,
        }));
      } catch (_) { /* A public issue may contain arbitrary text; ignore malformed records. */ }
    }
    return valid.sort(compareRecords).slice(0, Math.max(1, Math.min(2000, limit)));
  }

  export function issueBody(input) {
    const record = validateRecord(input);
    return [
      'Risultato finale di Kyokushin Spirit — BodyPlanet Dojo.',
      '',
      `**${record.name}** · ${record.rankLabel} · ${record.score} punti · ${record.wins} vittorie`,
      '',
      'Classifica amatoriale: il risultato è dichiarato dal browser, non certificato dal server.',
      'Questo record non permette di riprendere la partita. Nome del personaggio e risultato sono pubblici.',
      'Inviato dal servizio del dojo; il giocatore non deve avere un account GitHub.',
      '',
      `<!-- ${MARKER} -->`,
      '```json',
      JSON.stringify(record, null, 2),
      '```',
    ].join('\n');
  }

  export function parseIssue(issue) {
    if (!issue || issue.pull_request || typeof issue.title !== 'string' || !issue.title.startsWith(TITLE_PREFIX)) return null;
    if (!Array.isArray(issue.labels) || issue.labels.some(label => (typeof label === 'string' ? label : label && label.name) === 'arcade-rejected')) return null;
    if (typeof issue.body !== 'string' || issue.body.length > 6000 || !issue.body.includes(`<!-- ${MARKER} -->`)) return null;
    const match = issue.body.match(/<!-- kyokushin-arcade-record-v1 -->\s*```json\s*([^]*?)\s*```\s*$/);
    if (!match) return null;
    try {
      const record = validateRecord(JSON.parse(match[1]));
      if (!issue.user || typeof issue.user.login !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(issue.user.login)) return null;
      return { ...record, githubUser: issue.user.login, issueNumber: issue.number };
    } catch (_) { return null; }
  }
