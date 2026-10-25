/* Stage art is loaded only when a fight needs it; rounds share the same arena. */
(function(global, factory) {
  'use strict';
  const api = factory(global);
  global.DojoStages = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function(global) {
  'use strict';
  const list = Object.freeze([
    { id: 'dojo', name: 'Bodyplanet Dojo', location: 'Catania', src: 'assets/dojo-mirror.png', motes: true },
    { id: 'parco-gioeni', name: 'Parco Gioeni', location: 'Catania', src: 'assets/stages/parco-gioeni.webp' },
    { id: 'rifugio-gualberto', name: 'Rifugio San Giovanni Gualberto', location: 'Etna', src: 'assets/stages/rifugio-gualberto.webp' },
    { id: 'spiaggia-libera-3', name: 'Spiaggia libera n. 3', location: 'La Playa · Catania', src: 'assets/stages/spiaggia-libera-3.webp' },
    { id: 'anfiteatro-turi-ferro', name: 'Anfiteatro Turi Ferro', location: 'Gravina di Catania', src: 'assets/stages/anfiteatro-turi-ferro.webp' },
    { id: 'torneo-kyokushin', name: 'Torneo Kyokushin', location: 'Arena del torneo', src: 'assets/stages/torneo-kyokushin.webp' },
  ].map((stage, index) => Object.freeze({ ...stage, number: index + 1 })));
  const byId = new Map(list.map(stage => [stage.id, stage]));
  const isValid = id => typeof id === 'string' && byId.has(id);
  const isChoice = id => id === 'random' || isValid(id);
  const get = id => byId.get(id) || list[0];

  function createShuffleBag(options = {}) {
    const random = options.random || Math.random;
    let bag = [], previous = options.previous || null;
    return {
      next() {
        if (!bag.length) {
          bag = list.map(stage => stage.id);
          for (let i = bag.length - 1; i > 0; i--) {
            const sample = Number(random());
            const j = Math.floor(Math.max(0, Math.min(.999999999999, Number.isFinite(sample) ? sample : 0)) * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
          }
          // A new shuffle must not repeat the arena just left behind.
          if (bag.length > 1 && bag[0] === previous) [bag[0], bag[1]] = [bag[1], bag[0]];
        }
        previous = bag.shift();
        return previous;
      },
    };
  }

  function createLoader(options = {}) {
    const ImageClass = options.Image || global.Image;
    const resolve = options.resolve || (stage => stage.id === 'dojo' && global.__kyokushinAsset ? global.__kyokushinAsset(stage.src) : stage.src);
    const cache = new Map();
    function loadImage(stage) {
      if (cache.has(stage.id)) return cache.get(stage.id);
      const pending = (async () => {
        const image = new ImageClass();
        image.decoding = 'async';
        image.src = resolve(stage);
        await image.decode();
        if (!image.naturalWidth) throw new Error('Immagine arena non disponibile.');
        return { stage, image, fallback: false };
      })();
      cache.set(stage.id, pending);
      pending.catch(() => { if (cache.get(stage.id) === pending) cache.delete(stage.id); });
      return pending;
    }
    return {
      async load(id) {
        const stage = get(id);
        try { return await loadImage(stage); }
        catch(error) {
          if (stage.id === 'dojo') throw error;
          const fallback = await loadImage(list[0]);
          return { ...fallback, fallback: true, requestedId: stage.id };
        }
      },
    };
  }
  return Object.freeze({ list, get, isValid, isChoice, createShuffleBag, createLoader });
});
