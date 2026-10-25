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
    tag, textContent: '', hidden: false, disabled: false, open: false, children: [],
    classList: { add: name => classes.add(name), toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
    style: { setProperty() {} }, setAttribute(name, value) { attributes.set(name, value); }, getAttribute(name) { return attributes.get(name); },
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, querySelectorAll() { return []; },
  };
}
function fixture(client = {}, initialize = true) {
  const elements = new Map();
  const document = { activeElement: null };
  const get = id => {
    if (!elements.has(id)) {
      const element = node(); element.focus = () => { document.activeElement = element; };
      elements.set(id, element);
    }
    return elements.get(id);
  };
  const choices = Array.from({ length: 7 }, () => node('button'));
  get('arcade-form').querySelectorAll = () => choices;
  get('leaderboard-dialog').querySelector = () => get('leaderboard-close');
  Object.assign(document, { getElementById: get, createElement: node, querySelectorAll: () => [] });
  const context = vm.createContext({ document });
  context.window = context;
  context.DojoArcade = Arcade;
  context.DojoLeaderboard = { submission: () => ({ configured: true }), submit: async record => ({ id: record.id }), load: async () => [], ...client };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/arcade-ui.js'), 'utf8'), context, { filename: 'arcade-ui.js' });
  const ui = Object.create(context.ArcadeUI.prototype);
  let opens = 0;
  Object.assign(ui, { appearance: { name: 'Anna', gender: 'female', hairstyle: 2 }, ready: true,
    onFinalLeaderboard() { opens++; get('leaderboard-dialog').open = true; } });
  const state = { rank: Arcade.RANKS[4], score: 9000, wins: 4 };
  const record = Object.freeze({ id: 'finished-run-1', name: 'Anna', score: 9000, wins: 4, rankLabel: '7 KYU' });
  const pending = initialize ? ui.showResult(state, record) : Promise.resolve();
  return { ui, get, document, choices, state, record, pending, opens: () => opens, client: context.DojoLeaderboard,
    close() { get('leaderboard-dialog').open = false; ui.dismissLeaderboard(); } };
}

test('a final result automatically opens the leaderboard and submits only once across repeated renders', async () => {
  const request = deferred(), calls = [], loads = [];
  const f = fixture({ submit(record) { calls.push(record); return request.promise; }, load: async options => { loads.push(options); return [f.record]; } });
  assert.deepEqual(calls, [f.record]);
  assert.equal(f.opens(), 1);
  assert.equal(f.get('arcade-publish').hidden, true);
  assert.match(f.get('leaderboard-save-status').textContent, /automaticamente/);
  const repeated = f.ui.showResult(f.state, { ...f.record });
  const duplicate = f.ui.publishRecord();
  assert.equal(calls.length, 1);
  request.resolve({ id: f.record.id, stored: true });
  await Promise.all([f.pending, repeated, duplicate]);
  await f.ui.showResult(f.state, f.record);
  assert.equal(calls.length, 1);
  assert.equal(f.opens(), 1);
  assert.ok(loads.every(options => options.force === true));
  assert.match(f.get('leaderboard-save-status').textContent, /SALVATO/);
  assert.equal(f.get('leaderboard-body').children[0].classList.contains('own-record'), true);
  assert.match(f.get('leaderboard-status').textContent, /1º posto/);
});

test('promotions during an ongoing run do not save or interrupt the next challenge', () => {
  let calls = 0;
  const f = fixture({ submit: async () => { calls++; } }, false);
  f.ui.showResult(f.state, null);
  assert.equal(calls, 0); assert.equal(f.opens(), 0);
  assert.equal(f.get('arcade-check-result').hidden, true);
  assert.equal(f.get('arcade-result-summary').hidden, false);
});

test('an uncertain save exposes retry in the visible leaderboard and preserves the same run id', async () => {
  const calls = [];
  const f = fixture({ submit(record) { calls.push(record); return calls.length === 1 ? Promise.reject(new Error('Invio non confermato')) : Promise.resolve({ id: record.id }); } });
  await f.pending;
  assert.equal(f.get('leaderboard-retry-save').hidden, false);
  assert.equal(f.get('arcade-publish').hidden, false);
  assert.equal(f.ui.publishedId, null);
  assert.match(f.get('leaderboard-save-status').textContent, /non confermato/);
  await f.ui.publishRecord();
  assert.deepEqual(calls, [f.record, f.record]);
  assert.equal(f.get('leaderboard-retry-save').hidden, true);
  assert.match(f.get('leaderboard-save-status').textContent, /SALVATO/);
});

