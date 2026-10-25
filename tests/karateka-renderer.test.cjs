'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'scripts/karateka-art.js'), 'utf8');
const categories = ['base', 'pugni', 'calci', 'movimento', 'difesa'];

// Synthetic, separated figures exercise the real cutout and draw paths without
// decoding artwork or relying on browser-specific canvas implementations.
function syntheticSheet(category) {
  const count = category === 'base' ? 12 : 16;
  const width = 336, height = category === 'base' ? 252 : 336;
  const data = new Uint8ClampedArray(width * height * 4);
  const frames = [];
  for (let index = 0; index < count; index++) {
    const x = index % 4 * 84 + 2, y = Math.floor(index / 4) * 84 + 2;
    frames.push({ index, source_sheet: category, source_frame: index,
      region: [x, y, 80, 80, x + 40, y + 80], opaque_bounds: [x, y, 80, 80] });
    for (let py = y; py < y + 80; py++) for (let px = x; px < x + 80; px++) {
      data.set([categories.indexOf(category) + 1, index + 1, 0, 255], (py * width + px) * 4);
    }
  }
  return { data, meta: { width, height, nominal_height: 80, frames } };
}

function harness() {
  const fixtures = Object.fromEntries(categories.map(category => [category, syntheticSheet(category)]));
  const requests = [], failures = new Set(), held = new Set(), waiting = new Map();
  const originalCalls = [];
  let context;
  const atlas = {};
  for (const assetId of ['01-new-a', '02-new-b']) {
    atlas[assetId] = structuredClone(Object.fromEntries(categories.map(category => [category, fixtures[category].meta])));
  }
  // Include both a within-sheet recovery alias and a victory from another sheet.
  atlas['01-new-a'].difesa.frames[11] = { ...atlas['01-new-a'].difesa.frames[0], index: 11 };
  atlas['01-new-a'].difesa.frames[15] = { ...atlas['01-new-a'].base.frames[11], index: 15 };
  class FakeImage {
    set src(source) {
      const category = source.split('/').at(-1);
      this.data = fixtures[category].data;
      this.naturalWidth = fixtures[category].meta.width;
      this.naturalHeight = fixtures[category].meta.height;
      queueMicrotask(() => this.onload());
    }
  }
  function complete(script, key) {
    if (failures.delete(key)) { script.onerror(); return; }
    context.__kyokushinRegisterSprite(key, 'fixture/' + key);
    script.onload();
  }
  const document = {
    currentScript: { src: 'file:///game/scripts/karateka-art.js' },
    head: { append(script) {
      const key = new URL(script.src).pathname.split('/assets/karateka/')[1].replace(/\.js$/, '');
      requests.push(key);
      if (held.has(key)) waiting.set(key, script);
      else queueMicrotask(() => complete(script, key));
    } },
    createElement(tag) {
      if (tag === 'script') return { remove() {} };
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0, data: null };
      const ctx = {
        drawImage(image) { canvas.data = image.data; },
        getImageData() { return { data: canvas.data }; },
        createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData(image) { canvas.data = image.data; },
      };
      canvas.getContext = () => ctx;
      return canvas;
    },
  };
  context = vm.createContext({ document, URL, Image: FakeImage, setTimeout, clearTimeout,
    KyokushinRoster: {
      'new-a': { name: 'New A', assetId: '01-new-a' },
      'new-b': { name: 'New B', assetId: '02-new-b' },
      angelo: { name: 'Angelo' },
    },
    KyokushinSpriteAtlas: atlas,
    FighterArt: {
      height: 228, ready: true, load: async () => {},
      draw(...args) { originalCalls.push(['draw', ...args]); },
      drawSelectionPortrait(...args) { originalCalls.push(['portrait', ...args]); },
    },
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'scripts/game.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'scripts/portrait-framing.js'), 'utf8'), context);
  vm.runInContext(adapterSource, context);
  return { art: context.FighterArt, moves: context.KyokushinMoves, requests, failures, held, waiting, originalCalls,
    release(key) { held.delete(key); const script = waiting.get(key); waiting.delete(key); complete(script, key); } };
}

function drawingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['save', 'restore', 'translate', 'scale', 'drawImage', 'beginPath', 'rect', 'clip']) {
    ctx[name] = (...args) => calls.push([name, ...args]);
  }
  return ctx;
}

