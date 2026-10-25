'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
context.window = context;
for (const file of ['scripts/roster.js', 'scripts/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const { KyokushinGame, KyokushinRoster } = context;

const names = {
  'emanuele-micalizzi': 'EMANUELE MICALIZZI',
  'francesco-privitera-1': 'FRANCESCO PRIVITERA 1',
  angelo: 'ANGELO',
  samuel: 'SAMUEL',
  'marco-tabacco-collage': 'MARCO TABACCO',
  'gabriele-carbonaro': 'GABRIELE CARBONARO',
  'leonardo-cappellani': 'LEONARDO CAPPELLANI',
  'gabriele-randazzo': 'GABRIELE RANDAZZO',
  'matteo-spata': 'MATTEO SPATA',
  'oscar-gueli': 'OSCAR GUELI',
  'andrea-vullo': 'ANDREA VULLO',
  'andrea-barbagallo': 'ANDREA BARBAGALLO',
};
const ids = Object.keys(names);
const damages = { tsuki: 65, gyaku: 95, shita: 90, kagi: 110, gedan: 90, mae: 120, mawashi: 145, ushiro: 185, kaiten: 235 };

function newGame(options = {}, random = () => .9) {
  const events = [];
  const game = new KyokushinGame({ random, onEvent: event => events.push(event) });
  game.start({ player: 'andrea-vullo', opponent: 'gabriele-carbonaro', mode: 'versus', ...options });
  return { game, events };
}

function advance(game, seconds) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 1 / 120) {
    game.update(Math.min(remaining, 1 / 120));
  }
}

function fighterIds(game) {
  return Array.from(game.getState().fighters, fighter => fighter.id);
}

function readyAtContact(game) {
  const state = game.getState();
  state.phase = 'fight';
  state.phaseTime = 0;
  state.fighters[0].x = 500;
  state.fighters[1].x = 630;
  for (const fighter of state.fighters) fighter.ki = 100;
  return state.fighters;
}

test('all named characters are present with only the retained Marco appearance', () => {
  assert.deepEqual(Object.keys(KyokushinRoster).sort(), ids.slice().sort());
  for (const [id, name] of Object.entries(names)) assert.equal(KyokushinRoster[id].short, name);
  assert.equal(KyokushinRoster['marco-tabacco-collage'].assetId, '01-marco-tabacco-collage');
  assert.equal(KyokushinRoster['marco-tabacco-foto-gruppo'], undefined);
  assert.equal(Object.values(KyokushinRoster).filter(character => character.name === 'MARCO TABACCO').length, 1);
});

for (const mode of ['cpu', 'training', 'versus']) {
  test(`${mode}: every one of the ${ids.length ** 2} pairings survives restart and a new round`, () => {
    for (const player of ids) {
      for (const opponent of ids) {
        const label = `${player} vs ${opponent}`;
        const { game } = newGame({ player, opponent, mode });
        assert.deepEqual(fighterIds(game), [player, opponent], `${label}: selection`);
        assert.equal(game.getState().mode, mode);
        assert.equal(game.getState().timer, mode === 'training' ? Infinity : 60);

        game.getState().fighters[0].wins = 1;
        game.nextRound();
        assert.deepEqual(fighterIds(game), [player, opponent], `${label}: next round`);
        assert.equal(game.getState().round, 2);
        assert.equal(game.getState().fighters[0].wins, 1);
        assert.equal(game.getState().fighters[1].wins, 0);

        game.reset();
        assert.deepEqual(fighterIds(game), [player, opponent], `${label}: reset`);
        assert.equal(game.getState().round, 1);
        assert.equal(game.getState().fighters[0].wins, 0);
        assert.equal(game.getState().fighters[0].hp, 1000);
        assert.equal(game.getState().timer, mode === 'training' ? Infinity : 60);
      }
    }
  });
}

test('invalid selections fall back to original fighters without accepting inherited object keys', () => {
  for (const invalid of ['unknown-fighter', 'marco-tabacco-foto-gruppo', '', '__proto__', 'constructor', 'toString', null, undefined, 42]) {
    const { game } = newGame({ player: invalid, opponent: invalid, mode: 'invalid', difficulty: 'invalid' });
    assert.deepEqual(fighterIds(game), ['angelo', 'samuel']);
    assert.equal(game.getState().mode, 'cpu');
    assert.equal(game.getState().difficulty, 'normal');
    game.start({ player: 'samuel', opponent: invalid });
    assert.deepEqual(fighterIds(game), ['samuel', 'angelo']);
    game.start({ player: 'andrea-vullo', opponent: invalid });
    assert.deepEqual(fighterIds(game), ['andrea-vullo', 'samuel']);
  }
});

