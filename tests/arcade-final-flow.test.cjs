'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real controller, engine and run progression through their public
// event surfaces. Real ArcadeUI methods run against a minimal DOM; only visual
// construction, rendering/audio, and the asynchronous network port are inert.
// The real online session stays off throughout these offline Arcade flows.
async function fixture(options = {}) {
  const elements = new Map(), selectors = new Map(), nodes = [], events = new Map(), frames = new Map(), timers = new Map();
  let serial = 0, now = 0, ui, online;
  const work = { draws: 0, hudWrites: [], audioUpdates: 0, imageLoads: [] };
  const hudNode = /^(?:p[12]-(?:health|ghost|ki|rounds|ki-label|combo(?:-count|-moves|-damage)?)|timer|round-label|announcer)$/;
  const mutation = (item, field) => { if (hudNode.test(item.id || '')) work.hudWrites.push(item.id + ':' + field); };
  const drawing = new Set(['drawImage', 'fillRect', 'clearRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText']);
  const context2d = new Proxy({}, { get: (target, key) => key in target ? target[key] : (...args) => { if (drawing.has(key)) work.draws++; }, set: (target, key, value) => (target[key] = value, true) });
  const document = { hidden: false, activeElement: null, baseURI: 'http://127.0.0.1:8765/Gioca.html' };
  function node(tag = 'div') {
    const listeners = new Map(), children = [], classes = new Set(), attributes = new Map(), subnodes = new Map();
    let content = '';
    const item = { tagName: tag.toUpperCase(), get textContent() { return content; }, set textContent(value) { content = String(value); mutation(item, 'textContent'); }, dataset: {},
      style: new Proxy({ setProperty() {} }, { set(target, key, value) { mutation(item, 'style.' + key); target[key] = value; return true; } }), children, childNodes: children,
      hidden: false, disabled: false, inert: false, open: false, value: 'normal', width: 800, height: 600,
      classList: { add: (...names) => { mutation(item, 'classList.add'); names.forEach(name => classes.add(name)); }, remove: (...names) => { mutation(item, 'classList.remove'); names.forEach(name => classes.delete(name)); }, contains: name => classes.has(name), toggle(name, enabled) { mutation(item, 'classList.toggle'); enabled = enabled ?? !classes.has(name); enabled ? classes.add(name) : classes.delete(name); return enabled; } },
      setAttribute(name, value) { mutation(item, 'attribute.' + name); attributes.set(name, String(value)); }, getAttribute: name => attributes.get(name),
      append(...items) { mutation(item, 'append'); children.push(...items); }, replaceChildren(...items) { mutation(item, 'replaceChildren'); children.splice(0, children.length, ...items); },
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
    setInterval(callback, delay) { const id = ++serial; timers.set(id, { callback, delay, repeat: true }); return id; }, clearInterval: id => timers.delete(id),
    Image: class { complete = true; naturalWidth = 1280; decode() {
      work.imageLoads.push(this.src);
      if (options.stageFailures?.has(this.src)) return Promise.reject(new Error('Stage unavailable'));
      return options.stageGate?.(this.src) || Promise.resolve();
    } },
    __kyokushinAsset: value => value,
    DojoAudio: class { enabled = false; status = {}; init() { return Promise.resolve(); } effect() {} update() { work.audioUpdates++; } },
    DojoControls: class { clear() {} press() {} release() {} },
    DojoDisplay: class { requested = false; hostManaged = false; toggle() {} open() {} },
    DojoOrientation: { resolve: () => ({ width: 1280, height: 720, logicalWidth: 1280, logicalHeight: 720, left: 0, top: 0, blocked: false, virtual: false }) },
    FighterArt: { load: async () => {}, loadFighters: async () => {}, drawSelectionPortrait() {}, drawPortrait() {}, draw() {} },
    ArcadeArt: { load: async () => {}, setCharacter() {} }, DojoLeaderboard: leaderboard,
    DojoOnlineUI: class { hide() {} hideResult() {} renderPreviews() {} },
  };
  if (options.assetsReady) browser.__kyokushinAssetsReady = options.assetsReady;
  const context = vm.createContext(browser); context.window = context; context.self = context; context.top = context; context.parent = context;
  if (options.stages) vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/stages.js'), 'utf8'), context, { filename: 'stages.js' });
  for (const file of ['app-mode.js', 'roster.js', 'game.js', 'arcade.js', 'arcade-ui.js', 'online-session.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts', file), 'utf8'), context, { filename: file });
  const OnlineSession = context.DojoOnlineSession;
  context.DojoOnlineSession = function(options) { online = new OnlineSession(options); return online; };
  const ArcadeUI = context.ArcadeUI;
  context.ArcadeUI = function(options) {
    ui = Object.create(ArcadeUI.prototype);
    Object.assign(ui, { options, appearance: { name: '', gender: 'male', hairstyle: 0 }, ready: false, onFinalLeaderboard: options.onFinalLeaderboard, finalSaves: new Map(), leaderboardVersion: 0, results: [], publications });
    ui.showResult = function(state, record) { ui.results.push({ state, record }); return ArcadeUI.prototype.showResult.call(ui, state, record); };
    ui.completePublication = async function(record = ui.record) { requests.get(record?.id)?.(); await settle(); };
    return ui;
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/main.js'), 'utf8'), context, { filename: 'main.js' });
  async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
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
  await settle(); if (options.expectReady !== false) assert.equal(context.dojo.ready, true);
  function resetWork() { work.draws = 0; work.hudWrites.length = 0; work.audioUpdates = 0; }
  return { context, document, get, ui, online, timers, createRun, finishMatch, frame, key, settle, work, resetWork };
}

test('a selected arena loads only before the match and remains unchanged for its rematch', async () => {
  const f = await fixture({ stages: true });
  assert.deepEqual(f.work.imageLoads, ['assets/dojo-mirror.png']);
  f.context.dojo.menu();
  f.get('stage-select').value = 'parco-gioeni'; f.get('stage-select').dispatch('change');
  assert.equal(f.context.dojo.config.stageId, 'parco-gioeni');
  assert.equal(f.work.imageLoads.length, 1, 'browsing a choice should not download every arena');
  await f.context.dojo.start();
  assert.equal(f.context.dojo.stage.id, 'parco-gioeni');
  assert.equal(f.get('versus-stage').textContent, 'Parco Gioeni · Catania');
  assert.equal(f.get('stage-name').textContent, 'PARCO GIOENI');
  f.context.dojo.startMatch(); f.finishMatch(0);
  f.get('rematch-button').dispatch('click'); await f.settle();
  assert.equal(f.context.dojo.stage.id, 'parco-gioeni');
  assert.equal(f.work.imageLoads.length, 2, 'the rematch uses the decoded image already in memory');
});

test('a random local match keeps its arena on rematch but choosing a new fight advances the bag', async () => {
  const f = await fixture({ stages: true });
  f.context.dojo.menu(); f.get('stage-select').value = 'random'; f.get('stage-select').dispatch('change');
  await f.context.dojo.start();
  const first = f.context.dojo.stage.id;
  f.context.dojo.startMatch(); f.finishMatch(0);
  f.get('rematch-button').dispatch('click'); await f.settle();
  assert.equal(f.context.dojo.stage.id, first);
  f.context.dojo.menu(); await f.context.dojo.start();
  assert.notEqual(f.context.dojo.stage.id, first);
  assert.equal(f.context.dojo.config.stageId, 'random');
});

test('Arcade visits every arena in six encounters and restores the selected local arena on exit', async () => {
  const f = await fixture({ stages: true });
  f.context.dojo.menu(); f.get('stage-select').value = 'rifugio-gualberto'; f.get('stage-select').dispatch('change');
  await f.createRun();
  const visited = [];
  for (let fight = 0; fight < 6; fight++) {
    visited.push(f.context.dojo.stage.id);
    f.context.dojo.startMatch();
    for (let count = 0; count < 10; count++) f.frame();
    assert.equal(f.context.dojo.stage.id, visited.at(-1), 'simulation frames must not change the arena');
    f.finishMatch(0);
    if (fight < 5) { f.get('rematch-button').dispatch('click'); await f.settle(); }
  }
  assert.equal(new Set(visited).size, 6);
  f.get('result-menu-button').dispatch('click'); // End the ongoing climb.
  f.get('result-menu-button').dispatch('click'); // Return to character selection.
  assert.equal(f.context.dojo.screen, 'select');
  assert.equal(f.context.dojo.config.stageId, 'rifugio-gualberto');
  assert.equal(f.get('stage-select').value, 'rifugio-gualberto');
});

test('leaving selection during an arena download cannot apply a stale arena later', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture({ stages: true, stageGate: src => src.includes('parco-gioeni') ? gate : null });
  f.context.dojo.menu(); f.get('stage-select').value = 'parco-gioeni'; f.get('stage-select').dispatch('change');
  const pending = f.context.dojo.start();
  f.context.dojo.title(); release(); await pending;
  assert.equal(f.context.dojo.screen, 'title');
  assert.equal(f.context.dojo.stage.id, 'dojo');
});

