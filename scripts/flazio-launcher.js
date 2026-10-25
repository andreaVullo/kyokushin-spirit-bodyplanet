/* Kyokushin Spirit — Flazio adaptive launcher, onsite-dialog-v8.
 * The host alone rotates the iframe; its document receives landscape dimensions.
 * This file is also copied inline into the two Flazio pasteable fragments.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.install(root);
})(typeof window === 'undefined' ? null : window, function createAPI() {
  'use strict';
  var KEY = '__kyokushinFlazioLauncherV8';
  var DELEGATE = '__kyokushinFlazioDelegateV8';
  var LOADING = '__kyokushinFlazioBootstrapV8';
  var GAME = 'https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html';
  var VERSION = 'onsite-dialog-v8';
  var VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';
  function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
  function offset(value, maximum) { return Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0; }
  function measureViewport(win) {
    var doc = win.document.documentElement, vv = win.visualViewport;
    var layoutWidth = positive(doc.clientWidth, positive(win.innerWidth, 320));
    var layoutHeight = positive(win.innerHeight, positive(doc.clientHeight, 480));
    var width = layoutWidth, height = layoutHeight, left = 0, top = 0;
    // The visible viewport can lag a rotation/fullscreen change. Accept it only
    // when contained by the current layout; keyboard, browser chrome and pinch
    // zoom can legitimately change its aspect ratio. Old pan offsets must not
    // move a full-height overlay outside the new viewport after rotation.
    if (vv && positive(vv.width, 0) && positive(vv.height, 0) &&
        vv.width <= layoutWidth + 2 && vv.height <= layoutHeight + 2) {
      width = Math.min(layoutWidth, vv.width); height = Math.min(layoutHeight, vv.height);
      left = offset(vv.offsetLeft, layoutWidth - width); top = offset(vv.offsetTop, layoutHeight - height);
    }
    return { width: width, height: height, left: left, top: top };
  }
  function computeFrameLayout(viewport, safe, requested) {
    safe = safe || {};
    var w = positive(viewport.width, 320), h = positive(viewport.height, 480);
    var top = Math.max(0, Math.min(safe.top || 0, h / 4));
    var right = Math.max(0, Math.min(safe.right || 0, w / 4));
    var bottom = Math.max(0, Math.min(safe.bottom || 0, h / 4));
    var left = Math.max(0, Math.min(safe.left || 0, w / 4));
    var bar = 44, usableWidth = Math.max(1, w - left - right);
    var usableHeight = Math.max(1, h - top - bottom - bar);
    // Hardware orientation and screen.orientation are intentionally irrelevant:
    // the browser viewport continues to be portrait with the OS rotation lock.
    var rotated = !!requested && usableWidth < usableHeight;
    return { width: rotated ? usableHeight : usableWidth,
      height: rotated ? usableWidth : usableHeight, rotated: rotated,
      left: left, top: top + bar, stageWidth: usableWidth, stageHeight: usableHeight,
      toolbarTop: top, toolbarLeft: left, toolbarWidth: usableWidth,
      transform: rotated ? 'translateX(' + usableWidth + 'px) rotate(90deg)' : 'none',
      safeArea: { top: top, right: right, bottom: bottom, left: left } };
  }
  function trusted(event, frame, origin) {
    return !!frame && event.source === frame.contentWindow && event.origin === origin &&
      !!event.data && typeof event.data === 'object';
  }
  function findHostWindow(win) {
    // Flazio's HTML components execute inside small same-origin iframes. The
    // game overlay must belong to the site, not to that component's viewport.
    try { if (win.top && win.top.document && win.top.document.documentElement) return win.top; }
    catch (_) { /* Cross-origin parents are outside this launcher's authority. */ }
    return win;
  }
  function bootstrapHost(host, sourceScript, gameUrl) {
    if (host[KEY]) return host[KEY];
    var doc = host.document, script = doc.createElement('script');
    var nonce = sourceScript && (sourceScript.nonce || sourceScript.getAttribute('nonce'));
    if (nonce) script.setAttribute('nonce', nonce);
    // Passing top to a function created in the component does not move that
    // function into top's realm. The entire factory must execute in the host:
    // otherwise callbacks can stop when Flazio navigates/recreates its iframe,
    // and postMessage may identify that component as the sender instead of top.
    script.textContent = '(' + createAPI.toString() + ')().install(window,' +
      JSON.stringify({ gameUrl: gameUrl, hostOnly: true }) + ');';
    try { doc.head.appendChild(script); } catch (_) {} finally { script.remove(); }
    if (host[KEY]) return host[KEY];
    // An external fragment can still bootstrap when CSP disallows inline code.
    // Its script runs in the host realm too; never fall back to a child-owned
    // controller. A repeated component installation shares this pending load.
    if (sourceScript && sourceScript.src && !host[LOADING]) {
      var external = doc.createElement('script');
      external.src = sourceScript.src; external.async = true;
      external.setAttribute('data-game-url', gameUrl);
      external.setAttribute('data-kyokushin-host-only', 'true');
      if (nonce) external.setAttribute('nonce', nonce);
      external.addEventListener('error', function () {
        if (host[LOADING] === external) { delete host[LOADING]; external.remove(); }
      });
      host[LOADING] = external; doc.head.appendChild(external);
    }
    return null;
  }
  function createLauncher(win, options) {
    options = options || {};
    var doc = win.document, root = doc.documentElement;
    var url = new URL(options.gameUrl || GAME, doc.baseURI || win.location.href);
    url.searchParams.set('embed', '1'); url.searchParams.set('hostdisplay', '1');
    var origin = url.origin, dialog, frame, toolbar, stage, loading, retry, label, probe, observer;
    var opened = false, requested = false, attempt = 0, raf = 0, timer = 0;
    var fullscreenRequest = null, ownsFullscreen = false, exitingFullscreen = false;
    var cleanup = [], restore = [], timers = [], pageStyles = [], pageMetas = [];
    var previousFocus = null, scroll = null, state = null;
    function listen(target, name, fn, opts) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(name, fn, opts); cleanup.push(function () { target.removeEventListener(name, fn, opts); });
    }
    function keepStyle(element, property, value) {
      var entry = { element: element, property: property, value: value,
        old: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
      pageStyles.push(entry);
      restore.push(function () { if (entry.old) element.style.setProperty(property, entry.old, entry.priority); else element.style.removeProperty(property); });
      element.style.setProperty(property, value, 'important');
    }
    function keepViewport(meta) {
      var entry = { element: meta, content: meta.getAttribute('content') };
      pageMetas.push(entry);
      restore.push(function () { if (entry.content === null) meta.removeAttribute('content'); else meta.setAttribute('content', entry.content); });
      meta.setAttribute('content', VIEWPORT);
    }
    function enforcePage() {
      if (!opened) return false;
      var changed = false;
      // Adaptive builders can recalculate these properties after every resize.
      // Keep the overlay in CSS pixels for the whole session, while retaining
      // the site's newest values so closing it restores the current orientation.
      pageStyles.forEach(function (entry) {
        var value = entry.element.style.getPropertyValue(entry.property);
        var priority = entry.element.style.getPropertyPriority(entry.property);
        if (value === entry.value && priority === 'important') return;
        entry.old = value; entry.priority = priority;
        entry.element.style.setProperty(entry.property, entry.value, 'important'); changed = true;
      });
      var metas = Array.prototype.slice.call(doc.querySelectorAll('meta[name="viewport"]'));
      if (!metas.length) {
        var meta = doc.createElement('meta'); meta.name = 'viewport'; doc.head.appendChild(meta);
        restore.push(function () { meta.remove(); }); metas.push(meta);
      }
      metas.forEach(function (meta) {
        var entry = pageMetas.filter(function (item) { return item.element === meta; })[0];
        if (!entry) { keepViewport(meta); changed = true; return; }
        var content = meta.getAttribute('content');
        if (content === VIEWPORT) return;
        entry.content = content; meta.setAttribute('content', VIEWPORT); changed = true;
      });
      return changed;
    }
    function setStyles(element, values) { Object.keys(values).forEach(function (key) { element.style.setProperty(key, values[key], 'important'); }); }
    function button(text, action) {
      var b = doc.createElement('button'); b.type = 'button'; b.textContent = text;
      b.addEventListener('click', action); return b;
    }
    function send(message) { if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, origin); }
    function report(requestId) {
      if (!opened || !state) return;
      var message = { type: 'kyokushin:display-state', managed: true, landscapeRequested: requested,
        rotated: state.rotated, viewport: { width: state.width, height: state.height },
        // Insets are already consumed outside the iframe, so the child must not
        // apply them a second time, including when this iframe is rotated.
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, hostSafeArea: state.safeArea,
        safeAreaApplied: true, version: VERSION };
      if (Number.isSafeInteger(requestId) && requestId >= 0) message.requestId = requestId;
      send(message);
    }
    function readSafeArea() {
      var computed = win.getComputedStyle(probe);
      return { top: parseFloat(computed.paddingTop) || 0, right: parseFloat(computed.paddingRight) || 0,
        bottom: parseFloat(computed.paddingBottom) || 0, left: parseFloat(computed.paddingLeft) || 0 };
    }
    function layout(requestId) {
      if (!opened) return;
      enforcePage();
      var viewport = measureViewport(win); state = computeFrameLayout(viewport, readSafeArea(), requested);
      setStyles(dialog, { left: viewport.left + 'px', top: viewport.top + 'px', width: viewport.width + 'px', height: viewport.height + 'px' });
      setStyles(toolbar, { left: state.toolbarLeft + 'px', top: state.toolbarTop + 'px', width: state.toolbarWidth + 'px' });
      setStyles(stage, { left: state.left + 'px', top: state.top + 'px', width: state.stageWidth + 'px', height: state.stageHeight + 'px' });
      if (frame) setStyles(frame, { width: state.width + 'px', height: state.height + 'px', transform: state.transform });
      dialog.dataset.rotated = String(state.rotated); dialog.dataset.landscape = String(requested);
      label.textContent = requested ? 'Vista automatica' : 'Gioca in orizzontale';
      label.setAttribute('aria-pressed', String(requested)); report(requestId);
    }
    function schedule() {
      if (!opened || raf) return;
      raf = win.requestAnimationFrame(function () { raf = 0; layout(); });
    }
    function resized() {
      schedule();
      // iOS, browser chrome and native fullscreen finish at different moments.
      timers.forEach(win.clearTimeout); timers = [60, 220, 600].map(function (delay) { return win.setTimeout(schedule, delay); });
    }
    function build() {
      if (dialog) return;
      var css = doc.createElement('style'); css.id = 'kyokushin-host-style-v6';
      var interactionCSS = '#kyokushin-host-v6[open],#kyokushin-host-v6[open] *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-user-drag:none!important}';
      css.textContent = '#kyokushin-host-v6{position:fixed!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;box-sizing:border-box!important;background:#080d0c!important;color:#fff!important;overflow:hidden!important;z-index:2147483647!important;transform:none!important;zoom:1!important;font:14px system-ui,sans-serif!important;overscroll-behavior:none!important;touch-action:manipulation!important}#kyokushin-host-v6::backdrop{background:#080d0c!important}#kyokushin-host-v6 [data-host-toolbar]{position:absolute!important;height:44px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:4px 8px!important;box-sizing:border-box!important;background:#080d0c!important;z-index:2!important}#kyokushin-host-v6 button{box-sizing:border-box!important;min-height:36px!important;border:1px solid #5d7067!important;border-radius:7px!important;padding:5px 12px!important;font:600 13px system-ui,sans-serif!important;line-height:1.2!important;background:#17251f!important;color:#fff!important;cursor:pointer!important;touch-action:manipulation!important}#kyokushin-host-v6 button:focus-visible{outline:3px solid #f1ca80!important;outline-offset:1px!important}#kyokushin-host-v6 [data-host-stage]{position:absolute!important;overflow:hidden!important;background:#080d0c!important}#kyokushin-host-v6 iframe{position:absolute!important;left:0!important;top:0!important;margin:0!important;padding:0!important;border:0!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;transform-origin:0 0!important;display:block!important;background:#080d0c!important;opacity:0;pointer-events:none}#kyokushin-host-v6[data-ready="true"] iframe{opacity:1!important;pointer-events:auto!important}#kyokushin-host-v6 [data-host-loading]{position:absolute!important;inset:0!important;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif!important;color:#fff!important;background:#080d0c!important}#kyokushin-host-v6[data-ready="true"] [data-host-loading]{display:none!important}[data-kyokushin-open]{display:inline-flex;align-items:center;justify-content:center;padding:16px 26px;border:1px solid #bfa273;border-radius:12px;background:#17251f;color:#fff;font:700 16px system-ui,sans-serif;cursor:pointer;max-width:100%;box-sizing:border-box}';
      css.textContent += interactionCSS;
      doc.head.appendChild(css);
      dialog = doc.createElement('dialog'); dialog.id = 'kyokushin-host-v6';
      dialog.setAttribute('aria-label', 'Kyokushin Spirit'); dialog.setAttribute('aria-modal', 'true');
      toolbar = doc.createElement('div'); toolbar.setAttribute('data-host-toolbar', '');
      label = button('Gioca in orizzontale', function () { requested = !requested; if (!requested) { attempt++; exitNative(); } layout(); if (requested) nativeFullscreen(); });
      toolbar.appendChild(label); toolbar.appendChild(button('Chiudi ×', close));
      stage = doc.createElement('div'); stage.setAttribute('data-host-stage', '');
      loading = doc.createElement('div'); loading.setAttribute('data-host-loading', ''); loading.setAttribute('role', 'status'); loading.setAttribute('aria-live', 'polite');
      var title = doc.createElement('strong'); title.textContent = 'Caricamento del dojo…'; loading.appendChild(title);
      var detail = doc.createElement('p'); detail.textContent = 'Preparo il tatami, i karateka e le tecniche.'; loading.appendChild(detail);
      retry = button('Riprova', function () { loadFrame(); }); retry.hidden = true; loading.appendChild(retry);
      stage.appendChild(loading); dialog.appendChild(toolbar); dialog.appendChild(stage);
      probe = doc.createElement('div'); probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      dialog.appendChild(probe); dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
      root.appendChild(dialog);
    }
    function preparePage() {
      scroll = { x: win.scrollX, y: win.scrollY }; previousFocus = doc.activeElement;
      enforcePage();
      [root, doc.body].forEach(function (node) {
        if (!node) return;
        ['zoom', 'transform', 'perspective', 'filter'].forEach(function (prop) { keepStyle(node, prop, prop === 'zoom' ? '1' : 'none'); });
        keepStyle(node, 'overflow', 'hidden'); keepStyle(node, 'overscroll-behavior', 'none');
        keepStyle(node, 'min-width', '0'); keepStyle(node, 'max-width', 'none');
        keepStyle(node, 'width', 'auto'); keepStyle(node, 'background-color', '#080d0c');
      });
    }
    function loadFrame() {
      if (!opened) return;
      win.clearTimeout(timer); dialog.dataset.ready = 'false'; retry.hidden = true;
      loading.querySelector('strong').textContent = 'Caricamento del dojo…';
      loading.querySelector('p').textContent = 'Preparo il tatami, i karateka e le tecniche.';
      if (frame) frame.remove();
      frame = doc.createElement('iframe'); frame.title = 'Kyokushin Spirit — BodyPlanet Dojo';
      frame.allow = 'fullscreen; autoplay'; frame.setAttribute('allowfullscreen', ''); frame.setAttribute('scrolling', 'no');
      frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.src = url.href;
      frame.addEventListener('load', function () { layout(); send({ type: 'kyokushin:boot-request' }); });
      stage.insertBefore(frame, loading); layout();
      timer = win.setTimeout(function () {
        if (!opened || dialog.dataset.ready === 'true') return;
        loading.querySelector('p').textContent = 'Il caricamento sta impiegando più tempo. Puoi attendere oppure riprovare.'; retry.hidden = false;
      }, 25000);
    }
    function message(event) {
      if (!opened || !trusted(event, frame, origin)) return;
      var data = event.data;
      if (data.type === 'kyokushin:boot') {
        if (data.state === 'ready') { win.clearTimeout(timer); dialog.dataset.ready = 'true'; report(); frame.focus(); }
        else if (data.state === 'error') {
          win.clearTimeout(timer); loading.querySelector('strong').textContent = 'Il dojo non si è caricato';
          loading.querySelector('p').textContent = 'Controlla la connessione e riprova.'; retry.hidden = false;
        }
      } else if (data.type === 'kyokushin:display') {
        if (data.action === 'landscape') { requested = true; layout(data.requestId); }
        else if (data.action === 'exit') { requested = false; attempt++; layout(data.requestId); exitNative(); }
        else if (data.action === 'close') close();
        else if (data.action === 'sync') layout(data.requestId);
      }
    }
    function exitNative() {
      // Never exit fullscreen entered by the surrounding site or another app.
      if (!ownsFullscreen || doc.fullscreenElement !== root || !doc.exitFullscreen || exitingFullscreen) return;
      exitingFullscreen = true; ownsFullscreen = false;
      try { Promise.resolve(doc.exitFullscreen()).then(function () {
        exitingFullscreen = false;
      }, function () { exitingFullscreen = false; }); } catch (_) { exitingFullscreen = false; }
    }
    function raiseDialog() {
      if (!opened || !dialog) return;
      var focused = doc.activeElement;
      var restoreFocus = focused && dialog.contains(focused) && focused.isConnected;
      // Fullscreen moves the root to the end of the top layer. Reinsert the
      // existing dialog above it; no iframe or running game is recreated.
      try {
        if (dialog.showModal) { if (dialog.open) dialog.close(); dialog.showModal(); }
        else dialog.setAttribute('open', '');
      } catch (_) { dialog.setAttribute('open', ''); }
      if (restoreFocus && focused.focus) focused.focus({ preventScroll: true });
    }
    function fullscreenChanged() {
      if (doc.fullscreenElement !== root) ownsFullscreen = false;
      if (opened && doc.fullscreenElement === root && (ownsFullscreen || fullscreenRequest)) raiseDialog();
      resized();
    }
    function nativeFullscreen() {
      // requestFullscreen on a <dialog> is prohibited by the Fullscreen spec.
      // The root is a valid target; the modal is then raised above that root.
      if (!opened || !requested || fullscreenRequest || !root.requestFullscreen || doc.fullscreenElement) return;
      var request = { token: attempt }; fullscreenRequest = request;
      try { Promise.resolve(root.requestFullscreen()).then(function () {
        if (fullscreenRequest === request) fullscreenRequest = null;
        if (doc.fullscreenElement === root) ownsFullscreen = true;
        // A late completion follows the latest user's intent. A newer reopen
        // wants fullscreen too; an intervening exit/close must never revive it.
        if (!opened || !requested) exitNative(); else { raiseDialog(); resized(); }
      }, function () {
        if (fullscreenRequest === request) fullscreenRequest = null;
        if (opened) resized();
      }); } catch (_) { if (fullscreenRequest === request) fullscreenRequest = null; resized(); }
    }
    function open() {
      if (opened) { requested = true; layout(); return; }
      build(); opened = true; requested = true; attempt++; preparePage();
      // Root attachment and the top layer escape Flazio's scaled component tree.
      if (dialog.parentNode !== root) root.appendChild(dialog);
      try { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); }
      catch (_) { dialog.setAttribute('open', ''); }
      // Protect only this modal's chrome. The cross-origin game owns its own
      // interaction policy; normal page selection resumes as soon as we close.
      // Do not cancel pointer/touch presses: toolbar clicks, focus and assistive
      // activation must still reach their controls.
      ['selectstart', 'dragstart', 'contextmenu'].forEach(function (type) {
        listen(dialog, type, function (event) {
          if (opened && event.cancelable !== false) event.preventDefault();
        }, true);
      });
      listen(win, 'message', message); listen(win, 'resize', resized); listen(win, 'orientationchange', resized);
      listen(win.visualViewport, 'resize', resized); listen(win.visualViewport, 'scroll', schedule);
      listen(doc, 'fullscreenchange', fullscreenChanged); listen(win.screen && win.screen.orientation, 'change', resized);
      listen(win, 'pagehide', close);
      if (win.MutationObserver) {
        observer = new win.MutationObserver(function () {
          if (!opened) return;
          var changed = enforcePage();
          if (!dialog.isConnected) { root.appendChild(dialog); try { if (dialog.showModal) { if (dialog.open) dialog.close(); dialog.showModal(); } } catch (_) {} changed = true; }
          if (changed) resized();
        });
        observer.observe(root, { childList: true, attributes: true, attributeFilter: ['style'] });
        if (doc.body) observer.observe(doc.body, { attributes: true, attributeFilter: ['style'] });
        observer.observe(doc.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['name', 'content'] });
      }
      loadFrame(); resized(); nativeFullscreen();
    }
    function close() {
      if (!opened) return;
      opened = false; requested = false; attempt++;
      exitNative(); if (observer) { observer.disconnect(); observer = null; }
      cleanup.splice(0).forEach(function (fn) { fn(); });
      win.clearTimeout(timer); timers.splice(0).forEach(win.clearTimeout);
      if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
      if (frame) { frame.remove(); frame = null; }
      if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
      restore.splice(0).reverse().forEach(function (fn) { fn(); });
      pageStyles = []; pageMetas = [];
      if (scroll) win.scrollTo(scroll.x, scroll.y);
      if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus({ preventScroll: true });
      state = null;
    }
    return { open: open, close: close, layout: layout, version: VERSION,
      getState: function () { return { opened: opened, landscapeRequested: requested, layout: state, frame: frame }; } };
  }
  function install(win, options) {
    if (!win || !win.document) return null;
    var doc = win.document, script = doc.currentScript;
    var host = findHostWindow(win), launcher = host[KEY];
    if (!launcher) {
      var gameUrl = options && options.gameUrl || script && script.getAttribute('data-game-url');
      var absoluteGameUrl = new URL(gameUrl || GAME, doc.baseURI || win.location.href).href;
      if (host !== win) launcher = bootstrapHost(host, script, absoluteGameUrl);
      else {
        launcher = host[KEY] = createLauncher(host, { gameUrl: absoluteGameUrl });
        host.KyokushinLauncher = launcher; delete host[LOADING];
      }
    }
    if (launcher) win.KyokushinLauncher = launcher;
    if (options && options.hostOnly || script && script.getAttribute('data-kyokushin-host-only') === 'true') return launcher;
    if (!doc[DELEGATE]) {
      doc[DELEGATE] = true;
      doc.addEventListener('click', function (event) {
        var target = event.target && event.target.closest && event.target.closest('[data-kyokushin-open]');
        // Call directly from the trusted click: delaying the host call would
        // lose the user activation required by native fullscreen on phones.
        if (target) {
          event.preventDefault(); var current = host[KEY];
          if (current) { win.KyokushinLauncher = current; current.open(); }
          else {
            var notice = doc.querySelector('[data-kyokushin-launch-error]');
            if (!notice) { notice = doc.createElement('p'); notice.setAttribute('data-kyokushin-launch-error', ''); notice.setAttribute('role', 'status'); target.parentNode.appendChild(notice); }
            notice.textContent = host[LOADING] ? 'Il gioco si sta caricando. Riprova tra un momento.' : 'Il sito non consente di avviare il gioco. Ricarica la pagina e riprova.';
          }
        }
      });
    }
    // Flazio may execute the fragment again after recreating its components.
    // Only its small launch button is mounted there; the running game stays out.
    var mount = script && script.parentNode !== doc.head ? script.parentNode : doc.querySelector('[data-kyokushin-launcher]');
    if (!mount) mount = doc.body || doc.documentElement;
    if (!mount.querySelector('[data-kyokushin-open]')) {
      var button = doc.createElement('button'); button.type = 'button'; button.setAttribute('data-kyokushin-open', ''); button.textContent = 'Entra nel dojo';
      button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:16px 26px;border:1px solid #bfa273;border-radius:12px;background:#17251f;color:#fff;font:700 16px system-ui,sans-serif;cursor:pointer;max-width:100%;box-sizing:border-box';
      mount.insertBefore(button, script && script.parentNode === mount ? script : null);
    }
    return launcher;
  }
  return { install: install, createLauncher: createLauncher, measureViewport: measureViewport,
    computeFrameLayout: computeFrameLayout, trusted: trusted, findHostWindow: findHostWindow, version: VERSION };
});
