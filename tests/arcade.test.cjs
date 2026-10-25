'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Arcade = require('../scripts/arcade.js');
const create = options => Arcade.createRun({ name: 'Anna D’Angelo', gender: 'female', hairstyle: 3, seed: 'dojo', rosterIds: ['angelo', 'samuel', 'andrea-vullo'], now: () => Date.UTC(2026, 9, 25), ...options });
const victory = (run, overrides = {}) => ({ matchId: run.nextMatch().matchId, winner: 0, elapsed: 45, playerHp: 700, playerMaxHp: 1000, playerRounds: 2, opponentRounds: 1, hits: 12, blocks: 4, maxCombo: 3, ...overrides });
const defeat = run => victory(run, { winner: 1, playerHp: 0, playerRounds: 1, opponentRounds: 2 });

test('the complete ladder has white, ten descending kyu and ten ascending Dan with gold bars', () => {
  assert.equal(Arcade.RANKS.length, 21);
  assert.equal(Arcade.RANKS[0].id, 'mukyu');
  assert.equal(Arcade.RANKS[0].color, Arcade.COLORS.white);
  for (let index = 1; index <= 10; index++) assert.equal(Arcade.RANKS[index].kyu, 11 - index);
  const expected = [['orange', null], ['orange', 'blue'], ['blue', null], ['blue', 'yellow'], ['yellow', null], ['yellow', 'green'], ['green', null], ['green', 'brown'], ['brown', null], ['brown', 'black']];
  expected.forEach(([color, stripe], i) => {
    assert.equal(Arcade.RANKS[i + 1].color, Arcade.COLORS[color]);
    assert.equal(Arcade.RANKS[i + 1].stripe, stripe ? Arcade.COLORS[stripe] : null);
  });
  for (let dan = 1; dan <= 10; dan++) {
    const rank = Arcade.RANKS[10 + dan];
    assert.equal(rank.dan, dan);
    assert.equal(rank.stripes, dan);
    assert.equal(rank.color, Arcade.COLORS.black);
    assert.equal(rank.stripe, Arcade.COLORS.gold);
    assert.ok(Object.isFrozen(rank));
  }
});

test('a run starts white and cannot skip a challenge by repeatedly asking for the next match', () => {
  const run = create();
  assert.equal(run.getState().rank.id, 'mukyu');
  assert.equal(run.getState().score, 0);
  assert.equal(run.finalRecord(), null);
  assert.equal(run.nextMatch(), run.nextMatch());
  assert.equal(run.nextMatch().number, 1);
  assert.equal(run.nextMatch().targetRank.id, '10-kyu');
  assert.equal(run.getState().rankIndex, 0);
});

test('twenty victories promote through 1 kyu to 1 Dan, complete at 10 Dan and stop the run', () => {
  const run = create();
  const difficulties = [];
  for (let win = 1; win <= 20; win++) {
    const match = run.nextMatch();
    difficulties.push(match.difficulty);
    assert.equal(match.number, win);
    const state = run.recordMatch(victory(run));
    assert.equal(state.wins, win);
    assert.equal(state.rankIndex, win);
    assert.equal(state.matches, win);
    assert.equal(state.lastMatch.promoted, true);
    assert.equal(state.finished, win === 20);
    if (win === 10) assert.equal(state.rank.id, '1-kyu');
    if (win === 11) assert.equal(state.rank.id, '1-dan');
  }
  assert.deepEqual(difficulties, [...Array(5).fill('easy'), ...Array(6).fill('normal'), ...Array(9).fill('hard')]);
  const final = run.finalRecord();
  assert.equal(final.rankId, '10-dan');
  assert.equal(final.rankIndex, 20);
  assert.equal(final.completed, true);
  assert.equal(final.reason, 'completed');
  assert.equal(final.elapsedSeconds, 900);
  assert.equal(final.createdAt, '2026-10-25T00:00:00.000Z');
  assert.equal(run.nextMatch(), null);
  assert.equal(run.getState().nextRank, null);
});

test('defeat ends the run while preserving the last earned grade', () => {
  const run = create();
  run.recordMatch(victory(run));
  const result = run.recordMatch(defeat(run));
  assert.equal(result.rank.id, '10-kyu');
  assert.equal(result.wins, 1);
  assert.equal(result.matches, 2);
  assert.equal(result.finished, true);
  assert.equal(result.reason, 'defeat');
  assert.equal(result.lastMatch.promoted, false);
  assert.equal(run.nextMatch(), null);
  assert.equal(run.finalRecord().completed, false);
});

test('records are accepted once, duplicates are harmless and altered or foreign results are rejected', () => {
  const run = create(), result = victory(run);
  const first = run.recordMatch(result);
  assert.deepEqual(run.recordMatch(result), first);
  assert.throws(() => run.recordMatch({ ...result, hits: result.hits + 1 }), /già stato/);
  const second = victory(run);
  assert.throws(() => run.recordMatch({ ...second, matchId: 'other-run:2' }), /sfida attuale/);
  run.recordMatch(second);
  assert.equal(run.recordMatch(result).wins, 2);
  assert.equal(run.getState().matches, 2);
});

test('identical seeds produce the same opponents and combat seed without consecutive duplicate opponents', () => {
  const a = create(), b = create(), aSchedule = [], bSchedule = [];
  for (let i = 0; i < 20; i++) {
    const am = a.nextMatch(), bm = b.nextMatch();
    aSchedule.push([am.opponent, am.seed]); bSchedule.push([bm.opponent, bm.seed]);
    if (i) assert.notEqual(aSchedule[i][0], aSchedule[i - 1][0]);
    a.recordMatch(victory(a)); b.recordMatch(victory(b));
  }
  assert.deepEqual(aSchedule, bSchedule);
  assert.throws(() => create({ rosterIds: [] }), /Roster/);
  assert.throws(() => create({ rosterIds: ['<script>'] }), /Roster/);
  const single = create({ rosterIds: ['angelo'] });
  assert.equal(single.nextMatch().opponent, 'angelo');
});