test('a mismatched confirmation never marks a run saved', async () => {
  const f = fixture({ submit: async () => ({ id: 'another-run' }) });
  await f.pending;
  assert.equal(f.ui.publishedId, null);
  assert.equal(f.get('leaderboard-retry-save').hidden, false);
  assert.match(f.get('leaderboard-save-status').textContent, /non è valida/);
});

for (const fails of [false, true]) test(`a late ${fails ? 'failed' : 'successful'} save cannot overwrite a new run or load its leaderboard`, async () => {
  const first = deferred(), second = deferred(); let loads = 0;
  const f = fixture({ submit: record => record.id === 'finished-run-1' ? first.promise : second.promise, load: async () => { loads++; return []; } });
  const next = { ...f.record, id: 'finished-run-2', name: 'Marco' };
  const pending = f.ui.showResult(f.state, next);
  const message = f.get('leaderboard-save-status').textContent;
  if (fails) first.reject(new Error('Vecchio errore')); else first.resolve({ id: f.record.id });
  await f.pending;
  assert.equal(f.ui.record, next);
  assert.equal(f.get('leaderboard-save-status').textContent, message);
  assert.equal(f.ui.publishedId, null); assert.equal(loads, 0);
  second.resolve({ id: next.id }); await pending;
  assert.equal(f.ui.publishedId, next.id); assert.equal(loads, 1);
});

for (const fails of [false, true]) test(`closing the final leaderboard during a ${fails ? 'failed' : 'successful'} save keeps it closed`, async () => {
  const request = deferred(); let loads = 0;
  const f = fixture({ submit: () => request.promise, load: async () => { loads++; return []; } });
  f.close();
  if (fails) request.reject(new Error('Connessione interrotta')); else request.resolve({ id: f.record.id });
  await f.pending;
  assert.equal(f.opens(), 1); assert.equal(loads, 0);
  assert.equal(f.get('leaderboard-dialog').open, false);
  assert.equal(f.ui.publishedId, fails ? null : f.record.id);
  await f.ui.checkRecord();
  assert.equal(f.opens(), 2); assert.equal(loads, 1);
});

for (const fails of [false, true]) test(`a late ${fails ? 'failed' : 'successful'} leaderboard read cannot mutate a closed dialog or a new run`, async () => {
  const request = deferred();
  const f = fixture({ load: () => request.promise }, false);
  f.get('leaderboard-dialog').open = true;
  const pending = f.ui.loadLeaderboard(true);
  f.close();
  f.ui.showResult(null);
  f.get('leaderboard-status').textContent = 'Nuova schermata';
  if (fails) request.reject(new Error('Vecchio errore')); else request.resolve([f.record]);
  await pending;
  assert.equal(f.get('leaderboard-status').textContent, 'Nuova schermata');
  assert.equal(f.get('leaderboard-body').children.length, 0);
});

test('a saved result below the top fifty is displayed with its actual place and highlighted', async () => {
  let rows;
  const f = fixture({ load: async () => rows.slice(0, 50), details: () => ({ entries: rows, archive: false }) }, false);
  rows = Array.from({ length: 125 }, (_, i) => ({ ...f.record, id: 'higher-' + i, name: 'Karateka ' + i }));
  rows.push(f.record);
  await f.ui.showResult(f.state, f.record);
  const shown = f.get('leaderboard-body').children;
  assert.equal(shown.length, 51);
  assert.equal(shown[50].children[0].textContent, 126);
  assert.equal(shown[50].classList.contains('own-record'), true);
  assert.match(f.get('leaderboard-status').textContent, /126º posto su 126/);
});

test('a confirmed save with unavailable reads stays truthful without fabricating a row or position', async () => {
  const f = fixture({ load: async () => { throw new Error('Connessione non disponibile'); } });
  await f.pending;
  assert.match(f.get('leaderboard-save-status').textContent, /SALVATO/);
  assert.match(f.get('leaderboard-status').textContent, /risultato è salvato.*Connessione/);
  assert.equal(f.get('leaderboard-body').children.length, 0);
  assert.equal(f.get('leaderboard-reload').disabled, false);
});

