'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real controller, engine and run progression through their public
// event surfaces. Real ArcadeUI methods run against a minimal DOM; only visual
// construction, rendering/audio, and the asynchronous network port are inert.
async function fixture() {
  const elements = new Map(), selectors = new Map(), nodes = [], events = new Map(), frames = new Map(), timers = new Map();
  let serial = 0, now = 0, ui;
  const context2d = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) });
  const document = { hidden: false, activeElement: null };
  function node(tag = 'div') {
    const listeners = new Map(), children = [], classes = new Set(), attributes = new Map(), subnodes = new Map();
    const item = { tagName: tag.toUpperCase(), textContent: '', dataset: {}, style: { setProperty() {} }, children, childNodes: children,
      hidden: false, disabled: false, inert: false, open: false, value: 'normal', width: 800, height: 600,
      classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle(name, enabled) { enabled = enabled ?? !classes.has(name); enabled ? classes.add(name) : classes.delete(name); return enabled; } },
      setAttribute(name, value) { attributes.set(name, String(value)); }, getAttribute: name => attributes.get(name),
      append(...items) { children.push(...items); }, replaceChildren(...items) { children.splice(0, children.length, ...items); },
      querySelector(selector) { if (!subnodes.has(selector)) subnodes.set(selector, node(selector === '.close-dialog' ? 'button' : 'div')); return subnodes.get(selector); },
      querySelectorAll() { return []; }, closest() { return null; },
      getContext: () => context2d, getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }),
      focus() { document.activeElement = item; }, scrollIntoView() {},
      showModal() { item.open = true; item.querySelector('.close-dialog').focus(); }, close() { item.open = false; },
      addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
      dispatch(type, fields = {}) { const event = { target: item, preventDefault() {}, ...fields }; for (const listener of listeners.get(type) || []) listener(event); },
    };
    nodes.push(item); return item;
  }
  const get = id => { if (!elements.has(id)) { const element = node(id.endsWith('dialog') ? 'dialog' : 'div'); element.id = id; elements.set(id, element); } return elements.get(id); };
  const dataSelectors = selector => selector.split(',').flatMap(part => { const key = part.match(/^\[data-([a-z-]+)\]$/)?.[1]?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); return key ? nodes.filter(item => key in item.dataset) : []; });
  Object.assign(document, {
    body: node('body'), documentElement: node('html'), getElementById: get, createElement: node,
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    querySelector(selector) { if (selector === 'dialog[open]') return [...elements.values()].find(element => element.open) || null; if (!selectors.has(selector)) selectors.set(selector, node()); return selectors.get(selector); },
    querySelectorAll(selector) { return selector === 'dialog' ? ['help-dialog', 'credits-dialog', 'leaderboard-dialog'].map(get) : dataSelectors(selector); },
    addEventListener() {},
  });
  const publications = [], requests = new Map(), saved = [];
  const leaderboard = {
    submission: () => ({ configured: true }),
    submit(record) { publications.push(record); return new Promise(resolve => requests.set(record.id, () => { saved.push(record); resolve({ id: record.id, stored: true }); })); },
    load: async () => saved.slice(), details: () => ({ entries: saved.slice(), archive: false }),
  };
  const browser = {
    document, URL, URLSearchParams, Node: { TEXT_NODE: 3 }, location: { search: '', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8765' },
    navigator: { maxTouchPoints: 0 }, performance: { now: () => now }, innerWidth: 1280, innerHeight: 720,
    screen: { orientation: { addEventListener() {} } }, console,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(type, handler) { if (!events.has(type)) events.set(type, []); events.get(type).push(handler); },
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id),
    Image: class { complete = true; naturalWidth = 1280; decode() { return Promise.resolve(); } },
    __kyokushinAsset: value => value,
    DojoAudio: class { enabled = false; status = {}; init() { return Promise.resolve(); } effect() {} update() {} },
    DojoControls: class { clear() {} press() {} release() {} },
    DojoDisplay: class { requested = false; hostManaged = false; toggle() {} open() {} },
    DojoOrientation: { resolve: () => ({ width: 1280, height: 720, logicalWidth: 1280, logicalHeight: 720, left: 0, top: 0, blocked: false, virtual: false }) },
    FighterArt: { load: async () => {}, loadFighters: async () => {}, drawSelectionPortrait() {}, drawPortrait() {}, draw() {} },
    ArcadeArt: { load: async () => {}, setCharacter() {} }, DojoLeaderboard: leaderboard,
  };
  const context = vm.createContext(browser); context.window = context; context.self = context; context.top = context; context.parent = context;
  for (const file of ['roster.js', 'game.js', 'arcade.js', 'arcade-ui.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts', file), 'utf8'), context, { filename: file });
  const ArcadeUI = context.ArcadeUI;
  context.ArcadeUI = function(options) {
    ui = Object.create(ArcadeUI.prototype);
    Object.assign(ui, { options, appearance: { name: '', gender: 'male', hairstyle: 0 }, ready: false, onFinalLeaderboard: options.onFinalLeaderboard, finalSaves: new Map(), leaderboardVersion: 0, results: [], publications });
    ui.showResult = function(state, record) { ui.results.push({ state, record }); return ArcadeUI.prototype.showResult.call(ui, state, record); };
    ui.completePublication = async function(record = ui.record) { requests.get(record?.id)?.(); await settle(); };
    return ui;
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/main.js'), 'utf8'), context, { filename: 'main.js' });
  async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  function frame() { now += 50; const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(now); }
  function key(code) { for (const callback of events.get('keydown') || []) callback({ code, target: get('game'), repeat: false, preventDefault() {} }); }
  async function createRun() {
    get('arcade-title-button').dispatch('click'); await settle();
    assert.equal(context.dojo.screen, 'create');
    ui.options.onCreate({ name: 'Test Karateka', gender: 'female', hairstyle: 2 }); await settle();
    assert.equal(context.dojo.screen, 'versus');
  }
  function finishMatch(winner) {
    const state = context.dojo.game.getState(); state.phase = 'matchOver'; state.winner = winner;
    state.fighters[0].wins = winner === 0 ? 2 : 0; state.fighters[1].wins = winner === 1 ? 2 : 0;
    state.fighters[0].hp = winner === 0 ? 800 : 0;
    for (let count = 0; count < 36; count++) frame();
  }
  await settle(); assert.equal(context.dojo.ready, true);
  return { context, document, get, ui, timers, createRun, finishMatch, frame, key, settle };
}

