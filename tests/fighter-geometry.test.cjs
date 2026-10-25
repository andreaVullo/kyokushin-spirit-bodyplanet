'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const scope = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/fighter-geometry.js'), 'utf8'), scope);
const geometry = scope.FighterGeometry;

function silhouette({ padding = 0, liftedFoot = false } = {}) {
  const width = 100 + padding * 2, height = 120 + padding * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  const fill = (x, y, w, h) => {
    for (let py = y + padding; py < y + h + padding; py++) for (let px = x + padding; px < x + w + padding; px++) {
      data[(py * width + px) * 4 + 3] = 255;
    }
  };
  fill(35, 10, 30, 82); // Torso/head.
  fill(10, 95, 20, 15); // Lower foot.
  fill(70, liftedFoot ? 88 : 95, 20, 15); // Slightly higher foot.
  let reads = 0;
  return { width, height, get reads() { return reads; },
    getContext: () => ({ getImageData() { reads++; return { data }; } }) };
}

test('a foot a few pixels above the other cannot shift the two-foot origin to one side', () => {
  const even = geometry.measure(silhouette());
  const uneven = geometry.measure(silhouette({ liftedFoot: true }));
  assert.equal(even.stance, 50);
  assert.equal(uneven.stance, 50);
  assert.equal(even.floor, 110);
  assert.equal(uneven.floor, 110);
});

test('alpha padding changes source coordinates but not the rendered stance, size or floor', () => {
  const a = silhouette(), b = silhouette({ padding: 12 });
  const ar = geometry.region([100, 200, a.width, a.height, 150, 310], a, { centerFeet: true });
  const br = geometry.region([100, 200, b.width, b.height, 150, 310], b, { centerFeet: true });
  const ab = geometry.measure(a).bounds, bb = geometry.measure(b).bounds;
  assert.equal(ab[2], bb[2]); assert.equal(ab[3], bb[3]);
  assert.equal(ar[0] - ar[4] + ab[0], br[0] - br[4] + bb[0]);
  assert.equal(ar[1] - ar[5] + ab[1] + ab[3], 0);
  assert.equal(br[1] - br[5] + bb[1] + bb[3], 0);
  assert.equal(a.reads, 1); assert.equal(b.reads, 1);
});

test('single-leg and airborne poses preserve their authored support and lift', () => {
  const source = silhouette();
  const region = [40, 30, 100, 120, 62, 170];
  assert.equal(geometry.region(region, source)[4], 62);
  assert.equal(geometry.region(region, source)[5], 140);
  const airborne = geometry.region(region, source, { floor: false });
  assert.deepEqual(Array.from(airborne), region);
});

test('rotated support follows opaque soles and torso, independently of transparent padding', () => {
  const source = silhouette({ liftedFoot: true }), padded = silhouette({ padding: 12, liftedFoot: true });
  const data = source.getContext().getImageData().data;
  for (const angle of [0, .24, -1.36, Math.PI / 2, 2.8]) {
    const transform = { anchorX: 50, anchorY: 110, scaleX: 1.05, scaleY: .96, angle, pivotY: -42 };
    let expected = -Infinity;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] < 100) continue;
      for (const dx of [0, 1]) for (const dy of [0, 1]) {
        const px = (x + dx - 50) * 1.05, py = (y + dy - 110) * .96 + 42;
        expected = Math.max(expected, px * Math.sin(angle) + py * Math.cos(angle) - 42);
      }
    }
    assert.ok(Math.abs(geometry.support(source, transform) - expected) < 1e-9);
    assert.ok(Math.abs(geometry.support(padded, { ...transform, anchorX: 62, anchorY: 122 }) - expected) < 1e-9);
  }
  assert.equal(source.reads, 2, 'all rotations share one cached pixel measurement');
  assert.equal(padded.reads, 1);
});
