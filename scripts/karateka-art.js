/* Additional karateka: measured whole-body frames, with lazy offline loading. */
(function () {
  'use strict';
  const original = window.FighterArt;
  const roster = window.KyokushinRoster;
  const atlas = window.KyokushinSpriteAtlas;
  const root = new URL('../assets/karateka/', document.currentScript.src);
  const cache = new Map(), pending = new Map(), sources = new Map();
  const visualStates = new WeakMap();
  const height = original.height;
  // Measured hairline-to-chin geometry in each intact idle cutout. Full atlas
  // rectangles include a wide stance, which must not shrink faces in cards.
  const portraitHeads = {
    "10-emanuele-micalizzi": [183, 2, 75, 78],
    "11-francesco-privitera-1": [185, 2, 75, 84],
    '01-marco-tabacco-collage': [145, 2, 75, 80],
    '02-gabriele-carbonaro': [153, 2, 66, 70],
    '03-leonardo-cappellani': [150, 2, 68, 76],
    '04-gabriele-randazzo': [153, 2, 68, 68],
    '05-matteo-spata': [148, 2, 63, 74],
    '06-oscar-gueli': [145, 2, 63, 65],
    '07-marco-tabacco-foto-gruppo': [145, 2, 68, 68],
    '08-andrea-vullo': [148, 2, 67, 72],
    '09-andrea-barbagallo': [175, 2, 77, 79],
  };
  let initialLoad;
  let activeAssets = new Set();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // JavaScript envelopes keep PNGs origin-clean even when Gioca.html is opened
  // directly from disk. The original PNG bytes are not recompressed or edited.
  window.__kyokushinRegisterSprite = (key, url) => sources.set(key, url);

  function cutouts(image, meta, category, assetId) {
    const w = image.naturalWidth, h = image.naturalHeight;
    const surface = document.createElement('canvas');
    surface.width = w; surface.height = h;
    const context = surface.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, w, h).data;
    const labels = new Int32Array(w * h), queue = new Int32Array(w * h);
    const components = [];
    let label = 0, tail = 0;
    // Reuse the neighbour visitor for every pixel of this decoded sheet.
    const add = n => {
      if (!labels[n] && rgba[n * 4 + 3] >= 100) { labels[n] = label; queue[tail++] = n; }
    };
    for (let at = 0; at < labels.length; at++) {
      if (labels[at] || rgba[at * 4 + 3] < 100) continue;
      label++;
      let head = 0, left = w, top = h, right = 0, bottom = 0;
      tail = 1; queue[0] = at; labels[at] = label;
      while (head < tail) {
        const i = queue[head++], x = i % w, y = (i / w) | 0;
        left = Math.min(left, x); right = Math.max(right, x + 1);
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        if (x) add(i - 1);
        if (x + 1 < w) add(i + 1);
        if (y) add(i - w);
        if (y + 1 < h) add(i + w);
      }
      if (tail > 5000) components.push({ label, left, top, right, bottom });
    }
    const frames = meta.frames.map((frame, index) => {
      // Base is needed for the selection portrait, idle, and intact victory.
      if (category === 'base' && index !== 0 && index !== 11) return null;
      if (frame.source_sheet !== category || frame.source_frame !== index) return null;
      const [sx, sy, sw, sh] = frame.region;
      const [bx, by, bw, bh] = frame.opaque_bounds;
      const component = components.reduce((best, part) => {
        const overlap = Math.max(0, Math.min(bx + bw, part.right) - Math.max(bx, part.left)) *
          Math.max(0, Math.min(by + bh, part.bottom) - Math.max(by, part.top));
        return overlap > best.overlap ? { ...part, overlap } : best;
      }, { overlap: 0 });
      if (!component.label) throw new Error('Sagoma del karateka non disponibile');
      const canvas = document.createElement('canvas');
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(sw, sh);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const gx = sx + x, gy = sy + y, pos = gy * w + gx;
        let belongs = labels[pos] === component.label;
        if (!belongs && rgba[pos * 4 + 3] > 0) {
          belongs = (gx > 0 && labels[pos - 1] === component.label) ||
            (gx + 1 < w && labels[pos + 1] === component.label) ||
            (gy > 0 && labels[pos - w] === component.label) ||
            (gy + 1 < h && labels[pos + w] === component.label);
        }
        if (belongs) {
          const from = pos * 4, to = (y * sw + x) * 4;
          pixels.data[to] = rgba[from]; pixels.data[to + 1] = rgba[from + 1];
          pixels.data[to + 2] = rgba[from + 2]; pixels.data[to + 3] = rgba[from + 3];
        }
      }
      ctx.putImageData(pixels, 0, 0);
      const branding = window.GiBranding;
      const result = branding ? branding.apply(canvas, branding.namedOptions(assetId, category, index, meta.nominal_height)) : canvas;
      window.FighterGeometry?.measure(result, pixels.data);
      return result;
    });
    surface.width = surface.height = 0;
    return { frames, meta };
  }

  function loadSheet(assetId, category) {
    const key = assetId + '/' + category;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true; clearTimeout(timeout); script.remove(); sources.delete(key);
        reject(new Error('Impossibile caricare ' + roster[assetId.slice(3)]?.name + ': riprova.'));
      };
      const timeout = setTimeout(fail, 45000);
      script.onerror = fail;
      script.onload = () => {
        if (settled) return;
        const source = sources.get(key);
        if (!source) { fail(); return; }
        const image = new Image();
        image.onerror = fail;
        image.onload = async () => {
          if (settled) return;
          try {
            await window.GiBranding?.load();
            if (settled) return;
            const result = cutouts(image, atlas[assetId][category], category, assetId);
            cache.set(key, result);
            settled = true; clearTimeout(timeout); sources.delete(key); script.remove();
            resolve(result);
          } catch (error) { fail(); }
        };
        image.src = source;
      };
      script.src = new URL(key + '.js?v=20261025-18', root).href;
      document.head.append(script);
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  function load() {
    if (!initialLoad) initialLoad = Promise.all([
      original.load(),
      ...Object.values(roster).filter(c => c.assetId).map(c => loadSheet(c.assetId, 'base'))
    ]).catch(error => { initialLoad = null; throw error; });
    return initialLoad;
  }

  async function loadFighters(ids) {
    const assets = new Set(ids.map(id => roster[id]?.assetId).filter(Boolean));
    activeAssets = assets;
    try {
      await load();
      await Promise.all([...assets].flatMap(id => ['pugni', 'calci', 'movimento', 'difesa'].map(type => loadSheet(id, type))));
    } finally {
      // A superseded request can finish after a newer one: always evict against
      // the most recently requested match, never against this request's pair.
      for (const key of cache.keys()) {
        if (!key.endsWith('/base') && !activeAssets.has(key.split('/')[0])) cache.delete(key);
      }
    }
  }

  function resolvedFrame(assetId, category, index) {
    const frame = atlas[assetId]?.[category]?.frames[index];
    if (!frame) return null;
    const sheet = cache.get(assetId + '/' + frame.source_sheet);
    const source = sheet?.frames[frame.source_frame];
    if (!source) return null;
    const sheetType = frame.source_sheet, sourceIndex = frame.source_frame;
    const centerFeet = sheetType === 'pugni' || sheetType === 'base' ||
      (sheetType === 'movimento' && sourceIndex < 8) ||
      (sheetType === 'difesa' && (sourceIndex < 4 || (sourceIndex >= 8 && sourceIndex <= 11) || sourceIndex === 15));
    const region = window.FighterGeometry?.region(frame.region, source, { centerFeet }) || frame.region;
    // Use the actual idle silhouette as the reference: transparent padding and
    // another pose's raised hair/hand must not change a fighter's standing size.
    const nominal = sheetType === 'base'
      ? window.FighterGeometry?.measure(sheet.frames[0])?.bounds[3] || sheet.meta.nominal_height
      : sheet.meta.nominal_height;
    return { frame: { ...frame, region }, source, scale: height / nominal };
  }

  function attackPhase(f) {
    const def = window.KyokushinMoves[f.move];
    if (!def) return 0;
    const p = clamp(f.moveProgress || 0, 0, 1);
    const start = def.start / def.duration, end = def.end / def.duration;
    return p < start * .42 ? 0 : p < start ? 1 : p <= end ? 2 : 3;
  }

  function pose(f, time, state) {
    const elapsed = time - state.since;
    if (f.state === 'victory') return ['difesa', 15];
    if (f.state === 'ko' || f.knockdown) {
      if (f.airborne || elapsed < .16) return ['difesa', 12];
      return ['difesa', f.hp > 0 && f.recovery < .12 && f.stun <= 0 ? 14 : 13];
    }
    if (f.state === 'attack') {
      const index = attackPhase(f);
      const punch = ['tsuki', 'gyaku', 'shita', 'kagi'].indexOf(f.move);
      if (punch >= 0) return ['pugni', punch * 4 + index];
      const kick = ['gedan', 'mae', 'mawashi', 'ushiro'].indexOf(f.move);
      if (kick >= 0) return ['calci', kick * 4 + index];
      if (f.move === 'kaiten') return ['movimento', 12 + index];
    }
    if (f.state === 'dash') return ['movimento', 4 + Math.min(3, Math.floor((f.dashProgress || 0) * 4))];
    if (f.state === 'jump') return ['movimento', elapsed < .055 ? 8 : f.vy < 0 ? 9 : f.y > 595 ? 11 : 10];
    if (f.state === 'hit') return ['difesa', elapsed < .06 ? 8 : f.stun > .11 ? 9 : f.stun > .04 ? 10 : 11];
    if (f.state === 'legBlock' || f.legBlocking) return ['difesa', elapsed < .07 ? 4 : f.guardFlash > 0 ? 6 : 5];
    if (f.state === 'walk' || (f.state === 'block' && Math.abs(f.walkCycle - state.lastCycle) > .0001)) {
      const step = Math.floor((((f.walkCycle || 0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 2));
      return ['movimento', f.retreating ? (4 - step) % 4 : step];
    }
    if (f.state === 'block') return ['difesa', elapsed < .07 ? 0 : f.guardFlash > 0 ? 2 : 1];
    if (state.previous === 'jump' && elapsed < .09) return ['movimento', 11];
    if (['block', 'legBlock'].includes(state.previous) && elapsed < .08) return ['difesa', state.previous === 'block' ? 3 : 7];
    return ['base', 0];
  }

  function draw(ctx, f, time = 0) {
    const assetId = roster[f.id]?.assetId;
    if (!assetId) return original.draw(ctx, f, time);
    let state = visualStates.get(f);
    if (!state) { state = { current: f.state, since: time, previous: '', lastCycle: f.walkCycle }; visualStates.set(f, state); }
    if (state.current !== f.state) { state.previous = state.current; state.current = f.state; state.since = time; }
    const [category, index] = pose(f, time, state);
    state.lastCycle = f.walkCycle;
    const art = resolvedFrame(assetId, category, index) || resolvedFrame(assetId, 'base', f.state === 'victory' ? 11 : 0);
    if (!art) return;
    const [sx, sy, sw, sh, ax, ay] = art.frame.region;
    const scale = art.scale * (f.scale ?? 1);
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.facing === -1 ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const hit = clamp((f.hitFlash || 0) / .18, 0, 1), guard = clamp((f.guardFlash || 0) / .22, 0, 1);
    if (hit) ctx.filter = `brightness(${1 + hit * hit * 1.65}) saturate(${1 - hit * .55})`;
    else if (guard) ctx.filter = `brightness(${1 + guard * .45})`;
    ctx.drawImage(window.GiBranding?.forFacing(art.source, f.facing) || art.source, (sx - ax) * scale, (sy - ay) * scale, sw * scale, sh * scale);
    ctx.restore();
  }

  function strikePoint(f) {
    const assetId = roster[f.id]?.assetId;
    if (!assetId) return original.strikePoint?.(f);
    const [category, index] = pose(f, 0, { since: 0 });
    const art = resolvedFrame(assetId, category, index);
    if (!art) return null;
    const [sx, sy, , , ax, ay] = art.frame.region, scale = art.scale * (f.scale ?? 1);
    return window.FighterStrikePoint?.point(f, art.source, { x: (sx - ax) * scale, y: (sy - ay) * scale, scale });
  }

  function drawSelectionPortrait(ctx, id, x, y, width, h, options = {}) {
    const assetId = roster[id]?.assetId;
    if (!assetId) return original.drawSelectionPortrait(ctx, id, x, y, width, h, options);
    const art = resolvedFrame(assetId, 'base', 0);
    if (!art) return;
    const [center, top, headHeight, headWidth] = portraitHeads[assetId] ||
      [art.source.width / 2, 0, art.source.height * .19, art.source.height * .19];
    return window.FighterPortraits.draw(ctx, art.source, { center, top, headHeight, headWidth }, x, y, width, h, options);
  }

  window.FighterArt = { load, loadFighters, draw, drawSelectionPortrait, strikePoint,
    drawPortrait: (ctx, id, x, y, w, h) => drawSelectionPortrait(ctx, id, x, y, w, h, { bust: true }),
    get ready() { return original.ready; }, height };
})();