test('archive fallback does not imply a failed automatic submission was saved', async () => {
  const f = fixture({ submit: async () => { throw new Error('Invio non confermato'); }, load: async () => [], details: () => ({ archive: true, entries: [] }) });
  await f.pending;
  assert.equal(f.ui.publishedId, null);
  assert.match(f.get('leaderboard-save-status').textContent, /non confermato/);
  assert.match(f.get('leaderboard-note').textContent, /ultima classifica disponibile/);
  assert.equal(f.get('leaderboard-retry-save').hidden, false);
  assert.doesNotMatch(f.get('leaderboard-note').textContent, /github/i);
});

test('a stale archive can explain a confirmed save without claiming the row is already present', async () => {
  const f = fixture({ load: async () => [], details: () => ({ archive: true, entries: [] }) });
  await f.pending;
  assert.match(f.get('leaderboard-save-status').textContent, /SALVATO/);
  assert.match(f.get('leaderboard-status').textContent, /classifica si sta aggiornando/);
  assert.equal(f.get('leaderboard-body').children.length, 0);
});

test('unconfigured saving shows a read-only leaderboard without a misleading save button', async () => {
  let submits = 0;
  const f = fixture({ submission: () => ({ configured: false }), submit: async () => { submits++; } });
  await f.pending;
  assert.equal(submits, 0);
  assert.match(f.get('leaderboard-save-status').textContent, /non disponibile/);
  assert.equal(f.get('leaderboard-retry-save').hidden, true);
  assert.equal(f.get('arcade-publish').hidden, true);
  assert.equal(f.opens(), 1);
});

test('leaving Arcade clears final-only UI and a slow save does not re-open it', async () => {
  const request = deferred();
  const f = fixture({ submit: () => request.promise });
  f.ui.showResult(null);
  request.resolve({ id: f.record.id }); await f.pending;
  assert.equal(f.ui.record, null);
  assert.equal(f.get('result-panel').classList.contains('arcade-result'), false);
  for (const id of ['arcade-result-summary', 'arcade-publish', 'arcade-check-result', 'leaderboard-save-status', 'leaderboard-run-summary']) assert.equal(f.get(id).hidden, true);
  assert.equal(f.get('arcade-publish-status').textContent, '');
  assert.equal(f.opens(), 1);
});

test('busy creator fields freeze together and cancellation restores editing without enabling an unready submit', () => {
  const f = fixture({}, false);
  f.ui.ready = false; f.ui.setBusy(true);
  assert.equal(f.get('arcade-name').disabled, true);
  assert.ok(f.choices.every(choice => choice.disabled));
  assert.equal(f.get('arcade-form').getAttribute('aria-busy'), 'true');
  f.ui.setBusy(false);
  assert.equal(f.get('arcade-name').disabled, false);
  assert.ok(f.choices.every(choice => !choice.disabled));
  assert.equal(f.get('arcade-create-submit').disabled, true);
  f.ui.ready = true; f.ui.setBusy(false);
  assert.equal(f.get('arcade-create-submit').disabled, false);
});

test('the rendered belt shows exactly ten gold bars at 10 Dan', async () => {
  const f = fixture({}, false);
  await f.ui.showResult({ ...f.state, rank: Arcade.RANKS[20], wins: 20 }, f.record);
  const belt = f.get('arcade-result-belt');
  assert.equal(belt.getAttribute('aria-label'), '10 DAN');
  assert.equal(belt.children.length, 1);
  assert.equal(belt.children[0].children.length, 10);
});

for (const [focused, destination] of [['leaderboard-retry-save', 'leaderboard-close'], ['arcade-publish', 'arcade-check-result'], ['leaderboard-close', 'leaderboard-close']]) {
  test(`retry preserves usable focus from ${focused} without stealing another control's focus`, async () => {
    const retry = deferred(); let attempts = 0;
    const f = fixture({ submit: () => ++attempts === 1 ? Promise.reject(new Error('Connessione interrotta')) : retry.promise });
    await f.pending;
    if (focused === 'arcade-publish') f.close();
    f.get(focused).focus();
    const pending = f.ui.publishRecord();
    assert.equal(f.document.activeElement, f.get(destination));
    assert.equal(f.get(destination).hidden, false);
    assert.equal(f.get(destination).disabled, false);
    assert.equal(f.get('leaderboard-retry-save').hidden, true);
    retry.resolve({ id: f.record.id }); await pending;
    assert.equal(f.document.activeElement, f.get(destination));
  });
}

test('a leaderboard with one public result uses the singular label', async () => {
  const f = fixture({}, false);
  f.client.load = async () => [f.record];
  await f.ui.loadLeaderboard();
  assert.equal(f.get('leaderboard-status').textContent, '1 risultato in classifica.');
});