test('an intermediate Arcade victory remains playable and does not publish a resumable run', async () => {
  const f = await fixture(); await f.createRun(); f.context.dojo.startMatch(); f.finishMatch(0);
  assert.equal(f.ui.publications.length, 0);
  const result = f.ui.results.at(-1); assert.equal(result.state.wins, 1); assert.equal(result.state.finished, false); assert.equal(result.record, null);
  assert.equal(f.get('rematch-button').textContent, 'PROSSIMA SFIDA ↗');
  f.get('rematch-button').dispatch('click'); await f.settle();
  assert.equal(f.context.dojo.screen, 'versus'); assert.equal(f.ui.publications.length, 0);
  assert.match(f.get('versus-tag').textContent, /SFIDA 2\/20/);
});

test('defeat publishes the actual final run once and opens its saved leaderboard', async () => {
  const f = await fixture(); await f.createRun(); f.context.dojo.startMatch(); f.finishMatch(1);
  assert.equal(f.ui.publications.length, 1);
  const record = f.ui.publications[0]; assert.equal(record.reason, 'defeat'); assert.equal(record.name, 'Test Karateka'); assert.equal(record.matches, 1); assert.equal(record.wins, 0);
  assert.equal(f.get('leaderboard-dialog').open, true);
  assert.match(f.get('leaderboard-save-status').textContent, /automaticamente/);
  await f.ui.completePublication();
  assert.match(f.get('leaderboard-save-status').textContent, /SALVATO/);
  assert.equal(f.get('leaderboard-dialog').open, true);
  for (let i = 0; i < 3; i++) f.frame();
  assert.equal(f.ui.publications.length, 1);
  assert.equal(f.document.activeElement, f.get('leaderboard-dialog').querySelector('.close-dialog'));
});

test('20 Arcade victories automatically expose the final 10 Dan record only once', async () => {
  const f = await fixture(); await f.createRun();
  for (let match = 1; match <= 20; match++) {
    f.context.dojo.startMatch(); f.finishMatch(0);
    assert.equal(f.ui.publications.length, match === 20 ? 1 : 0);
    if (match < 20) { f.get('rematch-button').dispatch('click'); await f.settle(); }
  }
  const record = f.ui.publications[0]; assert.equal(record.completed, true); assert.equal(record.reason, 'completed'); assert.equal(record.rankIndex, 20); assert.equal(record.wins, 20);
});

