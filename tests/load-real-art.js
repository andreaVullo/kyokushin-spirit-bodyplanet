/* Load only the production artwork stack, without the gameplay/UI bootstrap. */
window.loadRealFighterArt = async function () {
  // Run the exact current asset envelope and renderer code from Gioca. Avoid
  // the game UI bootstrap, audio, input handlers and online score service.
  const gameURL = new URL('../Gioca.html', location.href);
  const html = await fetch(gameURL, { cache: 'no-store' }).then(response => response.text());
  const gameDocument = new DOMParser().parseFromString(html, 'text/html');
  const allowed = /scripts\/(?:roster|game|strike-point|fighter-geometry|gi-branding|portrait-framing|karateka-atlas|karateka-art|arcade-atlas|arcade-art)\.js$/;
  const loaded = [];
  for (const node of gameDocument.querySelectorAll('script')) {
    const path = node.getAttribute('src');
    const inline = !path && (node.textContent.includes('const assets = Object.freeze') || node.textContent.includes('/* renderer.js */'));
    if (!inline && (!path || !allowed.test(path.split('?')[0]))) continue;
    const script = document.createElement('script');
    if (inline) { script.textContent = node.textContent; document.head.append(script); loaded.push(node.textContent.includes('/* renderer.js */') ? 'legacy-renderer' : 'asset-envelope'); }
    else {
      const url = new URL(path, gameURL); url.searchParams.set('audit', String(Date.now()));
      await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = () => reject(new Error('Non caricato: ' + path)); script.src = url; document.head.append(script); });
      loaded.push(path.split('?')[0]);
    }
  }
  return loaded;
};
