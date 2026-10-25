/* Cache individual PNGs online; retain origin-clean data images for file://. */
(function (global) {
  'use strict';
  const scriptURL = document.currentScript.src;
  const names = ['attacks-angelo', 'attacks-samuel', 'dojo-mirror', 'fighters-angelo', 'fighters-samuel', 'guards', 'kyokushin-logo', 'motion-angelo', 'motion-samuel', 'portraits'];
  const assets = Object.freeze(Object.fromEntries(names.map(name => ['assets/' + name + '.png', new URL('../assets/core/' + name + '.png', scriptURL).href])));
  global.__kyokushinAsset = function (name) {
    if (!Object.prototype.hasOwnProperty.call(assets, name)) throw new Error('Risorsa del dojo mancante: ' + name);
    return global.__kyokushinOfflineAssets?.[name] || assets[name];
  };
  global.__kyokushinAssetsReady = global.location.protocol === 'file:' ? new Promise((resolve, reject) => {
    const source = document.createElement('script');
    const fail = () => reject(new Error('Non riesco a caricare le immagini offline. Mantieni le cartelle scripts e assets accanto al gioco.'));
    source.onload = () => {
      const valid=Object.keys(assets).every(name=>typeof global.__kyokushinOfflineAssets?.[name]==='string'&&global.__kyokushinOfflineAssets[name].startsWith('data:image/png;base64,')&&global.__kyokushinOfflineAssets[name].length>22);
      if(valid)resolve();else fail();
    };
    source.onerror = fail;
    source.src = new URL('../assets/core/offline.js', scriptURL).href;
    document.head.append(source);
  }) : Promise.resolve();
  global.__kyokushinAssetsReady.then(() => {
    for (const attribute of ['src', 'href']) document.querySelectorAll('[data-portable-' + attribute + ']').forEach(element => {
      element.setAttribute(attribute, global.__kyokushinAsset(element.getAttribute('data-portable-' + attribute)));
    });
  }, () => {}); // The game loader presents the actionable error.
})(window);