test('Termina scalata from a promotion publishes only the earned result', async () => {
  const f = await fixture(); await f.createRun(); f.context.dojo.startMatch(); f.finishMatch(0);
  f.get('result-menu-button').dispatch('click');
  assert.equal(f.ui.publications.length, 1);
  const record = f.ui.publications[0]; assert.equal(record.reason, 'abandoned'); assert.equal(record.rankIndex, 1); assert.equal(record.matches, 1); assert.equal(record.completed, false);
  assert.equal(f.get('result-panel').hidden, false); assert.equal(f.get('rematch-button').textContent, 'NUOVA SCALATA ↗');
});

test('Termina scalata from pause publishes a final record without inventing a completed match', async () => {
  const f = await fixture(); await f.createRun(); f.context.dojo.startMatch(); f.get('pause-button').dispatch('click');
  assert.equal(f.get('pause-panel').hidden, false); f.get('menu-button').dispatch('click');
  const record = f.ui.publications[0]; assert.equal(record.reason, 'abandoned'); assert.equal(record.matches, 0); assert.equal(record.wins, 0);
  assert.equal(f.get('pause-panel').hidden, true); assert.equal(f.get('result-panel').hidden, false);
});

test('Escape during Arcade VS cancels the pending match and retains a reachable final result', async () => {
  const f = await fixture(); await f.createRun(); f.key('Escape');
  assert.equal(f.ui.publications.length, 1); assert.equal(f.ui.publications[0].reason, 'abandoned');
  assert.equal(f.context.dojo.screen, 'game'); assert.equal(f.get('versus-screen').hidden, true); assert.equal(f.get('result-panel').hidden, false);
  await f.ui.completePublication(); f.frame();
  assert.equal(f.document.activeElement, f.get('leaderboard-dialog').querySelector('.close-dialog'));
  for (const { callback, delay } of f.timers.values()) if (delay === 1500) callback();
  assert.equal(f.get('result-panel').hidden, false); assert.equal(f.get('leaderboard-dialog').open, true);
  assert.equal(f.ui.publications.length, 1);
});

test('moving to a new run clears the previous publication target before an old completion', async () => {
  const f = await fixture(); await f.createRun(); f.context.dojo.startMatch(); f.finishMatch(1);
  const old = f.ui.publications[0]; f.get('leaderboard-dialog').close(); f.ui.dismissLeaderboard(); f.get('rematch-button').dispatch('click'); await f.settle();
  assert.equal(f.context.dojo.screen, 'create'); assert.equal(f.ui.record, null);
  await f.ui.completePublication(old); f.frame();
  assert.equal(f.get('leaderboard-dialog').open, false); assert.equal(f.document.activeElement, f.get('arcade-name'));
});

test('ordinary matches never create an Arcade publication', async () => {
  const f = await fixture(); f.context.dojo.menu(); f.context.dojo.startMatch(); f.finishMatch(0);
  assert.equal(f.ui.publications.length, 0); assert.equal(f.get('leaderboard-dialog').open, false);
});

test('the title logo finalizes an active Arcade run and opens its automatically saved result', async () => {
  const f = await fixture(); await f.createRun(); f.context.dojo.startMatch(); f.finishMatch(0);
  f.get('rematch-button').dispatch('click'); await f.settle(); f.context.dojo.startMatch();
  f.document.querySelector('.brand').dispatch('click');
  assert.equal(f.ui.publications.length, 1);
  const record = f.ui.publications[0]; assert.equal(record.reason, 'abandoned'); assert.equal(record.rankIndex, 1); assert.equal(record.matches, 1);
  assert.equal(f.context.dojo.screen, 'game'); assert.equal(f.get('result-panel').hidden, false); assert.equal(f.get('leaderboard-dialog').open, true);
  await f.ui.completePublication(); f.frame();
  assert.match(f.get('leaderboard-save-status').textContent, /SALVATO/);
  assert.equal(f.get('leaderboard-body').children[0].children[1].textContent, record.name);
  assert.equal(f.document.activeElement, f.get('leaderboard-dialog').querySelector('.close-dialog'));
});
