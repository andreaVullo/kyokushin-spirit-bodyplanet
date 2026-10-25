/* Arcade: original transparent AI sprites, pose-specific head rigs and belt palettes. */
(function (global) {
  'use strict';
  const previous = global.FighterArt;
  const atlas = global.ArcadeSpriteAtlas;
  const root = new URL('../assets/arcade/', document.currentScript.src);
  const images = new Map(), pending = new Map(), sources = new Map(), sheets = new Map();
  const appearances = new Map(), rendered = new Map(), states = new WeakMap();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEFAULT = { id: 'arcade-player', name: 'Karateka', gender: 'male', hair: 0, rank: { color: '#f1eee7', stripe: null, dan: 0 } };

  global.__arcadeRegisterSprite = (key, source) => sources.set(key, source);

  function loadImage(key) {
    if (images.has(key)) return Promise.resolve(images.get(key));
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timeout); script.remove(); sources.delete(key);
        if (error) reject(error);
      };
      const fail = () => finish(new Error('Impossibile caricare gli sprite Arcade: riprova.'));
      const timeout = setTimeout(fail, 45000);
      script.onerror = fail;
      script.onload = () => {
        const source = sources.get(key);
        if (!source) { fail(); return; }
        const image = new Image();
        image.onerror = fail;
        image.onload = () => {
          if (settled) return;
          images.set(key, image); finish(); resolve(image);
        };
        image.src = source;
      };
      script.src = new URL(key + '.js', root).href;
      document.head.append(script);
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  function allMetaFor(key) {
    return [...atlas.male, ...atlas.female, ...atlas.heads].filter(frame => frame.sheet === key);
  }

  // Separate overlapping rectangular crops by each intact alpha silhouette.
  // Source files stay byte-for-byte unchanged, including their generated alpha.
  function prepare(key) {
    if (sheets.has(key)) return;
    const image = images.get(key), w = image.naturalWidth, h = image.naturalHeight;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const labels = new Int32Array(w * h), queue = new Int32Array(w * h);
    let label = 0;
    for (let p = 0; p < labels.length; p++) {
      if (labels[p] || rgba[p * 4 + 3] < 120) continue;
      label++; let head = 0, tail = 1; queue[0] = p; labels[p] = label;
      while (head < tail) {
        const i = queue[head++], x = i % w, y = (i / w) | 0;
        const add = n => { if (!labels[n] && rgba[n * 4 + 3] >= 120) { labels[n] = label; queue[tail++] = n; } };
        if (x) add(i - 1); if (x + 1 < w) add(i + 1);
        if (y) add(i - w); if (y + 1 < h) add(i + w);
      }
    }
    const result = new Map();
    for (const frame of allMetaFor(key)) {
      if (result.has(frame.component)) continue;
      const [sx, sy, sw, sh] = frame.region;
      const cut = document.createElement('canvas'); cut.width = sw; cut.height = sh;
      const context = cut.getContext('2d'), pixels = context.createImageData(sw, sh);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const gx = x + sx, gy = y + sy;
        if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
        const at = gy * w + gx;
        let belongs = labels[at] === frame.component;
        if (!belongs && rgba[at * 4 + 3] > 0 && rgba[at * 4 + 3] < 120) {
          belongs = (gx > 0 && labels[at - 1] === frame.component) ||
            (gx + 1 < w && labels[at + 1] === frame.component) ||
            (gy > 0 && labels[at - w] === frame.component) ||
            (gy + 1 < h && labels[at + w] === frame.component);
        }
        if (belongs) pixels.data.set(rgba.subarray(at * 4, at * 4 + 4), (y * sw + x) * 4);
      }
      if (frame.neckBlend) {
        // Each modular portrait ends in an inked cut across the neck. That cut
        // is a sprite boundary, not an anatomical outline: blend it into the
        // pose's existing neck while retaining hair, jaw and silhouette edges.
        const [left, right, top, depth] = frame.neckBlend;
        for (let gx = left; gx <= right; gx++) {
          const x = gx - sx;
          if (x < 0 || x >= sw) continue;
          let bottom = sh - 1;
          while (bottom >= Math.max(0, top - sy) && pixels.data[(bottom * sw + x) * 4 + 3] < 120) bottom--;
          if (bottom < top - sy) continue;
          for (let y = bottom; y >= Math.max(0, bottom - depth); y--) {
            const at = (y * sw + x) * 4, t = clamp((bottom - y - 2) / depth, 0, 1);
            pixels.data[at + 3] *= t * t * (3 - 2 * t);
          }
        }
      }
      context.putImageData(pixels, 0, 0); result.set(frame.component, cut);
    }
    canvas.width = canvas.height = 0; sheets.set(key, result);
  }

  function appearance(value = {}) {
    const rank = value.rank || DEFAULT.rank;
    return { ...DEFAULT, ...value, gender: value.gender === 'female' ? 'female' : 'male',
      hair: clamp(Math.trunc(Number(value.hair ?? value.hairstyle ?? 0)) || 0, 0, 4),
      rank: { color: rank.color || '#f1eee7', stripe: rank.stripe || null, dan: clamp(Math.trunc(Number(rank.dan)) || 0, 0, 10) } };
  }

  function setCharacter(value) {
    const result = appearance(value); appearances.set(result.id, result);
    // Keep the cache bounded when advancing through all twenty ranks.
    if (rendered.size > 180) rendered.clear();
    return result;
  }

  async function load(options = {}) {
    const genders = options.gender ? [options.gender === 'female' ? 'female' : 'male'] : ['male', 'female'];
    const names = [...genders.map(gender => gender + '-body'), 'heads', 'supplement'];
    if (genders.includes('male')) names.push('male-reactions');
    await Promise.all(names.map(loadImage));
    names.forEach(prepare);
  }

  function rgb(color) {
    const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : 'f1eee7';
    return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  }

  function recolorBelt(ctx, width, height, rank) {
    const image = ctx.getImageData(0, 0, width, height), pixels = image.data, mask = [];
    let top = height, bottom = 0;
    const rowCounts = new Uint32Array(height);
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b, a] = pixels.subarray(i, i + 4);
      if (a > 0 && g > 45 && b > 45 && g - r > 32 && b - r > 32 && g > r * 1.9 && b > r * 1.9 && b / g > .70 && b / g < 1.32) {
        const y = Math.floor(i / 4 / width);
        rowCounts[y]++; mask.push(i);
      }
    }
    // Tiny cyan anti-alias fringes on a trouser edge must not extend the belt's
    // palette or gold-bar range all the way down to the fighter's feet.
    const threshold = Math.max(3, Math.max(...rowCounts) * .09);
    for (let y = 0; y < height; y++) if (rowCounts[y] >= threshold) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const base = rgb(rank.color), accent = rgb(rank.dan ? '#e5b74a' : (rank.stripe || rank.color));
    const length = bottom - top + 1, start = top + length * .42, end = bottom - Math.max(1, length * .04);
    const count = rank.dan || (rank.stripe ? 1 : 0);
    for (const i of mask) {
      const y = Math.floor(i / 4 / width), brightness = clamp((pixels[i + 1] + pixels[i + 2]) / 360, .30, 1.23);
      if (y < top || y > bottom) continue;
      let color = base;
      if (count && y >= start && y <= end) {
        const position = (y - start) / Math.max(1, end - start);
        if (count === 1 ? position > .72 && position < .9 : (position * count) % 1 < .43) color = accent;
      }
      for (let c = 0; c < 3; c++) pixels[i + c] = clamp(Math.round(color[c] * brightness), 0, 255);
    }
    ctx.putImageData(image, 0, 0);
  }

  function frameFor(model, index) {
    const meta = atlas[model.gender][index], body = sheets.get(meta.sheet)?.get(meta.component);
    if (!body) return null;
    const key = [model.gender, model.hair, model.rank.color, model.rank.stripe, model.rank.dan, index].join(':');
    if (rendered.has(key)) return rendered.get(key);
    // Extra border accommodates the five hairstyles without clipping a ponytail.
    const border = 30, canvas = document.createElement('canvas');
    canvas.width = body.width + border * 2; canvas.height = body.height + border * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(body, border, border); recolorBelt(ctx, canvas.width, canvas.height, model.rank);
    if (meta.eraseHead) {
      // At extreme rotation the neutral body's wider scalp must be removed
      // before applying the modular head, including the close buzz-cut option.
      const [x, y, rx, ry, turn = 0] = meta.eraseHead;
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath();
      ctx.ellipse(x - meta.region[0] + border, y - meta.region[1] + border, rx, ry, turn * Math.PI / 180, 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    }
    const [hx, hy, headSize, angle = 0, back = 0] = meta.head;
    const headIndex = (model.gender === 'female' ? 10 : 0) + (back ? 5 : 0) + model.hair;
    const headMeta = atlas.heads[headIndex], head = sheets.get('heads')?.get(headMeta.component);
    if (head) {
      const scale = headSize / 240;
      ctx.save(); ctx.translate(hx - meta.region[0] + border, hy - meta.region[1] + border);
      ctx.rotate(angle * Math.PI / 180);
      ctx.drawImage(head, (headMeta.region[0] - headMeta.anchor[0]) * scale,
        (headMeta.region[1] - headMeta.anchor[1]) * scale, head.width * scale, head.height * scale);
      ctx.restore();
    }
    const result = { canvas, meta, offsetX: meta.region[0] - meta.anchor[0] - border, offsetY: meta.region[1] - meta.anchor[1] - border };
    rendered.set(key, result); return result;
  }

  const attackFrames = { tsuki: 6, gyaku: 8, shita: 10, kagi: 12, gedan: 14, mae: 16, mawashi: 18, ushiro: 20, kaiten: 22 };
  function pose(f, time, state) {
    const elapsed = time - state.since;
    if (f.state === 'victory') return 33;
    if (f.state === 'ko' || f.knockdown) return f.airborne || elapsed < .16 ? 30 : (f.hp > 0 && f.recovery < .12 && f.stun <= 0 ? 32 : 31);
    if (f.state === 'attack') {
      const move = global.KyokushinMoves?.[f.move], base = attackFrames[f.move];
      if (move && base !== undefined) {
        const p = clamp(f.moveProgress || 0, 0, 1), start = move.start / move.duration, end = move.end / move.duration;
        return p < start * .33 || p > end + (1 - end) * .6 ? 0 : p < start || p > end ? base : base + 1;
      }
    }
    if (f.state === 'dash') return 3;
    if (f.state === 'jump') return f.vy < 0 ? 4 : 5;
    if (f.state === 'hit') return elapsed < .08 || f.stun > .12 ? 29 : 28;
    if (f.state === 'legBlock' || f.legBlocking) return elapsed < .07 ? 26 : 27;
    if (f.state === 'block') return elapsed < .07 ? 24 : 25;
    if (f.state === 'walk') return Math.sin(f.walkCycle || 0) > 0 ? 1 : 2;
    if (state.previous === 'jump' && elapsed < .10) return 35;
    return 0;
  }

  function draw(ctx, f, time = 0) {
    const model = appearances.get(f.id);
    if (!model) return previous.draw(ctx, f, time);
    let state = states.get(f);
    if (!state) { state = { current: f.state, since: time, previous: '' }; states.set(f, state); }
    if (state.current !== f.state) { state.previous = state.current; state.current = f.state; state.since = time; }
    const art = frameFor(model, pose(f, time, state));
    if (!art) return;
    const scale = previous.height / art.meta.nominal * (f.scale ?? 1);
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.facing === -1 ? -1 : 1, 1);
    const hit = clamp((f.hitFlash || 0) / .18, 0, 1), guard = clamp((f.guardFlash || 0) / .22, 0, 1);
    if (hit) ctx.filter = `brightness(${1 + hit * hit * 1.3}) saturate(${1 - hit * .35})`;
    else if (guard) ctx.filter = `brightness(${1 + guard * .35})`;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.canvas, art.offsetX * scale, art.offsetY * scale, art.canvas.width * scale, art.canvas.height * scale);
    ctx.restore();
  }

  function drawPreview(ctx, value, x, y, width, height, options = {}) {
    options = { ...value, ...options };
    const model = appearance(value), art = frameFor(model, options.pose ?? 0);
    if (!art) return false;
    const source = art.canvas;
    let sx = 0, sy = 0, sw = source.width, sh = source.height;
    if (options.bust) {
      const [hx, hy, headSize] = art.meta.head;
      sw = headSize * 1.8; sh = headSize * 1.65;
      sx = hx - art.meta.region[0] + 30 - sw * .5;
      sy = hy - art.meta.region[1] + 30 - headSize * 1.13;
    }
    const scale = Math.min(width / sw, height / sh), dw = sw * scale, dh = sh * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.translate(x + width / 2, y + height - dh); if (options.facing === -1) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, -dw / 2, 0, dw, dh); ctx.restore(); return true;
  }

  function drawSelectionPortrait(ctx, id, x, y, width, height, options = {}) {
    const model = appearances.get(id);
    return model ? drawPreview(ctx, model, x, y, width, height, options) : previous.drawSelectionPortrait(ctx, id, x, y, width, height, options);
  }

  global.ArcadeArt = { load, setCharacter, drawPreview, getCharacter: id => appearances.get(id),
    isCustom: id => appearances.has(id), pose, get ready() { return sheets.has('heads') && sheets.has('male-body') && sheets.has('female-body'); } };
  global.FighterArt = { ...previous, load: () => previous.load(),
    async loadFighters(ids) {
      const custom = ids.filter(id => appearances.has(id));
      await Promise.all([previous.loadFighters(ids.filter(id => !appearances.has(id))),
        ...[...new Set(custom.map(id => appearances.get(id).gender))].map(gender => load({ gender }))]);
    }, draw, drawSelectionPortrait,
    drawPortrait: (ctx, id, x, y, width, height) => drawSelectionPortrait(ctx, id, x, y, width, height, { bust: true }),
    get ready() { return previous.ready; }, height: previous.height };

  const effects = [];
  let vfxReady = false, reducedMotion = false;
  const vfxRows = { hit: 0, heavy: 1, block: 2, attack: 3, dust: 4, critical: 5 };
  const vfxColumns = [0, 209, 410, 618, 860, 1063, 1254];
  const vfxBands = [0, 216, 410, 634, 835, 1017, 1254];
  function emit(event) {
    if (!event || !['hit', 'block', 'attack', 'land', 'dash'].includes(event.type)) return;
    let type = event.type, x = event.x || 0, y = event.y || 0, size = 106, duration = .28, delay = 0;
    if (type === 'attack') {
      const move = global.KyokushinMoves?.[event.move];
      x += (event.facing || 1) * ((move?.reach || 150) * .65); y -= move?.height || 150;
      size = event.move === 'kaiten' ? 180 : 115; duration = .22;
      delay = (move?.start || 0) * .65;
    } else if (type === 'land' || type === 'dash') { type = 'dust'; size = event.heavy ? 170 : 108; y -= 14; duration = .34; }
    else if (type === 'hit') { type = event.knockdown || event.combo >= 5 ? 'critical' : event.damage >= 130 ? 'heavy' : 'hit'; size = type === 'critical' ? 158 : type === 'heavy' ? 133 : 98; }
    if (effects.length > 28) effects.shift();
    effects.push({ type, x, y, size, duration, life: -delay, facing: event.facing || event.direction || 1 });
  }
  function drawEffectFrame(ctx, type, frame, x, y, size, facing = 1, alpha = .92) {
    if (!vfxReady) return;
    const row = vfxRows[type] ?? 0, index = clamp(Math.trunc(frame), 0, 5);
    const sx = vfxColumns[index];
    const sy = row === 1 && index === 2 ? 202 : vfxBands[row];
    const bottom = row === 0 && index === 2 ? 202 : vfxBands[row + 1];
    const sw = vfxColumns[index + 1] - sx, sh = bottom - sy;
    ctx.save(); ctx.translate(x, y); ctx.scale(facing < 0 ? -1 : 1, 1); ctx.globalAlpha = alpha;
    ctx.drawImage(images.get('vfx'), sx, sy, sw, sh, -size * sw / 418, -size * sh / 418, size * sw / 209, size * sh / 209); ctx.restore();
  }
  function drawVFX(ctx, dt = 0, options = {}) {
    if ('reducedMotion' in options) reducedMotion = !!options.reducedMotion;
    if (!vfxReady) { effects.length = 0; return; }
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]; effect.life += Math.max(0, Math.min(.1, dt));
      if (effect.life >= effect.duration) { effects.splice(i, 1); continue; }
      if (effect.life < 0) continue;
      if (reducedMotion && (effect.type === 'attack' || effect.type === 'dust')) continue;
      const frame = reducedMotion ? 1 : Math.min(5, Math.floor(effect.life / effect.duration * 6));
      const size = effect.size * (reducedMotion ? .65 : 1);
      drawEffectFrame(ctx, effect.type, frame, effect.x, effect.y, size, effect.facing, reducedMotion ? .55 : .92);
    }
  }
  global.ArcadeVFX = { async load() { await loadImage('vfx'); vfxReady = true; }, emit, draw: drawVFX, drawFrame: drawEffectFrame,
    clear() { effects.length = 0; }, set reducedMotion(value) { reducedMotion = !!value; }, get reducedMotion() { return reducedMotion; }, get ready() { return vfxReady; } };
})(window);
