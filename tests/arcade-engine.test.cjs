'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
context.window = context;
for (const file of ['roster.js', 'arcade.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts', file), 'utf8'), context, { filename: file });
const { DojoArcade, KyokushinGame } = context;
const damageByMove = { tsuki: 65, gyaku: 95, shita: 90, kagi: 110, gedan: 90, mae: 120, mawashi: 145, ushiro: 185, kaiten: 235 };

function session(profile = { name: 'Anna D’Angelo', gender: 'female', hairstyle: 3 }) {
  const events = [], counters = { elapsed: 0, hits: 0, blocks: 0, maxCombo: 0 };
  const game = new KyokushinGame({ random: () => .99, onEvent(event) {
    events.push(event);
    if (event.type === 'hit' && event.player === 0) { counters.hits++; counters.maxCombo = Math.max(counters.maxCombo, event.combo); }
    if (event.type === 'block' && event.target === 0) counters.blocks++;
  } });
  game.registerArcadeCharacter(profile);
  const run = DojoArcade.createRun({ ...profile, seed: 'arcade-engine', rosterIds: Object.keys(context.KyokushinRoster) });
  function advance(seconds) {
    for (let remaining = seconds; remaining > 1e-8; remaining -= 1 / 120) {
      const dt = Math.min(remaining, 1 / 120);
      if (game.getState().phase === 'fight' && !game.paused) counters.elapsed += dt;
      game.update(dt);
    }
  }
  function start(mode = 'versus') {
    const match = run.nextMatch();
    Object.assign(counters, { elapsed: 0, hits: 0, blocks: 0, maxCombo: 0 });
    events.length = 0;
    game.start({ player: 'arcade-player', opponent: match.opponent, mode, difficulty: match.difficulty });
    return match;
  }
  function result(match) {
    const state = game.getState(), [player, opponent] = state.fighters;
    return { matchId: match.matchId, winner: state.winner, ...counters, playerHp: player.hp, playerMaxHp: player.maxHp, playerRounds: player.wins, opponentRounds: opponent.wins };
  }
  return { game, run, events, counters, advance, start, result };
}

function contact(game) {
  const state = game.getState();
  state.phase = 'fight'; state.phaseTime = 0;
  const [a, b] = state.fighters;
  a.x = 500; b.x = 630;
  a.facing = 1; b.facing = -1;
  a.ki = b.ki = 100;
  return state.fighters;
}

function knockOutRound(play, winner) {
  const fighters = contact(play.game);
  fighters[1 - winner].hp = 1;
  play.game.requestAttack(fighters[winner], 'tsuki');
  play.advance(.65);
  assert.equal(play.game.getState().roundWinner, winner);
}

test('all nine attacks land for both character bodies and all five hairstyles without changing combat balance', () => {
  for (const gender of ['male', 'female']) for (let hairstyle = 0; hairstyle < 5; hairstyle++) {
    for (const [move, damage] of Object.entries(damageByMove)) {
      const play = session({ name: 'Nuovo Karateka', gender, hairstyle });
      play.start();
      const [attacker, target] = contact(play.game);
      assert.equal(attacker.id, 'arcade-player');
      play.game.requestAttack(attacker, move);
      assert.equal(attacker.attack.move, move);
      play.advance(1.2);
      const hits = play.events.filter(event => event.type === 'hit' && event.player === 0);
      assert.equal(hits.length, 1, `${gender}/${hairstyle}/${move}: one impact`);
      assert.equal(hits[0].damage, damage, `${gender}/${hairstyle}/${move}: normal damage`);
      assert.equal(target.hp, 1000 - damage);
    }
  }
});

test('custom identity survives round rebuild and match reset, with its name in the winner announcement', () => {
  const play = session();
  play.start();
  knockOutRound(play, 0);
  assert.equal(play.game.getState().announcementSub, 'ANNA D’ANGELO VINCE IL ROUND');
  assert.equal(play.game.getState().fighters[0].wins, 1);
  play.advance(2.4);
  assert.equal(play.game.getState().round, 2);
  assert.equal(play.game.getState().fighters[0].id, 'arcade-player');
  assert.equal(play.game.getState().fighters[0].wins, 1);
  knockOutRound(play, 0);
  assert.equal(play.game.getState().phase, 'matchOver');
  assert.equal(play.events.find(event => event.type === 'match').id, 'arcade-player');
  play.game.reset();
  assert.equal(play.game.getState().round, 1);
  assert.equal(play.game.getState().fighters[0].id, 'arcade-player');
  assert.equal(play.game.getState().fighters[0].wins, 0);
  assert.equal(play.game.characters['arcade-player'].short, 'ANNA D’ANGELO');
});