test('scoring rewards health and faster victories, caps hit farming and adds a completion bonus', () => {
  const run = create(), normal = victory(run);
  assert.equal(Arcade.scoreMatch(normal, 0), 2170);
  assert.ok(Arcade.scoreMatch({ ...normal, elapsed: 20 }, 0) > Arcade.scoreMatch(normal, 0));
  assert.ok(Arcade.scoreMatch({ ...normal, playerHp: 900 }, 0) > Arcade.scoreMatch(normal, 0));
  assert.equal(Arcade.scoreMatch({ ...normal, hits: 3000, blocks: 3000 }, 0), Arcade.scoreMatch({ ...normal, hits: 40, blocks: 20 }, 0));
  assert.equal(Arcade.scoreMatch({ ...defeat(run), hits: 0, blocks: 0, maxCombo: 0 }, 0), 0);
  const perfect = create();
  for (let i = 0; i < 20; i++) perfect.recordMatch(victory(perfect, { elapsed: .01, playerHp: 1000, hits: 40, blocks: 20, maxCombo: 6 }));
  assert.equal(perfect.finalRecord().score, Arcade.LIMITS.maxScore);
  assert.equal(perfect.getState().lastMatch.score, 15020);
});

test('invalid stats cannot alter the current rank, score or pending challenge', () => {
  const run = create(), valid = victory(run), before = run.getState();
  const invalid = [
    { winner: null }, { winner: '0' }, { elapsed: NaN }, { elapsed: Infinity }, { elapsed: -1 }, { elapsed: 3601 },
    { playerHp: -1 }, { playerHp: 1001 }, { playerMaxHp: 0 }, { hits: -1 }, { hits: .5 }, { hits: 3001 },
    { hits: 2, maxCombo: 3 }, { maxCombo: 7 }, { blocks: Infinity }, { playerRounds: 1 }, { opponentRounds: 2 },
    { winner: 1, opponentRounds: 1 }, { matchId: '' },
  ];
  for (const fields of invalid) {
    assert.throws(() => run.recordMatch({ ...valid, ...fields }));
    assert.deepEqual(run.getState(), before);
  }
  assert.throws(() => Arcade.scoreMatch(valid, 20));
});

test('male and female characters each have exactly five hairstyles and normalized names', () => {
  assert.equal(Arcade.HAIRSTYLES.length, 5);
  for (const gender of ['male', 'female']) for (let hairstyle = 0; hairstyle < 5; hairstyle++) {
    assert.deepEqual(Arcade.validateCharacter({ name: '  Jose\u0301   D’Angelo 2.  ', gender, hairstyle }), { name: 'José D’Angelo 2.', gender, hairstyle });
  }
  for (const name of ['', 'A', 'x'.repeat(25), '<img src=x>', 'Anna\nMaria', 'Anna\u200bMaria', '---', ' 😀 ']) assert.throws(() => create({ name }));
  for (const hairstyle of [-1, 5, '1', 1.5]) assert.throws(() => create({ hairstyle }));
  assert.throws(() => create({ gender: 'other' }));
});

test('abandoning cannot fake completion and exposes no resumable record or stored progress', () => {
  let storageAccesses = 0;
  const context = vm.createContext({});
  context.window = context;
  Object.defineProperty(context, 'localStorage', { get() { storageAccesses++; throw new Error('No storage'); } });
  Object.defineProperty(context, 'sessionStorage', { get() { storageAccesses++; throw new Error('No storage'); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/arcade.js'), 'utf8'), context);
  const run = context.DojoArcade.createRun({ name: 'Test', gender: 'male', hairstyle: 0 });
  assert.equal(run.finalRecord(), null);
  assert.throws(() => run.finish('completed'));
  run.finish();
  const final = run.finalRecord();
  assert.equal(final.reason, 'abandoned');
  assert.equal(final.wins, 0);
  assert.equal(final.matches, 0);
  assert.equal(final.score, 0);
  assert.equal(final.pendingMatch, undefined);
  assert.equal(final.opponents, undefined);
  assert.equal(final.seed, undefined);
  assert.equal(context.DojoArcade.resume, undefined);
  assert.equal(run.resume, undefined);
  assert.equal(storageAccesses, 0);
  assert.ok(Object.isFrozen(final));
});

test('snapshots and appearance cannot be changed externally, and final rankings prioritize the grade', () => {
  const run = create(), state = run.getState();
  assert.throws(() => { state.wins = 20; });
  assert.throws(() => { state.character.name = 'Different'; });
  assert.throws(() => { state.rank.stripes = 10; });
  assert.equal(run.getState().wins, 0);
  const records = [
    { rankIndex: 2, score: 1500, wins: 2, elapsedSeconds: 100, createdAt: '2026-10-25', id: 'b' },
    { rankIndex: 1, score: 5000, wins: 1, elapsedSeconds: 90, createdAt: '2026-10-25', id: 'a' },
    { rankIndex: 2, score: 1500, wins: 2, elapsedSeconds: 90, createdAt: '2026-10-25', id: 'c' },
  ];
  assert.deepEqual(records.sort(Arcade.compareRecords).map(r => r.id), ['c', 'b', 'a']);
});