test('selected CPU opponent leaves the introduction, approaches and attacks', () => {
  const { game, events } = newGame({ mode: 'cpu', opponent: 'oscar-gueli' }, () => .4);
  advance(game, 7);
  assert.deepEqual(fighterIds(game), ['andrea-vullo', 'oscar-gueli']);
  assert.ok(events.some(event => event.type === 'fight'));
  assert.ok(events.some(event => event.type === 'attack' && event.player === 1));
  assert.ok(events.some(event => event.type === 'hit' && event.player === 1));
  assert.ok(game.getState().timer < 60);
});

test('training keeps the selected partner stationary and restores its health', () => {
  const { game, events } = newGame({ mode: 'training', opponent: 'leonardo-cappellani' });
  advance(game, 2);
  const partner = game.getState().fighters[1];
  const initialX = partner.x;
  partner.hp = 600;
  advance(game, 4);
  assert.equal(partner.id, 'leonardo-cappellani');
  assert.equal(partner.x, initialX);
  assert.equal(partner.hp, partner.maxHp);
  assert.equal(game.getState().timer, Infinity);
  assert.equal(game.getState().phase, 'fight');
  assert.equal(events.filter(event => event.type === 'attack' && event.player === 1).length, 0);
});

test('versus opponent waits for player two input and attacks when commanded', () => {
  const { game, events } = newGame({ mode: 'versus', opponent: 'gabriele-randazzo' });
  advance(game, 3);
  assert.equal(events.filter(event => event.type === 'attack').length, 0);
  const [target, attacker] = readyAtContact(game);
  game.setInput(1, 'tsuki', true);
  advance(game, .5);
  game.setInput(1, 'tsuki', false);
  assert.equal(attacker.id, 'gabriele-randazzo');
  assert.equal(target.hp, 1000 - damages.tsuki);
  assert.ok(events.some(event => event.type === 'hit' && event.player === 1 && event.move === 'tsuki'));
});

for (const player of ids) {
  test(`${player}: all nine techniques land once and retain their damage`, () => {
    for (const [move, damage] of Object.entries(damages)) {
      const { game, events } = newGame({ player, opponent: 'matteo-spata' });
      const [attacker, target] = readyAtContact(game);
      game.requestAttack(attacker, move);
      advance(game, 1.2);
      const hits = events.filter(event => event.type === 'hit' && event.player === 0);
      assert.equal(hits.length, 1, `${move}: one contact`);
      assert.equal(hits[0].move, move);
      assert.equal(hits[0].damage, damage, `${move}: unchanged damage`);
      assert.equal(target.hp, 1000 - damage, `${move}: health deducted once`);
      assert.equal(attacker.id, player);
    }
  });
}

test('a new character can reach gyaku through repeated punch input', () => {
  const { game, events } = newGame({ player: 'gabriele-carbonaro' });
  readyAtContact(game);
  game.setInput(0, 'tsuki', true);
  advance(game, .04);
  game.setInput(0, 'tsuki', false);
  game.setInput(0, 'tsuki', true);
  advance(game, .7);
  const moves = events.filter(event => event.type === 'attack' && event.player === 0).map(event => event.move);
  assert.deepEqual(moves, ['tsuki', 'gyaku']);
});

test('round and match wins announce the selected name on either side', () => {
  for (const id of ids) {
    for (const winnerIndex of [0, 1]) {
      const { game, events } = newGame({ player: winnerIndex === 0 ? id : 'angelo', opponent: winnerIndex === 1 ? id : 'samuel' });
      for (let round = 1; round <= 2; round++) {
        const state = game.getState();
        state.phase = 'fight';
        state.fighters[1 - winnerIndex].hp = 0;
        game.update(1 / 120);
        assert.equal(state.announcementSub, `${names[id]} VINCE IL ROUND`);
        assert.equal(state.roundWinner, winnerIndex);
        assert.equal(state.fighters[winnerIndex].state, 'victory');
        if (round === 1) {
          advance(game, 2.5);
          assert.equal(state.round, 2);
          assert.equal(state.fighters[winnerIndex].id, id);
        } else {
          assert.equal(state.phase, 'matchOver');
          assert.equal(state.winner, winnerIndex);
        }
      }
      const match = events.find(event => event.type === 'match');
      assert.equal(match.id, id);
      assert.equal(match.winner, winnerIndex);
    }
  }
});

test('named ranks follow the belt progression and both new characters are Mu kyu', () => {
 for(const [id,rank,color] of [['marco-tabacco-collage','8 KYU','blue'],['gabriele-carbonaro','6 KYU','yellow'],['leonardo-cappellani','7 KYU','blue-yellow'],['gabriele-randazzo','9 KYU','orange-blue'],['andrea-barbagallo','10 KYU','orange'],['emanuele-micalizzi','MU KYU','white'],['francesco-privitera-1','MU KYU','white']]){
  assert.equal(KyokushinRoster[id].rank,'KARATEKA · '+rank);assert.equal(KyokushinRoster[id].beltColor,color);
 }
});