test('real hit, successful guard and final defeat events produce a valid final Arcade record', () => {
  const play = session(), match = play.start();
  let [player, opponent] = contact(play.game);
  play.game.setInput(0, 'block', true);
  play.advance(.05);
  play.game.requestAttack(opponent, 'tsuki');
  play.advance(.6);
  play.game.setInput(0, 'block', false);
  assert.equal(play.counters.blocks, 1);
  [player, opponent] = contact(play.game);
  play.game.requestAttack(player, 'tsuki');
  play.advance(.6);
  assert.equal(play.counters.hits, 1);
  const beforePause = play.counters.elapsed;
  play.game.pause(true);
  play.advance(15);
  assert.equal(play.counters.elapsed, beforePause);
  play.game.pause(false);
  knockOutRound(play, 1);
  play.advance(2.4);
  knockOutRound(play, 1);
  const stats = play.result(match);
  assert.equal(stats.winner, 1);
  assert.equal(stats.playerRounds, 0);
  assert.equal(stats.opponentRounds, 2);
  assert.equal(stats.playerHp, 0);
  const state = play.run.recordMatch(stats);
  assert.equal(state.finished, true);
  assert.equal(state.rank.id, 'mukyu');
  assert.equal(state.score, 90);
  assert.equal(play.run.finalRecord().reason, 'defeat');
});

test('twenty actual engine matches promote the custom fighter through the full Arcade ladder', () => {
  const play = session({ name: 'Marco Test', gender: 'male', hairstyle: 0 });
  const seenDifficulties = new Set(), seenOpponents = new Set();
  for (let number = 1; number <= 20; number++) {
    const match = play.start('cpu');
    seenDifficulties.add(play.game.getState().difficulty);
    seenOpponents.add(play.game.getState().fighters[1].id);
    assert.equal(play.game.getState().mode, 'cpu');
    knockOutRound(play, 0);
    play.advance(2.4);
    knockOutRound(play, 0);
    const stats = play.result(match);
    assert.equal(stats.winner, 0);
    assert.equal(stats.hits, 2);
    assert.equal(stats.maxCombo, 1);
    const state = play.run.recordMatch(stats);
    assert.equal(state.wins, number);
    assert.equal(state.rank.id, number < 11 ? `${11 - number}-kyu` : `${number - 10}-dan`);
    assert.equal(play.game.getState().fighters[0].id, 'arcade-player');
    assert.equal(play.game.getState().announcementSub, 'MARCO TEST VINCE IL ROUND');
  }
  assert.deepEqual([...seenDifficulties], ['easy', 'normal', 'hard']);
  assert.equal(seenOpponents.size, Object.keys(context.KyokushinRoster).length);
  assert.equal(seenOpponents.has('marco-tabacco-collage'), true);
  assert.equal(seenOpponents.has('marco-tabacco-foto-gruppo'), false);
  assert.equal(play.run.finalRecord().rankLabel, '10 DAN');
  assert.equal(play.run.finalRecord().matches, 20);
  assert.equal(play.run.finalRecord().completed, true);
  assert.equal(play.run.nextMatch(), null);
});

test('a drawn engine round does not promote or end Arcade and can continue to a valid win', () => {
  const play = session(), match = play.start();
  contact(play.game);
  play.game.finishRound('time');
  assert.equal(play.game.getState().roundWinner, null);
  assert.equal(play.game.getState().phase, 'roundOver');
  assert.equal(play.run.getState().wins, 0);
  assert.equal(play.run.nextMatch().matchId, match.matchId);
  play.advance(2.5);
  knockOutRound(play, 0);
  play.advance(2.4);
  knockOutRound(play, 0);
  assert.equal(play.game.getState().round, 3);
  assert.equal(play.run.recordMatch(play.result(match)).rank.id, '10-kyu');
});

test('the engine keeps named roster entries isolated from a registered Arcade profile', () => {
  const original = context.KyokushinRoster.angelo;
  const play = session();
  play.start();
  assert.equal(Object.prototype.hasOwnProperty.call(context.KyokushinRoster, 'arcade-player'), false);
  assert.equal(context.KyokushinRoster.angelo, original);
  const separateGame = new KyokushinGame();
  separateGame.start({ player: 'arcade-player' });
  assert.equal(separateGame.getState().fighters[0].id, 'angelo');
  assert.throws(() => play.game.registerArcadeCharacter({ name: '<script>' }));
});
