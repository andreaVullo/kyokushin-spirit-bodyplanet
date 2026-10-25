'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NameDraft, NameKeyboard } = require('../scripts/name-keyboard.js');
const { validateCharacter } = require('../scripts/arcade.js');

test('editing an Italian name preserves accents and inserts/deletes at the cursor', () => {
  const draft = new NameDraft('Nicolo\u0300');
  assert.equal(draft.value, 'Nicolò');
  draft.move(-1); draft.backspace(); draft.insert('l'); draft.move(1);
  draft.insert(' D’Angelo'); assert.equal(draft.value, 'Nicolò D’Angelo');
  draft.move(-8); draft.delete(); assert.equal(draft.value, 'Nicolò ’Angelo');
  draft.move(-100); assert.equal(draft.caret, 0);
  draft.move(100); assert.equal(draft.caret, draft.chars.length);
});
test('24-character names cannot overflow, and markup/newlines are rejected without changing the draft', () => {
  const draft = new NameDraft('A'.repeat(23));
  assert.equal(draft.insert('è'), true);
  assert.equal(draft.insert('x'), false);
  draft.backspace();
  for (const text of ['<', '\n', 'A<script>', '😀']) assert.equal(draft.insert(text), false);
  assert.equal(draft.value, 'A'.repeat(23));
});
function fixture(name = '') {
  const messages = new Map(), writes = [];
  const ui = Object.create(NameKeyboard.prototype);
  Object.assign(ui, { draft: new NameDraft(name), input: { value: 'Originale' }, upper: true,
    render() {}, validate: name => validateCharacter({ name }).name, onConfirm: name => writes.push(name),
    dialog: { open: true, close() { this.open = false; }, querySelector(selector) { if (!messages.has(selector)) messages.set(selector, { textContent: '' }); return messages.get(selector); } } });
  return { ui, writes, messages };
}
test('cancel discards the draft, without changing the creator or saved name', () => {
  const { ui, writes } = fixture('Andrea'); ui.press('X'); ui.press('cancel');
  assert.equal(ui.input.value, 'Originale'); assert.deepEqual(writes, []); assert.equal(ui.dialog.open, false);
});
test('confirmation validates and normalizes a name before updating the creator once', () => {
  const { ui, writes } = fixture(' Andrea  B. '); ui.press('confirm');
  assert.equal(ui.input.value, 'Andrea B.'); assert.deepEqual(writes, ['Andrea B.']); assert.equal(ui.confirmed, true); assert.equal(ui.dialog.open, false);
});
test('an invalid name leaves the dialog open and does not start the game', () => {
  const { ui, writes, messages } = fixture('A'); ui.press('confirm');
  assert.equal(ui.dialog.open, true); assert.deepEqual(writes, []); assert.match(messages.get('.name-error').textContent, /2 a 24/);
});
test('touch entry prevents OS text editing while desktop entry remains editable', () => {
  const attributes = {}; const ui = Object.create(NameKeyboard.prototype);
  ui.input = { setAttribute(name, value) { attributes[name] = value; } };
  ui.setTouch(true); assert.equal(ui.input.readOnly, true); assert.equal(ui.input.inputMode, 'none'); assert.equal(attributes['aria-haspopup'], 'dialog');
  ui.setTouch(false); assert.equal(ui.input.readOnly, false); assert.equal(ui.input.inputMode, 'text');
});
test('on-screen case, accents, spaces, cursor and deletion compose a valid real name', () => {
  const { ui, writes } = fixture(); ui.press('A'); ui.press('shift');
  for (const letter of 'NDREA') ui.press(letter);
  ui.press('space'); ui.press('shift'); ui.press('B'); ui.press('shift');
  for (const letter of 'ARBAGALLO') ui.press(letter);
  ui.press('X'); ui.press('backspace'); ui.press('confirm');
  assert.deepEqual(writes, ['Andrea Barbagallo']);
});
test('switching to numbers and accents preserves the name, cursor and case', () => {
  const { ui } = fixture('SARO'); ui.press('left'); ui.press('shift');
  ui.press('page'); assert.equal(ui.symbols, true);
  assert.equal(ui.draft.value, 'SARO'); assert.equal(ui.draft.caret, 3); assert.equal(ui.upper, false);
  ui.press('È'); assert.equal(ui.draft.value, 'SARèO');
  ui.press('page'); assert.equal(ui.symbols, false); assert.equal(ui.draft.caret, 4);
});