function fighter(overrides = {}) {
  return { id: 'new-a', state: 'idle', x: 500, y: 625, facing: 1, hp: 1000, stun: 0,
    recovery: 0, walkCycle: 0, moveProgress: 0, guardFlash: 0, hitFlash: 0, ...overrides };
}

function renderedFrame(art, f, time = 0) {
  const ctx = drawingContext();
  art.draw(ctx, f, time);
  const call = ctx.calls.find(item => item[0] === 'drawImage');
  assert.ok(call, 'a loaded fighter is drawn');
  return { category: categories[call[1].data[0] - 1], index: call[1].data[1] - 1, ctx, call };
}

test('initial load fetches portraits only; concurrent identical selections fetch each animation once', async () => {
  const h = harness();
  await Promise.all([h.art.load(), h.art.load()]);
  assert.deepEqual(h.requests.sort(), ['01-new-a/base', '02-new-b/base']);
  await Promise.all([h.art.loadFighters(['new-a', 'new-a']), h.art.loadFighters(['new-a', 'angelo'])]);
  assert.equal(h.requests.length, 6);
  assert.equal(new Set(h.requests).size, 6);
});

test('a failed sheet can be retried without reloading successful sheets', async () => {
  const h = harness();
  h.failures.add('01-new-a/pugni');
  await assert.rejects(h.art.loadFighters(['new-a']), /Impossibile caricare/);
  await h.art.loadFighters(['new-a']);
  assert.equal(h.requests.filter(key => key === '01-new-a/pugni').length, 2);
  for (const category of ['base', 'calci', 'movimento', 'difesa']) {
    assert.equal(h.requests.filter(key => key === '01-new-a/' + category).length, 1);
  }
  assert.equal(renderedFrame(h.art, fighter({ state: 'attack', move: 'tsuki' })).category, 'pugni');
});

test('failed initial portrait loading can also be retried', async () => {
  const h = harness();
  h.failures.add('01-new-a/base');
  await assert.rejects(h.art.load());
  await h.art.load();
  assert.equal(h.requests.filter(key => key === '01-new-a/base').length, 2);
  assert.equal(renderedFrame(h.art, fighter()).category, 'base');
});

test('a superseded load cannot repopulate the current match cache after it was pruned', async () => {
  const h = harness();
  await h.art.load();
  h.held.add('01-new-a/pugni');
  const previousMatch = h.art.loadFighters(['new-a']);
  await new Promise(resolve => setImmediate(resolve));
  await h.art.loadFighters(['new-b']);
  h.release('01-new-a/pugni');
  await previousMatch;
  const before = h.requests.length;
  await h.art.loadFighters(['new-a']);
  assert.equal(h.requests.length - before, 4, 'all previous match animation sheets were evicted');
});

test('all nine moves show preparation, active contact, and recovery at engine timing boundaries', async () => {
  const h = harness();
  await h.art.loadFighters(['new-a']);
  const moves = {
    tsuki: ['pugni', 0], gyaku: ['pugni', 4], shita: ['pugni', 8], kagi: ['pugni', 12],
    gedan: ['calci', 0], mae: ['calci', 4], mawashi: ['calci', 8], ushiro: ['calci', 12], kaiten: ['movimento', 12],
  };
  for (const [move, [category, first]] of Object.entries(moves)) {
    const definition = h.moves[move];
    const start = definition.start / definition.duration, end = definition.end / definition.duration;
    const f = fighter({ state: 'attack', move });
    for (const [phase, progress] of [0, start * .7, (start + end) / 2, (end + 1) / 2].entries()) {
      f.moveProgress = progress;
      const rendered = renderedFrame(h.art, f, progress);
      assert.equal(rendered.category, category, move);
      assert.equal(rendered.index, first + phase, move);
    }
  }
});