test('a failed arena image still opens a playable match in the dojo with a visible explanation', async () => {
  const f = await fixture({ stages: true, stageFailures: new Set(['assets/stages/parco-gioeni.webp']) });
  f.context.dojo.menu(); f.get('stage-select').value = 'parco-gioeni'; f.get('stage-select').dispatch('change');
  await f.context.dojo.start();
  assert.equal(f.context.dojo.screen, 'versus');
  assert.equal(f.context.dojo.stage.id, 'dojo');
  assert.equal(f.get('stage-load-note').hidden, false);
  assert.match(f.get('stage-load-note').textContent, /Bodyplanet Dojo/);
  f.context.dojo.startMatch();
  assert.equal(f.context.dojo.active, true);
});

test('idle title, selection and Arcade creation do not redraw the hidden arena or rewrite its HUD', async () => {
  const f = await fixture();
  for (const [screen, enter] of [
    ['title', () => {}], ['select', () => f.context.dojo.menu()], ['create', () => f.get('arcade-title-button').dispatch('click')],
  ]) {
    enter(); await f.settle(); f.frame(); f.resetWork();
    for (let count = 0; count < 6; count++) f.frame();
    assert.equal(f.context.dojo.screen, screen);
    assert.equal(f.work.draws, 0, screen + ' must not paint an arena hidden behind its menu');
    assert.deepEqual(f.work.hudWrites, [], screen + ' must not rewrite hidden health, timer or combo displays');
    assert.equal(f.work.audioUpdates, 6, 'audio scene state still updates');
  }
});

