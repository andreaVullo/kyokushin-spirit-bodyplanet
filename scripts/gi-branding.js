/* One transparent chest mark. Only confidently detected old ink is replaced. */
(function (global) {
  'use strict';
  const root = new URL('../assets/branding/', document.currentScript.src);
  const cache = new WeakMap(), reports = new WeakMap(), mirrorSources = new WeakMap(), mirrored = new WeakMap();
  let loading, logo, source;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  global.__kyokushinRegisterBranding = (key, url) => { if (key === 'kyokushin-kanji') source = url; };

  function load() {
    if (logo) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timeout); script.remove(); source = null;
        error ? reject(error) : resolve();
      };
      const fail = () => finish(new Error('Impossibile caricare il simbolo del dojo.'));
      const timeout = setTimeout(fail, 30000);
      script.onerror = fail;
      script.onload = () => {
        if (!source || settled) return fail();
        const image = new Image(); image.onerror = fail;
        image.onload = () => {
          if (settled) return;
          // Crop only the transparent margin; the generated pixels stay intact.
          const sheet = document.createElement('canvas'); sheet.width = image.naturalWidth; sheet.height = image.naturalHeight;
          const ctx = sheet.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
          const data = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
          let left = sheet.width, top = sheet.height, right = 0, bottom = 0;
          for (let y = 0; y < sheet.height; y++) for (let x = 0; x < sheet.width; x++) if (data[(y * sheet.width + x) * 4 + 3] > 12) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
          }
          if (right <= left || bottom <= top) return fail();
          logo = document.createElement('canvas'); logo.width = right - left; logo.height = bottom - top;
          logo.getContext('2d').drawImage(sheet, left, top, logo.width, logo.height, 0, 0, logo.width, logo.height);
          finish();
        };
        image.src = source;
      };
      script.src = new URL('kyokushin-kanji.js', root).href; document.head.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  const dark = (p, at) => p[at + 3] > 180 && Math.max(p[at], p[at + 1], p[at + 2]) < 55;
  const cloth = (p, at) => p[at + 3] > 180 && p[at] > 70 && p[at + 1] > 85 && p[at + 2] > 95 &&
    p[at] - p[at + 2] < 42 && p[at] - p[at + 1] < 25 && Math.max(p[at], p[at + 1], p[at + 2]) - Math.min(p[at], p[at + 1], p[at + 2]) < 90;

  // Pure analysis is exposed for fixture audits. A missing/ambiguous emblem is
  // deliberately left alone: never invent a chest logo on a back-facing pose.
  function detect(pixels, width, height, options = {}) {
    if (options.skip) return { status: 'skipped', candidates: [] };
    const nominal = Math.max(24, options.nominal || height), labels = new Uint8Array(width * height), candidates = [];
    let silhouetteTop = height;
    for (let y = 0; y < height && silhouetteTop === height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 180) { silhouetteTop = y; break; }
    const range = options.inkRegion || options.emblem;
    if (range && (range.length !== 4 || range.some(value => !Number.isFinite(value)) || range[2] <= 0 || range[3] <= 0)) return { status: 'invalid-hint', candidates: [] };
    // Explicit measurements also cover front-facing gi that originally had no
    // mark (the female Arcade sheet). This is never enabled by inference.
    if (range) {
      const [x, y, w, h] = range.map(Math.round), ink = [];
      let samples = 0, fabric = 0;
      for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
        const i = py * width + px; samples++;
        if (dark(pixels, i * 4)) ink.push(i);
        else if (cloth(pixels, i * 4)) fabric++;
      }
      let surroundingFabric = 0, surroundingSamples = 0;
      const border = Math.max(2, Math.round(nominal * .012));
      for (let py = Math.max(0, y - border); py < Math.min(height, y + h + border); py++) for (let px = Math.max(0, x - border); px < Math.min(width, x + w + border); px++) {
        if (px >= x && px < x + w && py >= y && py < y + h) continue;
        surroundingSamples++; if (cloth(pixels, (py * width + px) * 4)) surroundingFabric++;
      }
      const solidMark = ink.length / Math.max(1, samples) > .3 && surroundingFabric / Math.max(1, surroundingSamples) > .75;
      if (samples !== w * h || (fabric / Math.max(1, samples) < .25 && !solidMark)) return { status: 'unsafe-hint', candidates: [] };
      if (!ink.length && !options.add) return { status: 'absent', candidates: [] };
      const candidate = { bounds: [x, y, w, h], ink, confidence: 1, measured: true };
      return { status: 'detected', ...candidate, candidates: [candidate] };
    }
    const neck = options.head;
    const minY = range ? range[1] : neck ? neck[1] + nominal * .012 : silhouetteTop + nominal * .15;
    const maxY = range ? range[1] + range[3] : neck ? neck[1] + nominal * .28 : silhouetteTop + nominal * .54;
    const gap = Math.max(1, Math.min(2, Math.round(nominal * .004)));
    for (let start = 0; start < labels.length; start++) {
      if (labels[start] || !dark(pixels, start * 4)) continue;
      const queue = [start]; labels[start] = 1;
      let left = width, top = height, right = 0, bottom = 0;
      for (let pos = 0; pos < queue.length; pos++) {
        const i = queue[pos], x = i % width, y = (i / width) | 0;
        left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) {
          const nx = x + dx, ny = y + dy, next = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && !labels[next] && dark(pixels, next * 4)) { labels[next] = 1; queue.push(next); }
        }
      }
      const w = right - left, h = bottom - top, area = w * h, cy = (top + bottom) / 2, cx = (left + right) / 2;
      if (cy < minY || cy > maxY || queue.length < nominal * nominal * .0003 ||
        (!range && (w < nominal * .013 || w > nominal * .105 || h < nominal * .065 || h > nominal * .19 || h / w < 1.4 || h / w > 6 || queue.length / area < .20)) ||
        (neck && Math.abs(cx - neck[0]) > nominal * .30) ||
        (range && (left < range[0] - 2 || right > range[0] + range[2] + 2 || top < range[1] - 2 || bottom > range[1] + range[3] + 2))) continue;
      const pad = Math.max(2, Math.round(nominal * .012)); let surround = 0, fabric = 0;
      for (let y = Math.max(0, top - pad); y < Math.min(height, bottom + pad); y++) for (let x = Math.max(0, left - pad); x < Math.min(width, right + pad); x++) {
        if (x >= left && x < right && y >= top && y < bottom) continue;
        surround++; if (cloth(pixels, (y * width + x) * 4)) fabric++;
      }
      if (fabric / Math.max(1, surround) < (range ? .40 : .68)) continue;
      candidates.push({ bounds: [left, top, w, h], ink: queue, confidence: fabric / surround });
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    if (!candidates.length) return { status: 'absent', candidates };
    if (candidates.length > 1 && !range) return { status: 'ambiguous', candidates };
    return { status: 'detected', ...candidates[0], candidates };
  }

  function restoreInk(pixels, width, height, detection) {
    const data = new Uint8ClampedArray(pixels), mask = new Uint8Array(width * height);
    const [left, top, w, h] = detection.bounds;
    for (const i of detection.ink) mask[i] = 1;
    // Include only the dark antialias fringe around the old ink. Unrelated
    // folds and every pixel outside the emblem remain byte-for-byte intact.
    for (const i of detection.ink) {
      const x = i % width, y = (i / width) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx, at = n * 4;
        if (nx >= left && nx < left + w && ny >= top && ny < top + h && pixels[at + 3] > 180 && Math.max(pixels[at], pixels[at + 1], pixels[at + 2]) < 165) mask[n] = 1;
      }
    }
    const ink = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) ink.push(i);
    for (const i of ink) {
      const x = i % width, y = (i / width) | 0, sum = [0, 0, 0]; let weight = 0;
      const radius = Math.max(6, Math.ceil(w * .65));
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || mask[n] || !cloth(pixels, n * 4)) continue;
        const sample = 1 / Math.pow(dx * dx + dy * dy + .5, 1.5); weight += sample;
        for (let c = 0; c < 3; c++) sum[c] += pixels[n * 4 + c] * sample;
      }
      if (!weight) continue;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(sum[c] / weight);
    }
    // Harmonic inpainting continues local cloth gradients through the exact
    // stroke mask, instead of placing a visible solid rectangular patch.
    for (let pass = 0; pass < 18; pass++) for (const i of ink) {
      const x = i % width, y = (i / width) | 0;
      for (let c = 0; c < 3; c++) {
        let sum = 0, count = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy, n = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || (!mask[n] && !cloth(pixels, n * 4))) continue;
          sum += data[n * 4 + c]; count++;
        }
        if (count) data[i * 4 + c] = Math.round(sum / count);
      }
    }
    return { data, mask };
  }

  function composite(canvas, image, restored, detected, options, flip = false) {
    const result = document.createElement('canvas'); result.width = canvas.width; result.height = canvas.height;
    const target = result.getContext('2d'), pixels = target.createImageData(canvas.width, canvas.height); pixels.data.set(restored.data); target.putImageData(pixels, 0, 0);
    const overlay = document.createElement('canvas'); overlay.width = canvas.width; overlay.height = canvas.height;
    const mark = overlay.getContext('2d'), [x, y, w, h] = options.emblem || detected.bounds;
    mark.save(); mark.translate(x + w / 2, y + h / 2); mark.rotate((options.angle || 0) * Math.PI / 180);
    if (flip) mark.scale(-1, 1);
    const inkWidth = h * logo.width / logo.height;
    mark.drawImage(logo, -inkWidth / 2, -h / 2, inkWidth, h); mark.restore();
    const ink = mark.getImageData(0, 0, overlay.width, overlay.height);
    for (let i = 0; i < canvas.width * canvas.height; i++) {
      // Keep hands/skin, hair, coloured belts and transparent silhouette edges
      // in front of the mark, even with an explicit measured emblem rectangle.
      if (!restored.mask[i] && !cloth(image.data, i * 4)) ink.data[i * 4 + 3] = 0;
      else ink.data[i * 4 + 3] = Math.min(ink.data[i * 4 + 3], image.data[i * 4 + 3]);
    }
    mark.putImageData(ink, 0, 0); target.drawImage(overlay, 0, 0);
    const composed = target.getImageData(0, 0, result.width, result.height);
    for (let i = 3; i < composed.data.length; i += 4) composed.data[i] = image.data[i];
    target.putImageData(composed, 0, 0);
    return result;
  }

  function apply(canvas, options = {}) {
    if (!logo || options.skip) return canvas;
    const key = JSON.stringify([options.nominal, options.head, options.emblem, options.inkRegion, options.fallbackEmblem, options.angle, options.add]);
    if (cache.get(canvas)?.key === key) return cache.get(canvas).canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let detected = detect(image.data, canvas.width, canvas.height, options);
    if (detected.status === 'absent' && options.fallbackEmblem) {
      options = { ...options, emblem: options.fallbackEmblem, add: true };
      detected = detect(image.data, canvas.width, canvas.height, options);
    }
    const report = { ...detected, ink: undefined, candidates: detected.candidates.map(item => ({ bounds: item.bounds, confidence: item.confidence })) };
    reports.set(canvas, report);
    if (detected.status !== 'detected') { cache.set(canvas, { key, canvas }); return canvas; }
    const restored = restoreInk(image.data, canvas.width, canvas.height, detected);
    const result = composite(canvas, image, restored, detected, options);
    // Keep only the opposite mark's small chest patch. Retaining the source,
    // full RGBA and restored RGBA for every pose would exhaust mobile memory.
    const opposite = composite(canvas, image, restored, detected, options, true);
    const [bx, by, bw, bh] = options.emblem || detected.bounds;
    const pad = Math.ceil(Math.max(bw, bh) * .65) + 3;
    const left = Math.max(0, Math.floor(bx - pad)), top = Math.max(0, Math.floor(by - pad));
    const right = Math.min(canvas.width, Math.ceil(bx + bw + pad)), bottom = Math.min(canvas.height, Math.ceil(by + bh + pad));
    const patch = opposite.getContext('2d').getImageData(left, top, right - left, bottom - top);
    mirrorSources.set(result, { left, top, patch });
    opposite.width = opposite.height = 0;
    reports.set(result, report); cache.set(canvas, { key, canvas: result }); return result;
  }

  const placementHints = {"arcade":{"male":{"0":[111,63,9,22],"3":[151,63,14,22,35],"4":[91,54,11,19],"5":[85,64,14,18,15],"6":[111,62,10,22],"7":[120,59,11,21],"8":[130,61,14,21],"9":[124,60,13,21],"10":[105,61,15,19,15],"12":[77,55,10,21],"13":[104,56,11,22],"15":[63,52,9,19],"17":[62,46,14,25,-10],"19":[67,51,14,26,-15],"22":[94,61,18,20,40],"23":[82,40,17,25,-12],"24":[168,98,15,35],"25":[153,90,15,35],"27":[109,98,18,31],"28":[225,107,28,45],"29":[216,82,32,46,-25],"30":[66,91,20,26,-55],"32":[77,60,17,22,20],"33":[93,78,9,18],"34":[168,112,25,46],"35":[105,63,19,23,25]},"female":{"0":[97.5,59.5,8.6,20.9,0],"3":[147.8,58.5,13.3,20.9,35],"4":[77.4,50.9,10.5,18.1,0],"5":[94.5,59.4,13.3,17.1,15],"6":[86.5,57.5,9.5,20.9,0],"7":[111.9,55.7,10.5,20,0],"8":[77.4,56.7,13.3,20,0],"9":[102.1,53.7,12.4,20,0],"10":[90.5,55.7,14.3,18.1,15],"12":[97.4,50.9,9.5,20,0],"13":[70.6,50.9,10.5,20.9,0],"15":[110.4,61.2,14.4,30.3,0],"17":[48.4,40.4,13.3,23.8,-10],"19":[61.5,34.2,13.3,24.7,-15],"22":[156,86,20,25,25],"24":[53.9,67.4,8.9,20.9,0],"25":[62.4,60.5,8.9,20.9,0],"27":[36.6,64.6,10.7,18.5,0],"28":[56.5,48.2,10.6,17.1,0],"29":[75,39.7,12.2,17.5,-25],"30":[70.1,94.8,19,24.7,-55],"32":[81.8,57.6,16.2,20.9,20],"33":[91.5,63.1,8.6,17.1,0],"34":[54.5,49.4,9.5,17.5,0],"35":[67,59.5,18.1,21.9,25]}},"namedReferences":{"base:0":{"assetId":"03-leonardo-cappellani","bounds":[160,101,16,36],"region":[21,7,305,360],"nominal":354,"confidence":0.9895833333333334},"base:11":{"assetId":"04-gabriele-randazzo","bounds":[153,130,15,36],"region":[1154,678,291,403],"nominal":355,"confidence":1},"pugni:0":{"assetId":"03-leonardo-cappellani","bounds":[166,97,14,32],"region":[10,6,290,318],"nominal":313.5,"confidence":0.9120370370370371},"pugni:2":{"assetId":"04-gabriele-randazzo","bounds":[172,96,18,33],"region":[630,9,361,325],"nominal":322,"confidence":0.9682203389830508},"pugni:3":{"assetId":"01-marco-tabacco-collage","bounds":[165,94,13,34],"region":[960,11,286,326],"nominal":321.5,"confidence":0.8818181818181818},"pugni:4":{"assetId":"01-marco-tabacco-collage","bounds":[175,96,14,33],"region":[14,345,292,324],"nominal":321.5,"confidence":0.9068181818181819},"pugni:7":{"assetId":"08-andrea-vullo","bounds":[171,89,13,33],"region":[974,334,274,320],"nominal":315,"confidence":0.9513888888888888},"pugni:11":{"assetId":"03-leonardo-cappellani","bounds":[163,93,11,34],"region":[975,636,279,313],"nominal":313.5,"confidence":0.9716981132075472},"pugni:12":{"assetId":"03-leonardo-cappellani","bounds":[169,96,14,32],"region":[9,947,292,307],"nominal":313.5,"confidence":0.9074074074074074},"pugni:15":{"assetId":"03-leonardo-cappellani","bounds":[164,96,14,32],"region":[979,947,275,307],"nominal":313.5,"confidence":0.9351851851851852},"calci:0":{"assetId":"08-andrea-vullo","bounds":[101,84,14,29],"region":[57,8,177,316],"nominal":309.5,"confidence":0.9632352941176471},"calci:1":{"assetId":"01-marco-tabacco-collage","bounds":[100,81,13,32],"region":[317,19,298,304],"nominal":311,"confidence":0.9339622641509434},"calci:2":{"assetId":"01-marco-tabacco-collage","bounds":[104,76,14,30],"region":[629,53,366,272],"nominal":311,"confidence":0.9927884615384616},"calci:6":{"assetId":"01-marco-tabacco-collage","bounds":[100,81,13,29],"region":[663,338,342,319],"nominal":311,"confidence":0.8025},"calci:8":{"assetId":"08-andrea-vullo","bounds":[91,87,14,26],"region":[55,658,166,311],"nominal":309.5,"confidence":0.875},"calci:9":{"assetId":"01-marco-tabacco-collage","bounds":[117,75,14,31],"region":[311,663,305,315],"nominal":311,"confidence":0.9740566037735849},"calci:10":{"assetId":"04-gabriele-randazzo","bounds":[102,80,11,24],"region":[659,630,310,312],"nominal":301,"confidence":0.9941860465116279},"difesa:0":{"assetId":"08-andrea-vullo","bounds":[170,97,16,32],"region":[32,18,288,326],"nominal":321,"confidence":0.953125},"difesa:3":{"assetId":"04-gabriele-randazzo","bounds":[159,95,15,34],"region":[974,9,280,329],"nominal":326,"confidence":0.9035087719298246},"difesa:4":{"assetId":"09-andrea-barbagallo","bounds":[167,98,13,36],"region":[17,351,300,343],"nominal":339,"confidence":0.9780701754385965},"difesa:5":{"assetId":"01-marco-tabacco-collage","bounds":[100,84,9,29],"region":[390,325,178,337],"nominal":313,"confidence":0.8288043478260869},"difesa:6":{"assetId":"09-andrea-barbagallo","bounds":[114,81,14,34],"region":[678,358,316,331],"nominal":339,"confidence":0.9732142857142857},"difesa:7":{"assetId":"09-andrea-barbagallo","bounds":[168,100,12,35],"region":[970,351,282,340],"nominal":339,"confidence":0.9068181818181819},"difesa:8":{"assetId":"09-andrea-barbagallo","bounds":[161,98,11,34],"region":[25,691,295,314],"nominal":339,"confidence":0.9716981132075472},"difesa:11":{"assetId":"08-andrea-vullo","bounds":[153,98,15,33],"region":[978,659,266,324],"nominal":321,"confidence":0.953125},"difesa:15":{"assetId":"04-gabriele-randazzo","bounds":[120,101,12,29],"region":[991,953,231,298],"nominal":326,"confidence":0.9948979591836735},"pugni:8":{"assetId":"04-gabriele-randazzo","bounds":[169,97,14,31],"region":[16,645,290,312],"nominal":322,"confidence":0.8136792452830188},"calci:4":{"assetId":"03-leonardo-cappellani","bounds":[96,78,13,29],"region":[70,332,165,319],"nominal":306,"confidence":0.9425},"calci:15":{"assetId":"08-andrea-vullo","bounds":[94,77,13,28],"region":[1017,972,228,278],"nominal":309.5,"confidence":0.9923469387755102},"movimento:7":{"assetId":"04-gabriele-randazzo","bounds":[156,87,13,32],"region":[984,356,263,310],"nominal":339.5,"confidence":0.9481132075471698},"movimento:10":{"assetId":"03-leonardo-cappellani","bounds":[105,80,12,27],"region":[703,670,194,244],"nominal":343.5,"confidence":0.9973404255319149},"pugni:1":{"assetId":"04-gabriele-randazzo","bounds":[168,97,15,31],"region":[322,7,307,327],"nominal":322,"confidence":0.7430555555555556},"pugni:5":{"assetId":"04-gabriele-randazzo","bounds":[159,94,14,31],"region":[325,327,300,326],"nominal":322,"confidence":0.9976415094339622},"pugni:6":{"assetId":"04-gabriele-randazzo","bounds":[175,93,18,34],"region":[638,331,369,322],"nominal":322,"confidence":0.9895833333333334},"pugni:9":{"assetId":"04-gabriele-randazzo","bounds":[177,92,13,33],"region":[326,640,299,317],"nominal":322,"confidence":0.8518518518518519},"movimento:0":{"assetId":"04-gabriele-randazzo","bounds":[176,95,14,33],"region":[50,5,267,344],"nominal":339.5,"confidence":0.7931818181818182},"calci:3":{"assetId":"09-andrea-barbagallo","bounds":[105,93,14,29],"region":[1040,6,177,312],"nominal":307,"confidence":0.8480392156862745},"movimento:11":{"assetId":"08-andrea-vullo","bounds":[139,96,14,26],"region":[1003,725,215,259],"nominal":351,"confidence":0.7942708333333334},"movimento:15":{"assetId":"08-andrea-vullo","bounds":[168,80,17,27],"region":[958,1032,273,213],"nominal":351,"confidence":0.84375}}};
  function forFacing(canvas, facing) {
    if (facing !== -1 || !mirrorSources.has(canvas)) return canvas;
    if (mirrored.has(canvas)) return mirrored.get(canvas);
    const { left, top, patch } = mirrorSources.get(canvas);
    const result = document.createElement('canvas'); result.width = canvas.width; result.height = canvas.height;
    const context = result.getContext('2d'); context.drawImage(canvas, 0, 0); context.putImageData(patch, left, top);
    reports.set(result, reports.get(canvas)); mirrored.set(canvas, result); return result;
  }

  function arcadeOptions(gender, index, meta, border = 0) {
    const position = placementHints.arcade[gender]?.[index];
    const options = { nominal: meta.nominal, head: [meta.head[0] - meta.region[0] + border, meta.head[1] - meta.region[1] + border] };
    // Profile/rear silhouettes and poses with both forearms over the chest
    // deliberately have no placement. Never paint a logo on their shoulders.
    if (!position || [1, 2, 11, 14, 16, 18, 20, 21, 26, 30, 31].includes(index)) return { ...options, skip: true };
    if (gender === 'male' && index === 3) return { ...options, emblem: [151.5 + border, 59 + border, 10, 16], inkRegion: [148 + border, 61 + border, 17, 12], angle: 55 };
    return { ...options, emblem: [position[0] + border, position[1] + border, position[2], position[3]], add: gender === 'female', angle: position[4] || 0 };
  }

  function namedOptions(assetId, category, index, nominal) {
    // Maurizio wears a plain black Gōjū-ryū gi, not the dojo Kyokushin emblem.
    if (["12-maurizio-zappala", "16-gabriele-di-paola"].includes(assetId)) return { nominal, skip: true };
    const options = { nominal }, reference = placementHints.namedReferences[category + ':' + index];
    if (!reference || (category === 'pugni' && [6, 10, 14].includes(index)) || (category === 'calci' && index >= 12 && index < 15)) return options;
    const frame = global.KyokushinSpriteAtlas?.[assetId]?.[category]?.frames[index];
    if (!frame) return options;
    const [, , sw, sh] = frame.region, [x, y, w, h] = reference.bounds;
    const scale = nominal / reference.nominal, width = w * scale, height = h * scale;
    const cx = (x + w / 2) / reference.region[2] * sw, cy = (y + h / 2) / reference.region[3] * sh;
    const emblem = [cx - width / 2, cy - height / 2, width, height];
    return assetId === '02-gabriele-carbonaro' ? { nominal, emblem, add: true } : { nominal, fallbackEmblem: emblem };
  }

  global.GiBranding = Object.freeze({ load, apply, forFacing, arcadeOptions, namedOptions, detect, restoreInk, report: canvas => reports.get(canvas), get ready() { return !!logo; } });
})(typeof window !== 'undefined' ? window : globalThis);