test('draw preserves the measured foot anchor and mirrors around the fighter, not the atlas', async () => {
  const h = harness();
  await h.art.loadFighters(['new-a']);
  const forward = renderedFrame(h.art, fighter());
  const reverse = renderedFrame(h.art, fighter({ facing: -1, scale: .5 }));
  assert.deepEqual(forward.ctx.calls.find(call => call[0] === 'translate'), ['translate', 500, 625]);
  assert.deepEqual(forward.ctx.calls.find(call => call[0] === 'scale'), ['scale', 1, 1]);
  assert.deepEqual(reverse.ctx.calls.find(call => call[0] === 'scale'), ['scale', -1, 1]);
  assert.deepEqual(forward.call.slice(2), [-114, -228, 228, 228]);
  assert.deepEqual(reverse.call.slice(2), [-57, -114, 114, 114]);
});

test('within-sheet and cross-sheet aliases draw the intended recovery and victory', async () => {
  const h = harness();
  await h.art.loadFighters(['new-a']);
  const hurt = fighter({ state: 'hit', stun: .01 });
  renderedFrame(h.art, hurt, 0);
  const recovered = renderedFrame(h.art, hurt, .1);
  assert.equal(recovered.category, 'difesa');
  assert.equal(recovered.index, 0);
  const victory = renderedFrame(h.art, fighter({ state: 'victory' }));
  assert.equal(victory.category, 'base');
  assert.equal(victory.index, 11);
});

test('guard release and grounded knockdown choose recovery frames', async () => {
  const h = harness();
  await h.art.loadFighters(['new-a']);
  const f = fighter({ state: 'legBlock', legBlocking: true });
  assert.equal(renderedFrame(h.art, f, 0).index, 4);
  assert.equal(renderedFrame(h.art, f, .1).index, 5);
  f.state = 'idle'; f.legBlocking = false;
  assert.equal(renderedFrame(h.art, f, .12).index, 7);
  assert.equal(renderedFrame(h.art, f, .3).category, 'base');
  f.state = 'hit'; f.knockdown = true; f.recovery = .3;
  assert.equal(renderedFrame(h.art, f, .4).index, 12);
  assert.equal(renderedFrame(h.art, f, .6).index, 13);
  f.recovery = .05;
  assert.equal(renderedFrame(h.art, f, .7).index, 14);
});

test('original fighters retain their original drawing implementation', () => {
  const h = harness(), ctx = drawingContext(), f = fighter({ id: 'angelo' });
  h.art.draw(ctx, f, 3);
  h.art.drawSelectionPortrait(ctx, 'angelo', 0, 0, 100, 100);
  assert.deepEqual(h.originalCalls.map(call => call[0]), ['draw', 'portrait']);
  assert.equal(h.originalCalls[0][2], f);
});

test('the real atlas has bounded regions and resolves all aliases to retained source frames', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/karateka-atlas.js'), 'utf8'), context);
  for (const [id, sheets] of Object.entries(context.window.KyokushinSpriteAtlas)) {
    for (const [category, sheet] of Object.entries(sheets)) for (const frame of sheet.frames) {
      const label = `${id}/${category}/${frame.index}`;
      const source = sheets[frame.source_sheet];
      const sourceFrame = source?.frames[frame.source_frame];
      assert.ok(sourceFrame, `${label}: alias destination`);
      assert.equal(sourceFrame.source_sheet, frame.source_sheet, `${label}: no alias chain`);
      assert.equal(sourceFrame.source_frame, frame.source_frame, `${label}: no alias chain`);
      assert.deepEqual(Array.from(frame.region), Array.from(sourceFrame.region), `${label}: alias geometry`);
      const [x, y, width, height, ax, ay] = frame.region;
      assert.ok(x >= 0 && y >= 0 && x + width <= source.width && y + height <= source.height, `${label}: bounds`);
      assert.ok(Number.isFinite(ax) && Number.isFinite(ay), `${label}: anchor`);
      if (frame.source_sheet === 'base') assert.ok([0, 11].includes(frame.source_frame) || category === 'base', `${label}: retained base frame`);
    }
  }
});
