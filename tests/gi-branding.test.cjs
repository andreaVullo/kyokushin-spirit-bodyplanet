'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const context = { URL, document: { currentScript: { src: 'file:///game/scripts/gi-branding.js' } } }; context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/gi-branding.js'), 'utf8'), context);
const branding = context.GiBranding;
function fixture() {
  const width = 180, height = 300, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 5; y < 295; y++) for (let x = 20; x < 160; x++) data.set([220 - Math.round(y / 12), 228 - Math.round(y / 12), 236 - Math.round(y / 12), 255], (y * width + x) * 4);
  return { data, width, height };
}
function rectangle(f, x, y, w, h, color) { for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) f.data.set(color, (row * f.width + col) * 4); }
function glyph(f, x = 100, y = 85) {
  rectangle(f, x + 3, y, 3, 30, [15, 18, 20, 255]);
  for (const dy of [1, 6, 11, 17, 23, 27]) rectangle(f, x, y + dy, 10, 2, [15, 18, 20, 255]);
}
const detect = (f, options = {}) => branding.detect(f.data, f.width, f.height, { nominal: 300, ...options });

test('isolated vertical chest calligraphy is found while collar, hair and belt remain excluded', () => {
  const f = fixture(); glyph(f);
  rectangle(f, 60, 5, 45, 40, [20, 20, 20, 255]);
  rectangle(f, 60, 50, 3, 80, [20, 20, 20, 255]);
  rectangle(f, 40, 170, 100, 10, [20, 20, 20, 255]);
  const result = detect(f);
  assert.equal(result.status, 'detected'); assert.deepEqual(Array.from(result.bounds), [100, 85, 10, 30]);
});

test('blank back-facing cloth and short fold segments never acquire a new emblem', () => {
  const f = fixture(); assert.equal(detect(f).status, 'absent');
  rectangle(f, 80, 90, 5, 12, [25, 25, 25, 255]);
  assert.equal(detect(f).status, 'absent');
});

test('head hint excludes ink above the neck and lower labels are not chest marks', () => {
  const f = fixture(); glyph(f, 100, 85);
  assert.equal(detect(f, { head: [100, 120] }).status, 'absent');
  const lower = fixture(); glyph(lower, 100, 220); assert.equal(detect(lower).status, 'absent');
});

test('two plausible emblems are ambiguous instead of silently choosing a fold', () => {
  const f = fixture(); glyph(f, 55); glyph(f, 105);
  assert.equal(detect(f).status, 'ambiguous');
});

test('a measured box resolves ambiguity and can explicitly add a logo to blank front cloth', () => {
  const f = fixture(); glyph(f, 55); glyph(f, 105);
  assert.deepEqual(Array.from(detect(f, { emblem: [55, 85, 10, 30] }).bounds), [55, 85, 10, 30]);
  const blank = fixture(); assert.equal(detect(blank, { emblem: [55, 85, 10, 30] }).status, 'absent');
  assert.equal(detect(blank, { emblem: [55, 85, 10, 30], add: true }).status, 'detected');
  assert.equal(detect(blank, { emblem: [0, 0, 10, 30], add: true }).status, 'unsafe-hint');
  assert.equal(detect(blank, { emblem: [55, 85, -10, 30], add: true }).status, 'invalid-hint');
});

test('dense ink with a cloth surround is safe but a measured box over skin is rejected', () => {
  const dense = fixture(); rectangle(dense, 55, 85, 10, 30, [15, 18, 20, 255]);
  assert.equal(detect(dense, { emblem: [55, 85, 10, 30] }).status, 'detected');
  const skin = fixture(); rectangle(skin, 55, 85, 10, 30, [229, 148, 93, 255]);
  rectangle(skin, 55, 85, 2, 15, [15, 18, 20, 255]);
  assert.equal(detect(skin, { emblem: [55, 85, 10, 30], add: true }).status, 'unsafe-hint');
});

test('restoration preserves alpha and every cloth pixel outside the original stroke mask', () => {
  const f = fixture(); glyph(f); const before = new Uint8ClampedArray(f.data), detection = detect(f);
  const restored = branding.restoreInk(f.data, f.width, f.height, detection);
  let changed = 0;
  for (let i = 0; i < f.width * f.height; i++) {
    assert.equal(restored.data[i * 4 + 3], before[i * 4 + 3]);
    for (let c = 0; c < 3; c++) {
      if (!restored.mask[i]) assert.equal(restored.data[i * 4 + c], before[i * 4 + c]);
      else { assert.ok(restored.data[i * 4 + c] > 180); if (restored.data[i * 4 + c] !== before[i * 4 + c]) changed++; }
    }
  }
  assert.ok(changed > 100); assert.deepEqual(f.data, before, 'source pixels are immutable');
  const top = (86 * f.width + 104) * 4, bottom = (113 * f.width + 104) * 4;
  assert.ok(restored.data[top] >= restored.data[bottom], 'the original vertical cloth gradient continues through the old ink');
});

test('before asset readiness and explicitly skipped poses preserve the exact source canvas', () => {
  const canvas = {}; assert.equal(branding.apply(canvas), canvas); assert.equal(branding.apply(canvas, { skip: true }), canvas);
  assert.equal(branding.forFacing(canvas, -1), canvas);
});

test('Arcade placements use local canvas coordinates and never brand rear or covered poses', () => {
  const meta = { nominal: 222, region: [22, 14, 191, 226], head: [122, 66, 52] };
  const plain = branding.arcadeOptions('male', 0, meta), bordered = branding.arcadeOptions('male', 0, meta, 30);
  assert.equal(plain.add, false);
  assert.deepEqual(Array.from(bordered.head), [130, 82]);
  assert.deepEqual(Array.from(bordered.emblem), Array.from(plain.emblem, (v, i) => v + (i < 2 ? 30 : 0)));
  for (const index of [1, 2, 11, 14, 16, 18, 20, 21, 26, 31]) assert.equal(branding.arcadeOptions('female', index, meta).skip, true);
  assert.equal(branding.arcadeOptions('female', 0, meta).add, true);
});

test('offline envelope preserves the generated PNG byte for byte', () => {
  let actual;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/branding/kyokushin-kanji.js'), 'utf8'), { window: { __kyokushinRegisterBranding: (key, value) => { assert.equal(key, 'kyokushin-kanji'); actual = Buffer.from(value.split(',')[1], 'base64'); } } });
  assert.deepEqual(actual, fs.readFileSync(path.join(__dirname, '../assets/branding/kyokushin-kanji.png')));
});

test('Maurizio plain Goju-ryu gi and Gabriele casual clothing keep their original artwork', () => {
 for (const assetId of ['12-maurizio-zappala','16-gabriele-di-paola'])
 for (const category of ['base','pugni','calci','movimento','difesa'])
  for (let index=0;index<(category==='base'?12:16);index++)
   assert.equal(branding.namedOptions(assetId,category,index,300).skip,true);
});
