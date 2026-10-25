/* Public Arcade records. Runs stay in memory; only finished results are shared. */
(function (global) {
  'use strict';

  const OWNER = 'andreaVullo';
  const REPOSITORY = 'kyokushin-spirit-bodyplanet';
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

  function normalizeName(value) {
    if (typeof value !== 'string') return '';
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  }

  function validateRecord(input) {
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

  function issueBody(input) {
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

  function parseIssue(issue) {
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

  class DojoLeaderboard {
    constructor(options = {}) {
      this.owner = options.owner || OWNER;
      this.repository = options.repository || REPOSITORY;
      if (!/^[a-zA-Z0-9-]{1,39}$/.test(this.owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(this.repository)) throw new Error('Invalid GitHub repository');
      this.fetch = options.fetch || (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
      this.maxPages = Math.max(1, Math.min(20, options.maxPages || 5));
      this.ttl = options.ttl === undefined ? 60000 : Math.max(0, options.ttl);
      this.timeout = options.timeout === undefined ? 10000 : Math.max(1, options.timeout);
      this.cached = null;
      this.pending = null;
      this.mode = 'github';
      this.repositoryUrl = `https://github.com/${this.owner}/${this.repository}`;
      this.endpoint = options.endpoint === undefined ? (global.KYOKUSHIN_LEADERBOARD_ENDPOINT || '') : options.endpoint;
      if (this.endpoint) {
        const endpoint = new URL(this.endpoint);
        if (endpoint.username || endpoint.password || (endpoint.protocol !== 'https:' &&
            !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) throw new Error('Invalid leaderboard endpoint');
        this.endpoint = endpoint.href;
      }
    }

    submission(input) {
      validateRecord(input);
      return Object.freeze({ requiresLogin: false, public: true, configured: !!this.endpoint });
    }

    async submit(input) {
      const record = validateRecord(input);
      if (!this.endpoint) throw new LeaderboardError('not-configured', 'La pubblicazione della classifica non è ancora attiva. Il servizio del dojo deve essere collegato.');
      if (!this.fetch) throw new LeaderboardError('offline', 'Connessione alla classifica non disponibile.');
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), this.timeout * 3) : null;
      try {
        const response = await this.fetch(this.endpoint, { method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record),
          signal: controller ? controller.signal : undefined });
        if (!response.ok) {
          if (response.status === 429) throw new LeaderboardError('rate-limit', 'Hai inviato troppi risultati in poco tempo. Riprova più tardi.');
          if (response.status === 400 || response.status === 422) throw new LeaderboardError('invalid-record', 'Il risultato non è stato accettato dalla classifica.');
          if (response.status === 409) throw new LeaderboardError('conflict', 'Questa sfida è già stata pubblicata con un risultato diverso.');
          if (response.status === 403) throw new LeaderboardError('origin', 'Questo indirizzo del gioco non è ancora abilitato alla classifica.');
          if (response.status === 503) throw new LeaderboardError('not-configured', 'La pubblicazione della classifica non è ancora attiva.');
          throw new LeaderboardError('unavailable', 'Non riesco a pubblicare il risultato. Riprova tra poco.');
        }
        const result = await response.json();
        if (!result || result.id !== record.id || !integer(result.issueNumber, 1, Number.MAX_SAFE_INTEGER) ||
            result.url !== `${this.repositoryUrl}/issues/${result.issueNumber}`) throw new LeaderboardError('invalid-response', 'La conferma della classifica non è valida.');
        this.cached = null;
        return Object.freeze({ id: result.id, issueNumber: result.issueNumber, url: result.url, duplicate: result.duplicate === true });
      } catch (error) {
        if (error instanceof LeaderboardError) throw error;
        throw new LeaderboardError('offline', 'Invio non confermato. Controlla la connessione e riprova: la stessa sfida viene contata una sola volta.');
      } finally { if (timer !== null) clearTimeout(timer); }
    }

    async load({ force = false } = {}) {
      if (this.pending) return this.pending;
      if (!force && this.cached && Date.now() - this.cached.fetchedAt < this.ttl) return this.cached;
      if (!this.fetch) throw new LeaderboardError('offline', 'La classifica online non è disponibile in questo browser.');
      this.pending = this.readIssues();
      try { this.cached = await this.pending; return this.cached; }
      finally { this.pending = null; }
    }

    async readIssues() {
      const entries = [];
      let partial = false;
      for (let page = 1; page <= this.maxPages; page++) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), this.timeout) : null;
        let response;
        try {
          response = await this.fetch(`https://api.github.com/repos/${this.owner}/${this.repository}/issues?state=all&per_page=100&page=${page}&sort=created&direction=desc`, {
            method: 'GET', credentials: 'omit', signal: controller ? controller.signal : undefined,
            headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
          });
          if (!response.ok) {
            if (response.status === 403 || response.status === 429) throw new LeaderboardError('rate-limit', 'GitHub ha limitato temporaneamente le richieste. Riprova più tardi.');
            if (response.status === 404 || response.status === 410) throw new LeaderboardError('not-enabled', 'La classifica GitHub non è ancora disponibile.');
            throw new LeaderboardError('unavailable', 'Impossibile caricare la classifica. Riprova.');
          }
          const issues = await response.json();
          if (!Array.isArray(issues)) throw new LeaderboardError('invalid-response', 'GitHub ha restituito una classifica non valida.');
          for (const issue of issues) { const record = parseIssue(issue); if (record) entries.push(record); }
          const link = response.headers && response.headers.get ? response.headers.get('link') || '' : '';
          const next = /rel="next"/.test(link);
          if (!next) break;
          partial = page === this.maxPages;
        } catch (error) {
          if (error instanceof LeaderboardError) throw error;
          throw new LeaderboardError('offline', 'Connessione alla classifica non riuscita. La partita resta disponibile.');
        } finally { if (timer !== null) clearTimeout(timer); }
      }
      return Object.freeze({ entries: Object.freeze(rankRecords(entries, this.maxPages * 100)), partial, source: this.repositoryUrl,
        fetchedAt: Date.now(), submittedRuns: entries.length });
    }
  }

  const defaultClient = new DojoLeaderboard();
  Object.assign(DojoLeaderboard, {
    normalizeName, validateRecord, compareRecords, rankRecords, issueBody, parseIssue, LeaderboardError,
    load: async options => Object.freeze((await defaultClient.load(options)).entries.slice(0, 50)),
    submission: input => defaultClient.submission(input),
    submit: input => defaultClient.submit(input),
    details: () => defaultClient.cached,
  });
  global.DojoLeaderboard = DojoLeaderboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = DojoLeaderboard;
})(typeof window !== 'undefined' ? window : globalThis);
