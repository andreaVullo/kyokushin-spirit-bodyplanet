'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const arcade = require('../scripts/arcade.js');
const custom = require('../scripts/online-custom.js');
const { KyokushinGame } = require('../scripts/game.js');
const { encodeState, decodeState } = require('../scripts/online-game.js');

test('both online custom fighters support exactly the 21 Arcade ranks with independent art identities', () => {
  const game = new KyokushinGame(), characters = {}, appearances = new Map();
  custom.install(game, characters, { setCharacter: value => appearances.set(value.id, value) });
  assert.equal(appearances.size, 42);
  for (const gender of ['male', 'female']) for (const rank of arcade.RANKS) {
    const id = `custom-${gender}-${rank.index}`;
    assert.equal(characters[id].rank, rank.label);
    assert.equal(appearances.get(id).gender, gender);
    assert.equal(appearances.get(id).rank, rank);
    assert.ok(game.characters[id]);
  }
  assert.equal(custom.roster['custom-female-21'], undefined);
});

test('different belts of the same custom fighter round-trip online without changing combat statistics', () => {
  for (const mode of ['versus', 'training']) {
    const host = new KyokushinGame(), guest = new KyokushinGame();
    for (const game of [host, guest]) custom.install(game, {}, { setCharacter() {} });
    for (const gender of ['male', 'female']) {
      const ids = [`custom-${gender}-0`, `custom-${gender}-20`];
      host.start({ player: ids[0], opponent: ids[1], mode });
      const state = decodeState(encodeState(host.getState()), guest, ids);
      assert.deepEqual(state.fighters.map(f => f.id), ids);
      assert.equal(state.fighters[0].hp, state.fighters[1].hp);
      assert.equal(state.fighters[0].ki, state.fighters[1].ki);
    }
  }
});
