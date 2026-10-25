'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const stages = require('../scripts/stages.js');

test('stage choices include the original dojo and the five requested places', () => {
  assert.deepEqual(stages.list.map(stage => stage.id), ['dojo', 'parco-gioeni', 'rifugio-gualberto', 'spiaggia-libera-3', 'anfiteatro-turi-ferro', 'torneo-kyokushin']);
  assert.equal(stages.list.length, new Set(stages.list.map(stage => stage.src)).size);
  assert.ok(stages.list.every((stage, index) => Object.isFrozen(stage) && stage.number === index + 1));
  assert.equal(stages.get('unknown').id, 'dojo');
  for (const value of ['unknown', '__proto__', 'https://elsewhere.test/image.png', null, {}]) assert.equal(stages.isChoice(value), false);
  assert.equal(stages.isChoice('random'), true);
  assert.equal(stages.isValid('random'), false, 'random is a choice, never a stage sent to a second player');
});

test('random stages exhaust every arena once per cycle without consecutive repeats across cycles', () => {
  for (const sample of [0, .15, .5, .99]) {
    const bag = stages.createShuffleBag({ random: () => sample });
    let previous;
    for (let cycle = 0; cycle < 12; cycle++) {
      const choices = Array.from({ length: 6 }, () => bag.next());
      assert.equal(new Set(choices).size, 6);
      assert.notEqual(choices[0], previous);
      previous = choices.at(-1);
    }
  }
});

test('stage loader is lazy and concurrent loads share one image decode', async () => {
  const images = [];
  let release;
  class Image {
    naturalWidth = 1280;
    constructor() { images.push(this); }
    decode() { return new Promise(resolve => { release = resolve; }); }
  }
  const loader = stages.createLoader({ Image });
  assert.equal(images.length, 0);
  const first = loader.load('parco-gioeni'), second = loader.load('parco-gioeni');
  assert.equal(images.length, 1);
  assert.equal(images[0].src, 'assets/stages/parco-gioeni.webp');
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.image, b.image);
  assert.equal(a.stage.id, 'parco-gioeni');
  assert.equal((await loader.load('parco-gioeni')).image, a.image);
  assert.equal(images.length, 1);
});

test('a missing arena falls back to the cached dojo and can be retried later', async () => {
  const requests = [];
  let fail = true;
  class Image {
    naturalWidth = 1280;
    async decode() { requests.push(this.src); if (fail && this.src.includes('gioeni')) throw new Error('Offline'); }
  }
  const loader = stages.createLoader({ Image, resolve: stage => stage.id === 'dojo' ? 'cached-dojo.png' : stage.src });
  const dojo = await loader.load('dojo');
  const missing = await loader.load('parco-gioeni');
  assert.equal(missing.image, dojo.image);
  assert.equal(missing.fallback, true);
  assert.equal(missing.requestedId, 'parco-gioeni');
  assert.equal(missing.stage.id, 'dojo');
  fail = false;
  const recovered = await loader.load('parco-gioeni');
  assert.equal(recovered.stage.id, 'parco-gioeni');
  assert.equal(recovered.fallback, false);
  assert.deepEqual(requests, ['cached-dojo.png', 'assets/stages/parco-gioeni.webp', 'assets/stages/parco-gioeni.webp']);
});

test('invalid image data uses the dojo, while a missing dojo surfaces a loading error', async () => {
  const loader = stages.createLoader({ Image: class { naturalWidth = 0; decode() { return Promise.resolve(); } } });
  await assert.rejects(loader.load('parco-gioeni'), /arena non disponibile/);
  await assert.rejects(loader.load('dojo'), /arena non disponibile/);
});
