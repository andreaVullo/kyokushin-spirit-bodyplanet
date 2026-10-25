/* Small invitation entry point: no game assets, room membership or microphone access. */
(function (global) {
  'use strict';
  const PUBLIC_ENTRY = 'https://andreavullo.github.io/kyokushin-spirit-bodyplanet/online.html';
  const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  function entryBase(href) {
    try {
      const source = new URL(href);
      if (source.protocol === 'https:' || source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) return new URL('online.html', source);
    } catch (_) {}
    return new URL(PUBLIC_ENTRY);
  }
  function inviteURL(code, href) {
    const url = entryBase(href), normalized = String(code || '').trim().toUpperCase();
    if (normalized && !CODE.test(normalized)) throw new Error('Controlla il codice stanza.');
    if (normalized) url.searchParams.set('room', normalized);
    return url.href;
  }
  function readInvite(href) {
    let raw = '';
    try { raw = new URL(href).searchParams.get('room') || ''; } catch (_) {}
    const normalized = raw.trim().toUpperCase(), invalid = !!normalized && !CODE.test(normalized), code = invalid ? '' : normalized;
    const entry = inviteURL(code, href), game = new URL('Gioca.html', entry);
    game.searchParams.set('online', '1'); game.searchParams.set('fromInvite', '1'); game.searchParams.set('standalone', '1');
    if (code) game.searchParams.set('room', code);
    return { code, invalid, inviteURL: entry, gameURL: game.href };
  }
  function canUseOnline(scope = global) {
    let peer, channel;
    try {
      if (typeof scope.RTCPeerConnection !== 'function') return false;
      peer = new scope.RTCPeerConnection({ iceServers: [] });
      channel = peer.createDataChannel('dojo-capability-check');
      return !!channel;
    } catch (_) { return false; }
    finally { try { channel?.close(); } catch (_) {} try { peer?.close(); } catch (_) {} }
  }
  function browserContext(navigator = {}) {
    const ua = String(navigator.userAgent || ''), android = /Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua) || /Macintosh/i.test(ua) && Number(navigator.maxTouchPoints) > 1;
    // A hint for instructions only. Actual access is decided by the capability probe.
    const inApp = /Telegram|WhatsApp|FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(ua);
    return { android, ios, inApp };
  }
  function androidBrowserURL(gameURL, fallbackURL) {
    const game = new URL(gameURL), fallback = new URL(fallbackURL);
    if (game.protocol !== 'https:' || fallback.protocol !== 'https:') return null;
    return 'intent://' + game.host + game.pathname + game.search + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=' + encodeURIComponent(fallback.href) + ';end';
  }
  function mount(doc = global.document) {
    const root = doc?.getElementById('dojo-invite'); if (!root) return;
    const $ = id => doc.getElementById(id), info = readInvite(global.location.href), context = browserContext(global.navigator);
    const available = canUseOnline(global);
    $('invite-code').textContent = info.code;
    $('invite-room').hidden = !info.code;
    $('invite-title').textContent = info.code ? 'IL TUO AMICO TI ASPETTA.' : 'ENTRA NEL DOJO ONLINE.';
    $('invite-description').textContent = info.code ? 'La stanza è già selezionata. Scegli il tuo nome e il karateka, poi entra.' : 'Sfida un amico, cerca un avversario o allenatevi insieme.';
    $('invite-play').href = info.gameURL;
    $('invite-play').textContent = info.code ? 'ENTRA NELLA STANZA ↗' : 'GIOCA ONLINE ↗';
    $('invite-copy').hidden = false;
    $('invite-copy').addEventListener('click', async () => {
      try { await global.navigator.clipboard.writeText(info.inviteURL); $('invite-feedback').textContent = 'Invito copiato.'; }
      catch (_) { $('invite-feedback').textContent = info.code ? 'Il codice della stanza è ' + info.code + '.' : 'Usa Condividi dal menu di questa pagina.'; }
    });
    if (info.invalid) {
      $('invite-message').hidden = false;
      $('invite-message').textContent = 'Il codice nel link non è valido. Puoi aprire Online e inserire il codice ricevuto dal tuo amico.';
    }
    const help = $('invite-browser-help');
    if (context.ios) $('invite-browser-instructions').textContent = 'Nel menu ⋯ o Condividi di questa schermata scegli “Apri in Safari” oppure “Apri nel browser”. Ritroverai qui la tua stanza: non occorre riscrivere il codice.';
    else if (context.android) $('invite-browser-instructions').textContent = 'Premi “Apri nel browser”. Se l’app mantiene questa schermata, usa il suo menu ⋮ e scegli “Apri nel browser” o “Apri in Chrome”. Il codice rimane nel link.';
    else $('invite-browser-instructions').textContent = 'Dal menu dell’app scegli “Apri nel browser”. Il link conserva la stanza, senza dover riscrivere il codice.';
    if (context.android) {
      const browserURL = androidBrowserURL(info.gameURL, info.inviteURL);
      if (browserURL) { $('invite-browser').href = browserURL; $('invite-browser').hidden = false; }
    }
    if (!available) {
      $('invite-play').hidden = true;
      $('invite-message').hidden = false;
      $('invite-message').textContent = 'Questa schermata non permette il collegamento tra giocatori. Apri lo stesso invito nel browser del telefono.';
      help.open = true;
    } else if (context.inApp) help.open = true;
    $('invite-play').addEventListener('click', () => { $('invite-feedback').textContent = 'Apro il dojo…'; });
  }
  const api = { inviteURL, readInvite, canUseOnline, browserContext, androidBrowserURL, mount };
  global.DojoOnlineInvite = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
