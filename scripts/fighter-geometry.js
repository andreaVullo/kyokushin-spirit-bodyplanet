/* Shared silhouette measurements. Poses keep one scale per sheet; only the
 * floor/support origin changes, so bent knees and raised legs stay intact. */
(function (global) {
  'use strict';
  const measured = new WeakMap();
  const columns = new WeakMap();

  function measure(source, pixels) {
    if (measured.has(source)) return measured.get(source);
    const width = source.width, height = source.height;
    const rgba = pixels || source.getContext('2d').getImageData(0, 0, width, height).data;
    const tops = new Int32Array(width).fill(height), bottoms = new Int32Array(width);
    let left = width, top = height, right = 0, bottom = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 100) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      tops[x] = Math.min(tops[x], y); bottoms[x] = Math.max(bottoms[x], y + 1);
    }
    if (right <= left) return null;
    // The two soles need not be on the same raster row. A narrow final-row
    // measurement can switch from one foot to the other during a walk, moving
    // the whole sprite sideways even while the engine position stays still.
    let feetLeft = right, feetRight = left;
    const footTop = Math.max(top, bottom - Math.max(5, Math.ceil((bottom - top) * .20)));
    for (let y = footTop; y < bottom; y++) for (let x = left; x < right; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 100) continue;
      feetLeft = Math.min(feetLeft, x); feetRight = Math.max(feetRight, x + 1);
    }
    const result = { bounds: [left, top, right - left, bottom - top], floor: bottom,
      stance: (feetLeft + feetRight) / 2 };
    measured.set(source, result);
    columns.set(source, { tops, bottoms });
    return result;
  }

  // Exact support of the opaque silhouette after rotation. Column extrema are
  // enough for a linear transform and avoid rescanning pixels every frame.
  function support(source, { anchorX = 0, anchorY = 0, scaleX = 1, scaleY = 1, angle = 0, pivotY = 0 } = {}) {
    if (!measure(source)) return 0;
    const { tops, bottoms } = columns.get(source), sin = Math.sin(angle), cos = Math.cos(angle);
    let floor = -Infinity;
    for (let x = 0; x < tops.length; x++) {
      if (bottoms[x] <= tops[x]) continue;
      const px = (x + (sin * scaleX >= 0 ? 1 : 0) - anchorX) * scaleX;
      const py = ((cos * scaleY >= 0 ? bottoms[x] : tops[x]) - anchorY) * scaleY - pivotY;
      floor = Math.max(floor, px * sin + py * cos + pivotY);
    }
    return floor;
  }

  function region(original, source, options = {}) {
    const geometry = measure(source);
    if (!geometry) return original;
    const result = Array.from(original);
    // Single-leg checks, kicks, inversions and airborne poses use their authored
    // horizontal support point. Only two-foot stances request the wider measure.
    if (options.centerFeet) result[4] = result[0] + geometry.stance;
    if (options.floor !== false) result[5] = result[1] + geometry.floor;
    return result;
  }

  global.FighterGeometry = { measure, region, support };
})(typeof window !== 'undefined' ? window : globalThis);
