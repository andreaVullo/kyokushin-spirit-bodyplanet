/* Arcade: original transparent AI sprites, pose-specific head rigs and belt palettes. */
(function (global) {
  'use strict';
  const previous = global.FighterArt;
  const atlas = global.ArcadeSpriteAtlas;
  const root = new URL('../assets/arcade/', document.currentScript.src);
  const images = new Map(), pending = new Map(), sources = new Map(), sheets = new Map();
  const appearances = new Map(), rendered = new Map(), states = new WeakMap(), collars = new WeakMap();
  const MAX_RENDERED_FRAMES = 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEFAULT = { id: 'arcade-player', name: 'Karateka', gender: 'male', hair: 0, rank: { color: '#f1eee7', stripe: null, dan: 0 } };

  global.__arcadeRegisterSprite = (key, source) => sources.set(key, source);

  function loadImage(key) {
    if (images.has(key)) return Promise.resolve(images.get(key));
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => {
      // HTTP pages can decode the original PNG directly. The JavaScript/base64
      // envelope remains only for local files, whose canvases need clean origins.
      const direct = root.protocol === 'https:' || root.protocol === 'http:';
      const script = direct ? null : document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timeout); script?.remove(); sources.delete(key);
        if (error) reject(error);
      };
      const fail = () => finish(new Error('Impossibile caricare gli sprite Arcade: riprova.'));
      const timeout = setTimeout(fail, 45000);
      const image = new Image();
      image.decoding = 'async';
      image.onerror = fail;
      image.onload = () => {
        if (settled) return;
        images.set(key, image); finish(); resolve(image);
      };
      if (direct) image.src = new URL(key + '.png', root).href;
      else {
        script.onerror = fail;
        script.onload = () => {
          if (settled) return;
          const source = sources.get(key);
          if (!source) { fail(); return; }
          image.src = source;
        };
        script.src = new URL(key + '.js', root).href;
        document.head.append(script);
      }
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
    let label = 0, tail = 0;
    // One neighbour function per sheet, rather than one closure per opaque
    // pixel. Large mobile sheets otherwise create millions of short-lived objects.
    const add = n => { if (!labels[n] && rgba[n * 4 + 3] >= 120) { labels[n] = label; queue[tail++] = n; } };
    for (let p = 0; p < labels.length; p++) {
      if (labels[p] || rgba[p * 4 + 3] < 120) continue;
      label++; let head = 0; tail = 1; queue[0] = p; labels[p] = label;
      while (head < tail) {
        const i = queue[head++], x = i % w, y = (i / w) | 0;
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
        if (belongs) {
          const from = at * 4, to = (y * sw + x) * 4;
          pixels.data[to] = rgba[from]; pixels.data[to + 1] = rgba[from + 1];
          pixels.data[to + 2] = rgba[from + 2]; pixels.data[to + 3] = rgba[from + 3];
        }
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
          // Remove the complete inked cut before feathering the skin. Keeping
          // fragments of its dark antialiasing creates a dotted necklace once
          // the 240-pixel portrait is reduced to a 50-pixel game head.
          const feather = Math.max(24, depth * 2), cut = 8;
          for (let y = bottom; y >= Math.max(0, bottom - feather); y--) {
            const at = (y * sw + x) * 4, t = clamp((bottom - y - cut) / (feather - cut), 0, 1);
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
    return result;
  }

  async function load(options = {}) {
    const genders = options.gender ? [options.gender === 'female' ? 'female' : 'male'] : ['male', 'female'];
    const names = [...genders.map(gender => gender + '-body'), 'heads', 'supplement'];
    if (genders.includes('male')) names.push('male-reactions');
    await Promise.all([...names.map(loadImage), global.GiBranding?.load()]);
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
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
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

  function restoreCollar(ctx, body, meta, border) {
    // The head is modular, but the gi opening belongs to this particular pose.
    // Put only the original white/blue cloth back above the lower neck; never
    // repaint the original bald scalp or the body's differently angled face.
    if (collars.has(body)) { ctx.drawImage(collars.get(body), border, border); return; }
    const [hx, hy, size, angle = 0] = meta.head;
    const centerX = hx - meta.region[0], centerY = hy - meta.region[1];
    const turn = angle * Math.PI / 180, cosine = Math.cos(turn), sine = Math.sin(turn);
    const source = body.getContext('2d').getImageData(0, 0, body.width, body.height);
    const mask = ctx.createImageData(body.width, body.height);
    const radius = Math.ceil(size * .72);
    const left = Math.max(0, Math.floor(centerX - radius)), right = Math.min(body.width, Math.ceil(centerX + radius));
    const top = Math.max(0, Math.floor(centerY - radius)), bottom = Math.min(body.height, Math.ceil(centerY + radius));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const dx = x - centerX, dy = y - centerY;
      const localX = dx * cosine + dy * sine, localY = -dx * sine + dy * cosine;
      if (localX < -size * .58 || localX > size * .50 || localY < -size * .21 || localY > size * .20) continue;
      const at = (y * body.width + x) * 4;
      const r = source.data[at], g = source.data[at + 1], b = source.data[at + 2], alpha = source.data[at + 3];
      const cloth = Math.min(r, g, b) > 72 && Math.max(r, g, b) - Math.min(r, g, b) < 78 && b > r * .82;
      if (alpha && cloth) mask.data.set(source.data.subarray(at, at + 4), at);
    }
    const collar = document.createElement('canvas'); collar.width = body.width; collar.height = body.height;
    collar.getContext('2d').putImageData(mask, 0, 0); collars.set(body, collar); ctx.drawImage(collar, border, border);
  }

  function frameFor(model, index, facing = 1) {
    const meta = atlas[model.gender][index];
    let body = sheets.get(meta.sheet)?.get(meta.component);
    if (!body) return null;
    const key = [model.gender, model.hair, model.rank.color, model.rank.stripe, model.rank.dan, index, facing === -1 ? -1 : 1].join(':');
    if (rendered.has(key)) {
      const result = rendered.get(key);
      rendered.delete(key); rendered.set(key, result);
      return result;
    }
    if (global.GiBranding?.arcadeOptions) {
      body = global.GiBranding.apply(body, global.GiBranding.arcadeOptions(model.gender, index, meta));
      body = global.GiBranding.forFacing(body, facing);
    }
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
    restoreCollar(ctx, body, meta, border);
    const floor = global.FighterGeometry?.measure(body)?.floor ?? (meta.bounds[1] + meta.bounds[3] - meta.region[1]);
    const result = { canvas, meta, offsetX: meta.region[0] - meta.anchor[0] - border, offsetY: -floor - border };
    rendered.set(key, result);
    // Evict old belts/hairstyles incrementally. Clearing the complete cache at
    // a promotion made the next match build every animation during live play.
    if (rendered.size > MAX_RENDERED_FRAMES) rendered.delete(rendered.keys().next().value);
    return result;
  }

  async function prepareCharacter(model) {
    // The loading screen pays the composition cost, including the opposite
    // chest mark. Yield between poses so touch UI and online heartbeats run.
    for (let index = 0; index < atlas[model.gender].length; index++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      frameFor(model, index, 1); frameFor(model, index, -1);
    }
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
    const art = frameFor(model, pose(f, time, state), f.facing);
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

  function strikePoint(f) {
    const model = appearances.get(f.id);
    if (!model) return previous.strikePoint?.(f);
    const art = frameFor(model, pose(f, 0, { since: 0 }));
    if (!art) return null;
    const scale = previous.height / art.meta.nominal * (f.scale ?? 1);
    return global.FighterStrikePoint?.point(f, art.canvas, { x: art.offsetX * scale, y: art.offsetY * scale, scale });
  }

  function drawPreview(ctx, value, x, y, width, height, options = {}) {
    options = { ...value, ...options };
    const model = appearance(value), art = frameFor(model, options.pose ?? 0, options.facing);
    if (!art) return false;
    const [hx, hy, headSize, , back = 0] = art.meta.head;
    const head = atlas.heads[(model.gender === 'female' ? 10 : 0) + (back ? 5 : 0) + model.hair];
    const scale = headSize / 240;
    const profile = {
      // The anatomical neck anchor stays fixed when a ponytail changes the
      // silhouette width; hairstyles must not move the face across a card.
      center: hx - art.meta.region[0] + 30,
      top: hy - art.meta.region[1] + 30 + (head.bounds[1] - head.anchor[1]) * scale,
      headHeight: headSize * .85,
      headWidth: head.bounds[2] * scale,
    };
    return global.FighterPortraits.draw(ctx, art.canvas, profile, x, y, width, height,
      { ...options, full: options.full ?? (!options.bust && !options.hero) });
  }

  function drawSelectionPortrait(ctx, id, x, y, width, height, options = {}) {
    const model = appearances.get(id);
    return model ? drawPreview(ctx, model, x, y, width, height, { ...options, hero: true }) : previous.drawSelectionPortrait(ctx, id, x, y, width, height, options);
  }

  global.ArcadeArt = { load, setCharacter, drawPreview, getCharacter: id => appearances.get(id),
    isCustom: id => appearances.has(id), pose, get ready() { return sheets.has('heads') && sheets.has('male-body') && sheets.has('female-body'); } };
  global.FighterArt = { ...previous, load: () => previous.load(),
    async loadFighters(ids) {
      const custom = ids.filter(id => appearances.has(id));
      await Promise.all([previous.loadFighters(ids.filter(id => !appearances.has(id))),
        ...[...new Set(custom.map(id => appearances.get(id).gender))].map(gender => load({ gender }))]);
      for (const id of new Set(custom)) await prepareCharacter(appearances.get(id));
    }, draw, drawSelectionPortrait, strikePoint,
    drawPortrait: (ctx, id, x, y, width, height) => drawSelectionPortrait(ctx, id, x, y, width, height, { bust: true }),
    get ready() { return previous.ready; }, height: previous.height };

  const effects = [];
  let vfxReady = false, reducedMotion = false;
  const vfxRows = { hit: 0, heavy: 1, block: 2, attack: 3, dust: 4, critical: 5 };
  const vfxColumns = [0, 209, 410, 618, 860, 1063, 1254];
  const vfxBands = [0, 216, 410, 634, 835, 1017, 1254];
  function emit(event, state) {
    if (event?.type === 'round') { effects.length = 0; return false; }
    if (!vfxReady || !event || !['hit', 'block', 'land'].includes(event.type)) return false;
    // A tatami does not explode under every step, dash or ordinary landing.
    if (event.type === 'land' && !event.heavy) return false;
    const target = state?.fighters?.[event.target];
    let type = event.type, x = event.x, y = event.y, size = 72, duration = .17;
    if (type === 'land') { type = 'dust'; size = 88; y -= 25; duration = .24; }
    else {
      if (!target || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      x = target.x - (event.facing || 1) * (type === 'block' ? 36 : 24);
      if (type === 'block' && event.guardType === 'leg') y = target.y - 105;
      if (type === 'hit') {
        // The atlas's "heavy" row is a ground explosion, not a body impact.
        type = event.move === 'kaiten' || event.comboLimit ? 'critical' : 'hit';
        size = type === 'critical' ? 108 : event.damage >= 130 ? 88 : 68;
        duration = type === 'critical' ? .22 : .16;
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (effects.length >= 28) effects.shift();
    effects.push({ type, x, y, size, duration, life: 0, facing: event.facing || 1,
      target, offsetX: target ? x - target.x : 0, offsetY: target ? y - target.y : 0 });
    return true;
  }
  function drawEffectFrame(ctx, type, frame, x, y, size, facing = 1, alpha = .92, angle = 0) {
    if (!vfxReady) return;
    const row = vfxRows[type] ?? 0, index = clamp(Math.trunc(frame), 0, 5);
    const sx = vfxColumns[index];
    const sy = row === 1 && index === 2 ? 202 : vfxBands[row];
    const bottom = row === 0 && index === 2 ? 202 : vfxBands[row + 1];
    const sw = vfxColumns[index + 1] - sx, sh = bottom - sy;
    ctx.save(); ctx.translate(x, y); ctx.scale(facing < 0 ? -1 : 1, 1); ctx.rotate(angle); ctx.globalAlpha = alpha;
    ctx.drawImage(images.get('vfx'), sx, sy, sw, sh, -size * sw / 418, -size * sh / 418, size * sw / 209, size * sh / 209); ctx.restore();
  }
  function drawStrikes(ctx, state) {
    if (reducedMotion || state?.phase !== 'fight') return;
    for (const fighter of state.fighters) {
      const attack = fighter.attack, def = attack?.def;
      if (fighter.state !== 'attack' || !def || attack.hitApplied || fighter.stun > 0 || fighter.knockdown ||
          fighter.moveTime < def.start || fighter.moveTime > def.end) continue;
      const tip = global.FighterArt.strikePoint?.(fighter);
      if (!tip) continue;
      const progress = clamp((fighter.moveTime - def.start) / (def.end - def.start), 0, 1);
      const kick = ['gedan', 'mae', 'mawashi', 'ushiro', 'kaiten'].includes(fighter.move);
      const size = (kick ? 82 : 48) * (fighter.scale ?? 1);
      const angle = ({ shita: -.65, kagi: -.15, gedan: .3, mawashi: -.4, kaiten: .55 })[fighter.move] || 0;
      // Keep the bright leading edge on the visible extremity, never at a
      // delayed snapshot of the fighter's starting position.
      const facing = fighter.facing === -1 ? -1 : 1;
      drawEffectFrame(ctx, 'attack', Math.min(5, Math.floor(progress * 6)),
        tip.x - facing * Math.cos(angle) * size * .28, tip.y - Math.sin(angle) * size * .28,
        size, facing, .28 + Math.sin(progress * Math.PI) * .18, angle);
    }
  }
  function drawVFX(ctx, dt = 0, options = {}) {
    if ('reducedMotion' in options) reducedMotion = !!options.reducedMotion;
    if (!vfxReady) { effects.length = 0; return; }
    drawStrikes(ctx, options.state);
    const step = options.state?.paused || options.state?.hitstop > 0 ? 0 : Math.max(0, Math.min(.1, dt));
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]; effect.life += step;
      if (effect.life >= effect.duration || (effect.target && !options.state?.fighters.includes(effect.target))) { effects.splice(i, 1); continue; }
      if (reducedMotion && effect.type === 'dust') continue;
      const frame = reducedMotion ? 1 : Math.min(5, Math.floor(effect.life / effect.duration * 6));
      const size = effect.size * (reducedMotion ? .65 : 1);
      const x = effect.target ? effect.target.x + effect.offsetX : effect.x;
      const y = effect.target ? effect.target.y + effect.offsetY : effect.y;
      drawEffectFrame(ctx, effect.type, frame, x, y, size, effect.facing, reducedMotion ? .55 : effect.type === 'dust' ? .4 : .9);
    }
  }
  global.ArcadeVFX = { async load() { await loadImage('vfx'); vfxReady = true; }, emit, draw: drawVFX, drawFrame: drawEffectFrame,
    clear() { effects.length = 0; }, set reducedMotion(value) { reducedMotion = !!value; }, get reducedMotion() { return reducedMotion; }, get ready() { return vfxReady; } };
})(window);
