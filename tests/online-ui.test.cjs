'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanName, cleanCode, inviteURL, OnlineUI } = require('../scripts/online-ui.js');
const { NameDraft } = require('../scripts/name-keyboard.js');

test('online nicknames retain Italian names and reject markup, empty or excessive values', () => {
  assert.equal(cleanName('  Nicolo\u0300  D’Angelo '), 'Nicolò D’Angelo');
  for (const value of ['', 'A', 'A'.repeat(25), '<script>x</script>', '😀😀']) assert.throws(() => cleanName(value));
});
test('room codes normalize case while accepting only six alphanumeric characters', () => {
  assert.equal(cleanCode(' ab23xy '), 'AB23XY');
  for (const value of ['', 'ABCDE', 'ABCDEFG', 'AB CDE', 'ÀBCDEF', '<1234>']) assert.throws(() => cleanCode(value));
  for (const value of ['AB12XY', 'AB02XY', 'ABI2XY', 'ABO2XY']) assert.throws(() => cleanCode(value), /senza I, O, 0 e 1/);
});
test('an invitation contains only a room code, never a local player session or embedded display parameters', () => {
  assert.equal(inviteURL('AB23XY', 'https://example.test/Gioca.html?token=secret&embed=1&hostdisplay=1#settings'), 'https://example.test/Gioca.html?room=AB23XY');
});
test('the graphical code keyboard is uppercase, six-character and excludes spaces or accents', () => {
  const draft = new NameDraft('', { maxLength: 6, code: true });
  assert.equal(draft.insert('ab2'), true); assert.equal(draft.value, 'AB2');
  assert.equal(draft.insert('é'), false); assert.equal(draft.insert(' '), false);
  assert.equal(draft.insert('3xy'), true); assert.equal(draft.value, 'AB23XY'); assert.equal(draft.insert('Z'), false);
  draft.move(-1); draft.backspace(); draft.insert('w'); assert.equal(draft.value, 'AB23WY');
});
test('each room role resolves only its own slot, with explicit slot taking precedence', () => {
  const view = Object.create(OnlineUI.prototype), players = [{ slot: 0, name: 'Host' }, { slot: 1, name: 'Guest' }];
  view.room = { role: 'guest', players }; assert.equal(view.localPlayer().name, 'Guest');
  view.room = { role: 'host', players }; assert.equal(view.localPlayer().name, 'Host');
  view.room = { role: 'host', selfSlot: 1, players }; assert.equal(view.localPlayer().name, 'Guest');
  view.room = null; assert.equal(view.localPlayer(), null);
});