test('combat keeps rendering and advancing after pause without rewriting an unchanged HUD', async () => {
  const f = await fixture(); f.context.dojo.config.mode = 'versus'; f.context.dojo.startMatch();
  for (let count = 0; count < 40; count++) f.frame();
  assert.equal(f.context.dojo.game.getState().phase, 'fight');
  f.get('pause-button').dispatch('click'); f.frame(); f.resetWork();
  const timer = f.context.dojo.game.getState().timer;
  for (let count = 0; count < 6; count++) f.frame();
  assert.ok(f.work.draws > 0, 'the visible paused arena remains drawn');
  assert.deepEqual(f.work.hudWrites, [], 'paused values must cause no repeated DOM writes');
  assert.equal(f.context.dojo.game.getState().timer, timer);
  f.get('resume-button').dispatch('click'); f.resetWork();
  for (let count = 0; count < 6; count++) f.frame();
  assert.ok(f.context.dojo.game.getState().timer < timer, 'resuming must keep the real combat clock advancing');
  assert.ok(f.work.draws > 0);
});

test('health and Spirit updates skip imperceptible precision changes while preserving displayed values', async () => {
  const f = await fixture(); f.context.dojo.startMatch(); f.get('pause-button').dispatch('click');
  const fighter = f.context.dojo.game.getState().fighters[0];
  fighter.hp = fighter.maxHp * .8326; fighter.ki = 30.1234; f.frame();
  assert.equal(f.get('p1-health').style.width, '83.3%');
  assert.equal(f.get('p1-ghost').style.width, '83.3%');
  assert.equal(f.get('p1-ki').style.width, '30.1%');
  f.resetWork(); fighter.hp = fighter.maxHp * .83261; fighter.ki = 30.124; f.frame();
  assert.deepEqual(f.work.hudWrites, []);
  fighter.hp = fighter.maxHp * .827; fighter.ki = 31.4; f.frame();
  assert.equal(f.get('p1-health').style.width, '82.7%'); assert.equal(f.get('p1-ki').style.width, '31.4%');
});

test('a hidden page skips arena, HUD and help drawings while maintaining audio state', async () => {
  const f = await fixture(); f.context.dojo.startMatch(); f.frame();
  f.get('help-dialog').showModal(); f.document.hidden = true; f.resetWork();
  for (let count = 0; count < 6; count++) f.frame();
  assert.equal(f.work.draws, 0); assert.deepEqual(f.work.hudWrites, []); assert.equal(f.work.audioUpdates, 6);
  f.document.hidden = false; f.get('help-dialog').close(); f.frame();
  assert.ok(f.work.draws > 0, 'the arena must reappear after returning to the page');
});

test('suppressing hidden graphics still pumps the online session on every frame', async () => {
  const f = await fixture(); let ticks = 0, elapsed = 0;
  f.context.dojo.startMatch(); f.online.phase = 'playing';
  f.online.engine = { update(dt) { ticks++; elapsed += dt; } };
  f.document.hidden = true; f.resetWork();
  for (let count = 0; count < 6; count++) f.frame();
  assert.equal(ticks, 6); assert.ok(Math.abs(elapsed - .3) < 1e-10);
  assert.equal(f.work.draws, 0); assert.deepEqual(f.work.hudWrites, []); assert.equal(f.work.audioUpdates, 6);
});

test('boot waits for the extracted core images before enabling a match', async () => {
  let release;
  const assetsReady = new Promise(resolve => { release = resolve; });
  const f = await fixture({ assetsReady, expectReady: false });
  assert.equal(f.context.dojo.ready, false); assert.equal(f.get('title-start-button').disabled, true);
  f.context.dojo.startMatch(); assert.equal(f.context.dojo.active, false);
  release(); await f.settle();
  assert.equal(f.context.dojo.ready, true); assert.equal(f.get('title-start-button').disabled, false);
  f.context.dojo.startMatch(); assert.equal(f.context.dojo.active, true);
});

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
