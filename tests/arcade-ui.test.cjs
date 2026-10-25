'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Arcade = require('../scripts/arcade.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function node(tag = 'div') {
  const classes = new Set(), attributes = new Map();
  return {
    tag, textContent: '', hidden: false, disabled: false, children: [],
    classList: { add: name => classes.add(name), toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
    style: { setProperty() {} }, setAttribute(name, value) { attributes.set(name, value); }, getAttribute(name) { return attributes.get(name); },
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, querySelectorAll() { return []; },
  };
}

function fixture(client = {}) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  const choices = Array.from({ length: 7 }, () => node('button'));
  get('arcade-form').querySelectorAll = () => choices;
  const context = vm.createContext({ document: { getElementById: get, createElement: node, querySelectorAll: () => [] } });
  context.window = context;
  context.DojoArcade = Arcade;
  context.DojoLeaderboard = { submission: () => ({ configured: true }), ...client };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/arcade-ui.js'), 'utf8'), context, { filename: 'arcade-ui.js' });
  // Constructor DOM assembly is covered visually; these tests exercise its real
  // asynchronous methods against observable controls and independent requests.
  const ui = Object.create(context.ArcadeUI.prototype);
  Object.assign(ui, { appearance: { name: 'Anna', gender: 'female', hairstyle: 2 }, ready: true });
  const state = { rank: Arcade.RANKS[4], score: 9000, wins: 4 };
  const record = Object.freeze({ id: 'finished-run-1' });
  ui.showResult(state, record);
  return { ui, get, choices, state, record, client: context.DojoLeaderboard };
}

test('submitting a result without an account disables duplicate clicks until a verified response', async () => {
  const request = deferred(), calls = [];
  const f = fixture({ submit(record) { calls.push(record); return request.promise; } });
  const pending = f.ui.publishRecord();
  await f.ui.publishRecord();
  assert.deepEqual(calls, [f.record]);
  assert.equal(f.get('arcade-publish').disabled, true);
  assert.match(f.get('arcade-publish').textContent, /SALVO/);
  request.resolve({ id: f.record.id }); await pending;
  assert.equal(f.get('arcade-publish').disabled, true);
  assert.match(f.get('arcade-publish').textContent, /SALVATO/);
  assert.match(f.get('arcade-publish-status').textContent, /PUBBLICATO/);
});

test('a failed submission exposes a retry with the same final record', async () => {
  const calls = [];
  const f = fixture({ submit(record) { calls.push(record); return calls.length === 1 ? Promise.reject(new Error('Connessione interrotta')) : Promise.resolve({ id: record.id }); } });
  await f.ui.publishRecord();
  assert.equal(f.get('arcade-publish').disabled, false);
  assert.match(f.get('arcade-publish').textContent, /RIPROVA/);
  assert.equal(f.get('arcade-publish-status').textContent, 'Connessione interrotta');
  await f.ui.publishRecord();
  assert.deepEqual(calls, [f.record, f.record]);
  assert.match(f.get('arcade-publish-status').textContent, /PUBBLICATO/);
});

for (const fails of [false, true]) test(`late ${fails ? 'failed' : 'successful'} submission cannot overwrite a new run result`, async () => {
  const request = deferred(), f = fixture({ submit: () => request.promise });
  const pending = f.ui.publishRecord();
  const next = Object.freeze({ id: 'finished-run-2' });
  f.ui.showResult({ ...f.state, rank: Arcade.RANKS[7], wins: 7 }, next);
  const status = f.get('arcade-publish-status').textContent;
  if (fails) request.reject(new Error('Errore vecchia partita')); else request.resolve({ id: f.record.id });
  await pending;
  assert.equal(f.ui.record, next);
  assert.equal(f.get('arcade-publish-status').textContent, status);
  assert.equal(f.get('arcade-publish').disabled, false);
  assert.equal(f.get('arcade-publish').textContent, 'SALVA IN CLASSIFICA ↗');
});

for (const fails of [false, true]) test(`late ${fails ? 'failed' : 'successful'} verification cannot overwrite controls after leaving Arcade`, async () => {
  const request = deferred(), f = fixture({ load: () => request.promise });
  const pending = f.ui.checkRecord();
  f.ui.showResult(null);
  f.get('arcade-check-result').disabled = true;
  if (fails) request.reject(new Error('Errore verifica vecchia')); else request.resolve([f.record]);
  await pending;
  assert.equal(f.ui.record, null);
  assert.equal(f.get('arcade-publish-status').textContent, '');
  assert.equal(f.get('arcade-check-result').disabled, true);
  assert.equal(f.get('arcade-publish').hidden, true);
});

test('unconfigured public submission remains unavailable while a final result can still be viewed', () => {
  const f = fixture({ submission: () => ({ configured: false }) });
  assert.equal(f.get('arcade-publish').disabled, true);
  assert.equal(f.get('arcade-result-summary').hidden, false);
  assert.match(f.get('arcade-publish-status').textContent, /attivato/);
  assert.equal(f.get('arcade-check-result').disabled, false);
});

