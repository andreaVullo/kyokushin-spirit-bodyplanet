/* Public room service. A localhost-only switch supports the two-browser preview. */
window.KYOKUSHIN_ONLINE_ENDPOINT = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('onlinePreview') === '1'
  ? 'http://127.0.0.1:8789' : 'https://kyokushin-dojo-classifica.flazio1.chatgpt.site';
