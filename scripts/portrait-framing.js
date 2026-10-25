/* One camera for character cards, VS portraits and the Arcade creator. */
(function (global) {
  'use strict';
  const measured = new WeakMap();

  function bounds(source) {
    if (measured.has(source)) return measured.get(source);
    const width = source.width, height = source.height;
    const pixels = source.getContext('2d').getImageData(0, 0, width, height).data;
    let left = width, top = height, right = 0, bottom = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 100) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
    const result = right > left ? [left, top, right - left, bottom - top] : [0, 0, width, height];
    measured.set(source, result); return result;
  }

  function layout(profile, width, height, options = {}) {
    if (!(width > 0 && height > 0)) return null;
    if (options.full) {
      const [left, top, bodyWidth, bodyHeight] = profile.bounds;
      const scale = Math.min(width * .94 / bodyWidth, height * .94 / bodyHeight);
      return { scale, center: left + bodyWidth / 2, top,
        offsetY: height * .97 - bodyHeight * scale };
    }
    // Head height and a shared top line determine the camera, never transparent
    // atlas padding or stance width. Hero portraits end around the upper legs;
    // compact roster cards show the same face/shoulder crop for every fighter.
    const scale = Math.min(height * .96 / (profile.headHeight * (options.bust ? 2.6 : 4.1)),
      width * .88 / (profile.headWidth || profile.headHeight));
    return { scale, center: profile.center, top: profile.top, offsetY: height * .025 };
  }

  function draw(ctx, source, profile, x, y, width, height, options = {}) {
    const framing = layout(options.full ? { ...profile, bounds: bounds(source) } : profile, width, height, options);
    if (!framing) return false;
    const { scale, center, top, offsetY } = framing;
    const nativeFacing = profile.facing || 1;
    const facing = options.facing === 1 || options.facing === -1 ? options.facing : nativeFacing;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.translate(x + width / 2, y + offsetY);
    if (facing !== nativeFacing) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const image = global.GiBranding?.forFacing(source, facing === nativeFacing ? 1 : -1) || source;
    ctx.drawImage(image, -center * scale, -top * scale, source.width * scale, source.height * scale);
    ctx.restore(); return true;
  }

  global.FighterPortraits = { draw, layout, bounds };
})(typeof window !== 'undefined' ? window : globalThis);