test('resetting the result clears Arcade-only controls before ordinary modes', () => {
  const f = fixture();
  f.ui.showResult(null);
  assert.equal(f.ui.record, null);
  assert.equal(f.get('result-panel').classList.contains('arcade-result'), false);
  for (const id of ['arcade-result-summary', 'arcade-publish', 'arcade-check-result']) assert.equal(f.get(id).hidden, true);
  assert.equal(f.get('arcade-publish-status').textContent, '');
});

test('busy creator fields freeze together and cancellation restores editing without enabling an unready submit', () => {
  const f = fixture();
  f.ui.ready = false;
  f.ui.setBusy(true);
  assert.equal(f.get('arcade-name').disabled, true);
  assert.ok(f.choices.every(choice => choice.disabled));
  assert.equal(f.get('arcade-form').getAttribute('aria-busy'), 'true');
  f.ui.setBusy(false);
  assert.equal(f.get('arcade-name').disabled, false);
  assert.ok(f.choices.every(choice => !choice.disabled));
  assert.equal(f.get('arcade-create-submit').disabled, true);
  f.ui.ready = true;
  f.ui.setBusy(false);
  assert.equal(f.get('arcade-create-submit').disabled, false);
});

test('the rendered belt shows exactly ten gold bars at 10 Dan', () => {
  const f = fixture();
  f.ui.showResult({ ...f.state, rank: Arcade.RANKS[20], wins: 20 }, f.record);
  const belt = f.get('arcade-result-belt');
  assert.equal(belt.getAttribute('aria-label'), '10 DAN');
  assert.equal(belt.children.length, 1);
  assert.equal(belt.children[0].children.length, 10);
});

test('verification searches all fetched entries, even when a result is below the top 100', async () => {
  let f;
  f = fixture({ load: async () => [], details: () => ({ entries: [f.record] }) });
  await f.ui.checkRecord();
  assert.match(f.get('arcade-publish-status').textContent, /PUBBLICATO/);
});

test('verification cannot start during publication and becomes available again after the save', async () => {
  const request = deferred(); let checks = 0;
  const f = fixture({ submit: () => request.promise, load: async () => { checks++; return []; } });
  const pending = f.ui.publishRecord();
  assert.equal(f.get('arcade-check-result').disabled, true);
  await f.ui.checkRecord();
  assert.equal(checks, 0);
  assert.equal(f.get('arcade-publish-status').textContent, 'Invio il risultato alla classifica…');
  request.resolve({ id: f.record.id }); await pending;
  assert.equal(f.get('arcade-check-result').disabled, false);
  assert.equal(f.ui.publishedId, f.record.id);
});

for (const fails of [false, true]) test(`an earlier ${fails ? 'failed' : 'empty'} verification cannot undo a later successful save`, async () => {
  const checking = deferred(), saving = deferred();
  const f = fixture({ load: () => checking.promise, submit: () => saving.promise });
  const check = f.ui.checkRecord();
  const save = f.ui.publishRecord();
  saving.resolve({ id: f.record.id }); await save;
  const savedMessage = f.get('arcade-publish-status').textContent;
  assert.match(savedMessage, /PUBBLICATO/);
  if (fails) checking.reject(new Error('Verifica vecchia fallita')); else checking.resolve([]);
  await check;
  assert.equal(f.get('arcade-publish-status').textContent, savedMessage);
  assert.equal(f.get('arcade-publish').textContent, 'RISULTATO SALVATO ✓');
  assert.equal(f.get('arcade-check-result').disabled, false);
});

test('an old verification finishing during a save cannot prematurely re-enable the check button', async () => {
  const checking = deferred(), saving = deferred();
  const f = fixture({ load: () => checking.promise, submit: () => saving.promise });
  const check = f.ui.checkRecord();
  const save = f.ui.publishRecord();
  checking.resolve([]); await check;
  assert.equal(f.get('arcade-check-result').disabled, true);
  assert.equal(f.get('arcade-publish-status').textContent, 'Invio il risultato alla classifica…');
  saving.reject(new Error('Invio interrotto')); await save;
  assert.equal(f.get('arcade-check-result').disabled, false);
  assert.equal(f.get('arcade-publish').disabled, false);
  assert.equal(f.get('arcade-publish-status').textContent, 'Invio interrotto');
});

test('a temporarily stale public list preserves confirmed publication and the confirmation does not leak to another run', async () => {
  const f = fixture({ submit: async record => ({ id: record.id }), load: async () => [] });
  await f.ui.publishRecord();
  await f.ui.checkRecord();
  assert.equal(f.get('arcade-publish-status').textContent, 'Risultato salvato. La classifica si sta aggiornando.');
  f.ui.showResult(f.state, Object.freeze({ id: 'finished-run-2' }));
  assert.equal(f.ui.publishedId, null);
  await f.ui.checkRecord();
  assert.match(f.get('arcade-publish-status').textContent, /non ancora trovato/);
});
