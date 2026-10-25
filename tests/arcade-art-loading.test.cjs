'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/arcade-art.js'), 'utf8');

function harness(protocol = 'https:') {
  const requests = [], scripts = [], failures = new Set();
  const stats = { reads: 0, yields: 0 };
  let context;
  function canvas() {
    const surface = { width: 0, height: 0, data: null };
    const pixels = () => surface.data || new Uint8ClampedArray(surface.width * surface.height * 4);
    const drawing = {
      drawImage(image) {
        if (image.data && image.data.length === surface.width * surface.height * 4) surface.data = image.data.slice();
      },
      getImageData() { stats.reads++; return { data: pixels().slice() }; },
      createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData(image) { surface.data = image.data.slice(); },
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    };
    surface.getContext = () => drawing;
    return surface;
  }
  class FakeImage {
    set src(url) {
      requests.push(url);
      this.naturalWidth = this.naturalHeight = 4;
      this.data = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < this.data.length; i += 4) this.data.set([0, 170, 170, 255], i);
      queueMicrotask(() => failures.delete(url) ? this.onerror() : this.onload());
    }
  }
  const frame = sheet => ({ sheet, component: 1, region: [0, 0, 4, 4], bounds: [0, 0, 4, 4], anchor: [2, 4], head: [2, 2, 1], nominal: 4 });
  const document = {
    currentScript: { src: protocol + '///game/scripts/arcade-art.js' },
    createElement: tag => tag === 'canvas' ? canvas() : { remove() {} },
    head: { append(script) {
      scripts.push(script.src);
      const key = new URL(script.src).pathname.split('/').at(-1).replace('.js', '');
      queueMicrotask(() => { context.__arcadeRegisterSprite(key, 'data:image/png;base64,' + key); script.onload(); });
    } },
  };
  context = vm.createContext({ URL, document, Image: FakeImage,
    setTimeout(callback, delay) { if (!delay) { stats.yields++; queueMicrotask(callback); } return {}; }, clearTimeout() {},
    ArcadeSpriteAtlas: { male: Array.from({ length: 36 }, () => frame('male-body')),
      female: Array.from({ length: 36 }, () => frame('female-body')), heads: Array.from({ length: 20 }, () => frame('heads')) },
    FighterArt: { height: 228, load: async () => {}, loadFighters: async () => {}, draw() {}, drawSelectionPortrait() {} },
    FighterGeometry: { measure: () => ({ floor: 4 }) },
    FighterPortraits: { draw: () => true },
  });
  context.window = context;
  vm.runInContext(source, context);
  return { ...context, requests, scripts, stats, failures, drawing: canvas().getContext('2d') };
}

test('hosted Arcade and VFX use original PNGs without parsing the offline envelopes', async () => {
  const h = harness();
  await Promise.all([h.ArcadeArt.load({ gender: 'male' }), h.ArcadeVFX.load()]);
  assert.equal(h.scripts.length, 0);
  assert.equal(h.requests.length, 5);
  assert.ok(h.requests.every(url => url.startsWith('https:') && url.endsWith('.png')));
});

test('directly opened local files retain origin-clean offline sprite envelopes', async () => {
  const h = harness('file:');
  await h.ArcadeVFX.load();
  assert.equal(h.scripts.length, 1);
  assert.match(h.scripts[0], /vfx\.js$/);
  assert.equal(h.requests[0], 'data:image/png;base64,vfx');
});

test('failed direct image loads remain retryable and concurrent calls share one request', async () => {
  const h = harness();
  const url = new URL('../assets/arcade/vfx.png', 'https:///game/scripts/arcade-art.js').href;
  h.failures.add(url);
  await assert.rejects(h.ArcadeVFX.load(), /caricare/);
  await Promise.all([h.ArcadeVFX.load(), h.ArcadeVFX.load()]);
  assert.equal(h.requests.filter(value => value === url).length, 2);
  assert.equal(h.ArcadeVFX.ready, true);
});

test('match loading prepares every Arcade pose and direction before the first fight draw', async () => {
  const h = harness();
  h.ArcadeArt.setCharacter({ id: 'player', gender: 'female', hair: 2 });
  await h.FighterArt.loadFighters(['player']);
  assert.equal(h.stats.yields, 36, 'preparation yields between all poses');
  const preparedReads = h.stats.reads;
  assert.ok(preparedReads > 0);
  for (let pose = 0; pose < 36; pose++) for (const facing of [1, -1]) {
    assert.equal(h.ArcadeArt.drawPreview(h.drawing, h.ArcadeArt.getCharacter('player'), 0, 0, 100, 100, { pose, facing }), true);
  }
  assert.equal(h.stats.reads, preparedReads, 'no pixel scans or compositions during first-use rendering');
});

test('promotion cache eviction retains recently rendered poses instead of clearing them all', async () => {
  const h = harness();
  const profile = { id: 'player', gender: 'male' };
  for (let dan = 0; dan < 3; dan++) {
    h.ArcadeArt.setCharacter({ ...profile, rank: { color: '#17191f', dan } });
    await h.FighterArt.loadFighters(['player']);
  }
  const reads = h.stats.reads;
  h.ArcadeArt.setCharacter({ ...profile, rank: { color: '#17191f', dan: 2 } });
  for (let pose = 0; pose < 36; pose++) for (const facing of [1, -1]) {
    h.ArcadeArt.drawPreview(h.drawing, h.ArcadeArt.getCharacter('player'), 0, 0, 100, 100, { pose, facing });
  }
  assert.equal(h.stats.reads, reads, 'the latest belt stays warm even after several promotions');
});
