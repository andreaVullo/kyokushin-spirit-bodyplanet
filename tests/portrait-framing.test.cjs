'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scope = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/portrait-framing.js'), 'utf8'), scope);
const camera = scope.FighterPortraits;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} ≈ ${expected}`);

test('original, roster and padded Arcade portraits share head scale and top at every presentation size', () => {
  const profiles = [
    { center: 355, top: 7, headHeight: 222, headWidth: 184 },
    { center: 145, top: 2, headHeight: 68, headWidth: 68 },
    { center: 130, top: 28, headHeight: 44.2, headWidth: 46.8 },
    { center: 130, top: 28, headHeight: 41.65, headWidth: 46.8 },
  ];
  for (const [width, height] of [[600, 640], [300, 260], [150, 130], [180, 360]]) {
    for (const bust of [false, true]) {
      const layouts = profiles.map(profile => camera.layout(profile, width, height, { bust }));
      for (let i = 0; i < profiles.length; i++) {
        close(profiles[i].headHeight * layouts[i].scale, profiles[0].headHeight * layouts[0].scale);
        close(layouts[i].offsetY, height * .025);
      }
    }
  }
});

test('transparent padding cannot shrink or move the full-body creator preview', () => {
  const original = camera.layout({ bounds: [5, 8, 180, 220] }, 320, 400, { full: true });
  const padded = camera.layout({ bounds: [35, 38, 180, 220] }, 320, 400, { full: true });
  close(original.scale, padded.scale);
  close(original.offsetY, padded.offsetY);
  close(original.offsetY + 220 * original.scale, 400 * .97);
  close(padded.center - original.center, 30);
  close(padded.top - original.top, 30);
});

test('full preview measures occupied alpha once and ignores transparent canvas borders', () => {
  const data = new Uint8ClampedArray(12 * 15 * 4);
  for (let y = 4; y < 12; y++) for (let x = 3; x < 9; x++) data[(y * 12 + x) * 4 + 3] = 255;
  let reads = 0;
  const source = { width: 12, height: 15, getContext: () => ({ getImageData() { reads++; return { data }; } }) };
  assert.deepEqual(Array.from(camera.bounds(source)), [3, 4, 6, 8]);
  camera.bounds(source); assert.equal(reads, 1);
});

test('facing requests mirror around the same portrait center and preserve clipping', () => {
  for (const native of [-1, 1]) for (const facing of [-1, 1]) {
    const calls = [], ctx = Object.fromEntries(['save', 'beginPath', 'rect', 'clip', 'translate', 'scale', 'drawImage', 'restore']
      .map(method => [method, (...args) => calls.push([method, ...args])]));
    const source = { width: 300, height: 400 }, profile = { center: 130, top: 7, headHeight: 65, facing: native };
    camera.draw(ctx, source, profile, 20, 30, 300, 320, { facing });
    assert.deepEqual(calls.find(c => c[0] === 'rect'), ['rect', 20, 30, 300, 320]);
    assert.deepEqual(calls.find(c => c[0] === 'translate'), ['translate', 170, 38]);
    assert.equal(calls.some(c => c[0] === 'scale'), facing !== native);
    const draw = calls.find(c => c[0] === 'drawImage');
    close(draw[2] / (draw[4] / 300), -130);
  }
});

test('all shipped renderer entry points load the common portrait camera before adapters', () => {
  for (const filename of ['Gioca.html', 'Sprite-Arcade.html', 'tests/arcade-art-preview.html', 'tests/render-preview.html']) {
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    const helper = html.indexOf('src="' + (filename.startsWith('tests/') ? '../' : '') + 'scripts/portrait-framing.js');
    assert.ok(helper > 0, filename);
    const adapter = html.search(/src="(?:\.\.\/)?scripts\/(?:karateka|arcade)-art\.js/);
    assert.ok(helper < adapter, filename + ' camera loads first');
  }
});
