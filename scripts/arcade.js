/* Arcade runs live only in memory. A finished record is a score, never a save file. */
(function (global, factory) {
  'use strict';
  const api = factory(global);
  global.DojoArcade = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const COLORS = Object.freeze({ white: '#f1eee7', orange: '#ee792b', blue: '#2964c1', yellow: '#efd349', green: '#2c9153', brown: '#815034', black: '#17191f', gold: '#e5b74a' });
  const COLOR_NAMES = { white: 'BIANCA', orange: 'ARANCIONE', blue: 'BLU', yellow: 'GIALLA', green: 'VERDE', brown: 'MARRONE', black: 'NERA', gold: 'DORATE' };
  // Kyu colours/stripes and Dan bars: https://kyokushinworldfederation.org/kyokushin/
  // Everyone starts at white: https://branch.kyokushinkaikan.org/daikanyamadojo/english-information
  const gradeDefinitions = [
    ['white', null, 0], ['orange', null, 10], ['orange', 'blue', 9], ['blue', null, 8],
    ['blue', 'yellow', 7], ['yellow', null, 6], ['yellow', 'green', 5], ['green', null, 4],
    ['green', 'brown', 3], ['brown', null, 2], ['brown', 'black', 1],
  ];
  const RANKS = Object.freeze([
    ...gradeDefinitions.map(([beltColor, stripeName, kyu], index) => ({
      index, id: kyu ? `${kyu}-kyu` : 'mukyu', label: kyu ? `${kyu} KYU` : 'BIANCA · MUKYU',
      kyu, dan: 0, beltColor, color: COLORS[beltColor], stripe: stripeName ? COLORS[stripeName] : null,
      stripeColor: stripeName ? COLORS[stripeName] : null, stripes: stripeName ? 1 : 0,
      belt: `CINTURA ${COLOR_NAMES[beltColor]}${stripeName ? ` · STRISCIA ${COLOR_NAMES[stripeName]}` : ''}`,
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      index: i + 11, id: `${i + 1}-dan`, label: `${i + 1} DAN`, kyu: 0, dan: i + 1,
      beltColor: 'black', color: COLORS.black, stripe: COLORS.gold, stripeColor: COLORS.gold, stripes: i + 1,
      belt: `CINTURA NERA · ${i + 1} ${i === 0 ? 'TACCA DORATA' : 'TACCHE DORATE'}`,
    })),
  ].map(Object.freeze));
  const HAIRSTYLES = Object.freeze([
    { id: 0, label: 'Corti' }, { id: 1, label: 'Ciuffo' }, { id: 2, label: 'Ricci' },
    { id: 3, label: 'Coda' }, { id: 4, label: 'Rasati' },
  ].map(Object.freeze));
  const LIMITS = Object.freeze({ promotions: 20, nameMin: 2, nameMax: 24, hairstyles: 5, maxMatchSeconds: 3600, maxScore: 91400, maxElapsedSeconds: 72000 });
  const internals = new WeakMap();

  function number(value, field, min, max, integer = false) {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new RangeError(`${field} non valido.`);
    }
    return value;
  }

  function validateCharacter(character = {}) {
    if (!character || typeof character !== 'object' || typeof character.name !== 'string') throw new TypeError('Scegli un nome per il karateka.');
    const name = character.name.normalize('NFC').trim().replace(/ +/g, ' ');
    const length = Array.from(name).length;
    if (length < LIMITS.nameMin || length > LIMITS.nameMax ||
      !/^[\p{L}\p{M}\p{N} .’'\-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) {
      throw new RangeError('Il nome deve contenere da 2 a 24 caratteri: lettere, numeri, spazi, punti, apostrofi o trattini.');
    }
    const gender = character.gender ?? 'male';
    if (gender !== 'male' && gender !== 'female') throw new RangeError('Scegli uomo o donna.');
    const hairstyle = number(character.hairstyle ?? 0, 'Capigliatura', 0, 4, true);
    return Object.freeze({ name, gender, hairstyle });
  }

  function hash(value) {
    let h = 2166136261;
    for (const char of String(value)) { h ^= char.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function randomFor(seed) {
    let state = hash(seed) || 1;
    return () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function runId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return `arcade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function schedule(rosterIds, seed) {
    const ids = [...new Set(rosterIds)];
    if (!ids.length || ids.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))) throw new RangeError('Roster Arcade non valido.');
    const random = randomFor(seed), opponents = [];
    while (opponents.length < LIMITS.promotions) {
      const cycle = ids.slice();
      for (let i = cycle.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
      }
      if (cycle.length > 1 && cycle[0] === opponents[opponents.length - 1]) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
      opponents.push(...cycle);
    }
    return Object.freeze(opponents.slice(0, LIMITS.promotions));
  }

  function validateStats(result) {
    if (!result || typeof result !== 'object' || (result.winner !== 0 && result.winner !== 1)) throw new RangeError('Il combattimento deve avere un vincitore.');
    const stats = {
      winner: result.winner,
      elapsed: number(result.elapsed, 'Durata', .01, LIMITS.maxMatchSeconds),
      playerMaxHp: number(result.playerMaxHp, 'Vita massima', 1, 10000),
      playerHp: number(result.playerHp, 'Vita rimasta', 0, 10000),
      playerRounds: number(result.playerRounds, 'Round vinti', 0, 2, true),
      opponentRounds: number(result.opponentRounds, 'Round avversario', 0, 2, true),
      hits: number(result.hits ?? 0, 'Colpi', 0, 3000, true),
      blocks: number(result.blocks ?? 0, 'Parate', 0, 3000, true),
      maxCombo: number(result.maxCombo ?? 0, 'Combo', 0, 6, true),
    };
    if (stats.playerHp > stats.playerMaxHp || stats.maxCombo > stats.hits ||
      (stats.winner === 0 ? stats.playerRounds !== 2 || stats.opponentRounds > 1 : stats.opponentRounds !== 2 || stats.playerRounds > 1)) {
      throw new RangeError('Le statistiche non corrispondono al risultato del combattimento.');
    }
    return Object.freeze(stats);
  }

  function scoreMatch(result, rankIndex = 0) {
    number(rankIndex, 'Grado', 0, 19, true);
    const stats = validateStats(result);
    const technique = Math.min(stats.hits, 40) * 10 + Math.min(stats.blocks, 20) * 10 + stats.maxCombo * 70;
    if (stats.winner === 1) return technique;
    const health = Math.round(stats.playerHp / stats.playerMaxHp * 500);
    const speed = Math.round(Math.max(0, 1 - stats.elapsed / 180) * 600);
    return 1000 + rankIndex * 100 + health + speed + technique;
  }

  function snapshot(state) {
    return Object.freeze({
      id: state.id, character: state.character, status: state.finished ? 'finished' : 'active', finished: state.finished,
      rankIndex: state.wins, rank: RANKS[state.wins], nextRank: RANKS[state.wins + 1] || null,
      wins: state.wins, matches: state.matches, score: state.score, elapsedSeconds: state.elapsedSeconds,
      progress: state.wins / LIMITS.promotions, completed: state.reason === 'completed', reason: state.reason,
      pendingMatch: state.pendingMatch, lastMatch: state.lastMatch,
    });
  }

  function end(state, reason) {
    state.finished = true; state.reason = reason; state.pendingMatch = null;
    const stamp = new Date(state.now());
    state.createdAt = Number.isFinite(stamp.getTime()) ? stamp.toISOString() : new Date().toISOString();
  }

  class Run {
    constructor(options = {}) {
      const character = validateCharacter(options);
      const id = runId(), seed = options.seed ?? id;
      const rosterIds = options.rosterIds ?? Object.keys(global.KyokushinRoster || { angelo: {}, samuel: {} }).filter(id => !id.startsWith('arcade-'));
      if (!Array.isArray(rosterIds)) throw new TypeError('Roster Arcade non valido.');
      internals.set(this, {
        id, seed, character, opponents: schedule(rosterIds, seed), now: typeof options.now === 'function' ? options.now : Date.now,
        wins: 0, matches: 0, score: 0, elapsedSeconds: 0, finished: false, reason: null,
        pendingMatch: null, lastMatch: null, processed: new Map(), createdAt: null,
      });
      Object.freeze(this);
    }

    getState() { return snapshot(internals.get(this)); }

    nextMatch() {
      const state = internals.get(this);
      if (state.finished) return null;
      if (!state.pendingMatch) {
        const index = state.wins;
        state.pendingMatch = Object.freeze({
          matchId: `${state.id}:${index + 1}`, number: index + 1, opponent: state.opponents[index],
          difficulty: index < 5 ? 'easy' : index < 11 ? 'normal' : 'hard', aiLevel: index / 19,
          rank: RANKS[index], targetRank: RANKS[index + 1], seed: hash(`${state.seed}:${index}`),
        });
      }
      return state.pendingMatch;
    }

    recordMatch(result) {
      const state = internals.get(this);
      if (!result || typeof result.matchId !== 'string') throw new RangeError('Identificativo del combattimento mancante.');
      const stats = validateStats(result), signature = JSON.stringify(stats);
      if (state.processed.has(result.matchId)) {
        if (state.processed.get(result.matchId) !== signature) throw new RangeError('Questo combattimento è già stato registrato.');
        return snapshot(state);
      }
      if (state.finished || !state.pendingMatch || result.matchId !== state.pendingMatch.matchId) throw new RangeError('Il combattimento non appartiene alla sfida attuale.');
      const before = state.wins, won = stats.winner === 0;
      let score = scoreMatch(stats, before);
      state.matches += 1;
      state.elapsedSeconds = Math.round((state.elapsedSeconds + stats.elapsed) * 1000) / 1000;
      if (won) state.wins += 1;
      if (state.wins === LIMITS.promotions) score += 10000;
      state.score += score;
      state.processed.set(result.matchId, signature);
      state.lastMatch = Object.freeze({ matchId: result.matchId, won, promoted: won, score, rankBefore: RANKS[before], rankAfter: RANKS[state.wins], stats });
      state.pendingMatch = null;
      if (!won) end(state, 'defeat');
      else if (state.wins === LIMITS.promotions) end(state, 'completed');
      return snapshot(state);
    }

    finish(reason = 'abandoned') {
      const state = internals.get(this);
      if (reason !== 'abandoned') throw new RangeError('La sfida può essere conclusa solo da un combattimento o abbandonata.');
      if (!state.finished) end(state, reason);
      return snapshot(state);
    }

    finalRecord() {
      const state = internals.get(this);
      if (!state.finished) return null;
      return Object.freeze({
        version: 1, id: state.id, ...state.character, score: state.score, wins: state.wins,
        rankIndex: state.wins, rankId: RANKS[state.wins].id, rankLabel: RANKS[state.wins].label,
        completed: state.reason === 'completed', reason: state.reason, matches: state.matches,
        elapsedSeconds: state.elapsedSeconds, createdAt: state.createdAt,
      });
    }
  }

  function compareRecords(a, b) {
    return b.rankIndex - a.rankIndex || b.score - a.score || b.wins - a.wins || a.elapsedSeconds - b.elapsedSeconds || String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id));
  }

  return Object.freeze({ RANKS, HAIRSTYLES, COLORS, LIMITS, Run, createRun: options => new Run(options), validateCharacter, validateStats, scoreMatch, compareRecords });
});
