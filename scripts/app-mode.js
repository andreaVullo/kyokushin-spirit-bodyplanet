/* Home Screen web apps can hide Safari's bars; an in-page layout cannot. */
(function (global) {
  'use strict';
  const api = {
    installed(win = global) {
      return win.navigator?.standalone === true || ['standalone', 'fullscreen'].some(mode => win.matchMedia?.(`(display-mode: ${mode})`).matches);
    },
    appleMobile(win = global) {
      const nav = win.navigator || {};
      return /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    },
    needsHomeScreen(win = global, element = win.document?.documentElement) {
      if (api.installed(win) || !api.appleMobile(win)) return false;
      return !(element?.requestFullscreen || element?.webkitRequestFullscreen) ||
        (win.document?.fullscreenEnabled === false && win.document?.webkitFullscreenEnabled !== true);
    },
    installationURL(gameURL) {
      const source = new URL(gameURL), target = new URL('app.html', source);
      // Carry only invitation details, never arbitrary redirects or host flags.
      const room = source.searchParams.get('room');
      if (room && /^[a-z0-9-]{3,24}$/i.test(room)) target.searchParams.set('room', room);
      return target.href;
    },
  };
  global.DojoAppMode = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
