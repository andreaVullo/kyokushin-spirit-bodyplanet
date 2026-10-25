/* Locate a visible fist/foot on the intact sprite, then use the renderer's
   scale, anchor, facing and (for kaiten) rotation to place its short trail. */
(function (global) {
  'use strict';
  const silhouettes = new WeakMap();
  function edges(source) {
    if (silhouettes.has(source)) return silhouettes.get(source);
    const { width, height } = source;
    const rgba = source.getContext('2d').getImageData(0, 0, width, height).data;
    const skin = [], outline = [];
    for (let y = 0; y < height; y += 2) {
      let edge = -1, hand = -1;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (rgba[i + 3] < 180) continue;
        edge = x;
        if (rgba[i] > 75 && rgba[i] > rgba[i + 1] * 1.08 && rgba[i + 1] > rgba[i + 2] * 1.06) hand = x;
      }
      if (edge >= 0) outline.push([edge, y]);
      if (hand >= 0) skin.push([hand, y]);
    }
    const result = { skin, outline }; silhouettes.set(source, result); return result;
  }
  function point(f, source, geometry, transform = {}) {
    const def = global.KyokushinMoves?.[f.move];
    if (!source || !def) return null;
    const size = f.scale ?? 1, { x, y, scale } = geometry;
    const angle = transform.angle || 0, pivot = transform.pivot || 0, lift = transform.lift || 0;
    const cos = Math.cos(angle), sin = Math.sin(angle), samples = edges(source);
    const kick = ['gedan', 'mae', 'mawashi', 'ushiro', 'kaiten'].includes(f.move), risingPunch = f.move === 'shita';
    function choose(list) {
      let best = null, score = -Infinity;
      for (const [sx, sy] of list) {
        const px = x + sx * scale, py = y + sy * scale - pivot;
        const lx = px * cos - py * sin, ly = px * sin + py * cos + pivot - lift;
        const offset = Math.abs(ly + def.height * size);
        // Generated kick poses vary in leg height: their forward foot wins
        // over the gameplay hitbox height, excluding the planted support foot.
        if (lx < 8 * size || (kick ? ly > -15 * size || ly < -280 * size : offset > (risingPunch ? 95 : 55) * size)) continue;
        const value = lx - offset * (kick || risingPunch ? .05 : .6);
        if (value > score) { score = value; best = { x: f.x + lx * f.facing, y: f.y + ly }; }
      }
      return best;
    }
    return choose(samples.skin) || choose(samples.outline);
  }
  global.FighterStrikePoint = { point };
})(window);
