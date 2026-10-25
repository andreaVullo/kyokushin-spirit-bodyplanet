'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createLauncher, computeFrameLayout, measureViewport, trusted, install } = require('../scripts/flazio-launcher.js');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, extra = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, ...extra }); }
}
class Style {
  constructor() { this.values = new Map(); }
  getPropertyValue(key) { return this.values.get(key)?.value || ''; }
  getPropertyPriority(key) { return this.values.get(key)?.priority || ''; }
  setProperty(key, value, priority) { this.values.set(key, { value, priority: priority || '' }); }
  removeProperty(key) { this.values.delete(key); }
}
class Element extends Events {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.style = new Style(); this.attrs = new Map(); this.dataset = {};
    if (tag === 'iframe') this.contentWindow = { messages: [], postMessage(data, origin) { this.messages.push({ data, origin }); } };
  }
  appendChild(el) { return this.insertBefore(el, null); }
  insertBefore(el, before) { el.remove(); el.parentNode = this; const i = this.children.indexOf(before); this.children.splice(i < 0 ? this.children.length : i, 0, el); if (el.tagName === 'SCRIPT' && el.textContent && this.doc.context && !this.doc.blockInlineScripts) vm.runInContext(el.textContent, this.doc.context); return el; }
  remove() { if (this.parentNode) { const list = this.parentNode.children; list.splice(list.indexOf(this), 1); this.parentNode = null; } }
  setAttribute(k, v) { this.attrs.set(k, v); if (k === 'open') this.open = true; }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); if (k === 'open') this.open = false; }
  matches(s) { return s === this.tagName.toLowerCase() || s === '[data-kyokushin-open]' && this.attrs.has('data-kyokushin-open') || s === '[data-kyokushin-launcher]' && this.attrs.has('data-kyokushin-launcher') || s === 'meta[name="viewport"]' && this.tagName === 'META' && this.name === 'viewport'; }
  querySelectorAll(s) { return this.children.flatMap(n => [...(n.matches(s) ? [n] : []), ...n.querySelectorAll(s)]); }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  get isConnected() { return this === this.doc.documentElement || !!this.parentNode?.isConnected; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  showModal() { this.open = true; this.modalCount = (this.modalCount || 0) + 1; }
  close() { this.open = false; this.closeCount = (this.closeCount || 0) + 1; }
  focus() { this.doc.activeElement = this; }
}
function environment(width = 390, height = 844) {
  const win = new Events(), doc = new Events(), pending = new Map(); let next = 0;
  doc.createElement = tag => new Element(tag, doc); doc.documentElement = doc.createElement('html');
  doc.documentElement.clientWidth = width; doc.documentElement.clientHeight = height;
  doc.head = doc.createElement('head'); doc.body = doc.createElement('body');
  doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  doc.querySelectorAll = s => doc.documentElement.querySelectorAll(s); doc.querySelector = s => doc.documentElement.querySelector(s);
  doc.baseURI = 'http://127.0.0.1:8765/tests/flazio-host.html';
  const meta = doc.createElement('meta'); meta.name = 'viewport'; meta.setAttribute('content', 'width=1200'); doc.head.appendChild(meta);
  doc.body.style.setProperty('zoom', '0.4'); doc.body.style.setProperty('transform', 'scale(.5)', 'important');
  Object.assign(win, { document: doc, innerWidth: width, innerHeight: height, scrollX: 31, scrollY: 420,
    location: { href: doc.baseURI }, screen: { orientation: new Events() }, visualViewport: Object.assign(new Events(), { width, height, scale: 1, offsetTop: 0, offsetLeft: 0 }),
    getComputedStyle: () => ({ paddingTop: '0', paddingRight: '0', paddingBottom: '0', paddingLeft: '0' }),
    setTimeout: fn => { pending.set(++next, fn); return next; }, clearTimeout: id => pending.delete(id),
    requestAnimationFrame: fn => { pending.set(++next, fn); return next; }, cancelAnimationFrame: id => pending.delete(id),
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
    MutationObserver: class { constructor(fn) { this.callback = fn; win.observer = this; } observe(node, options) { (this.observed ||= []).push({ node, options }); } disconnect() { this.disconnected = true; } }
  });
  doc.context = vm.createContext({ window: win, URL, console });
  return { win, doc, meta, pending, launcher: createLauncher(win, { gameUrl: '../Gioca.html' }),
    resize(w, h) { win.innerWidth = doc.documentElement.clientWidth = win.visualViewport.width = w; win.innerHeight = doc.documentElement.clientHeight = win.visualViewport.height = h; } };
}

test('all phone shapes fit landscape in portrait even with hardware rotation locked', () => {
  for (const [width, height] of [[320,568],[360,640],[375,667],[390,844],[412,915],[430,932],[768,1024],[820,1180]]) {
    for (const requested of [true, false]) {
      const l = computeFrameLayout({ width, height }, { top: 47, right: 0, bottom: 34, left: 0 }, requested);
      assert.equal(l.rotated, requested);
      assert.equal(l.stageWidth, width); assert.equal(l.stageHeight, height - 47 - 34 - 44);
      assert.equal(l.width, requested ? l.stageHeight : l.stageWidth);
      assert.equal(l.height, requested ? l.stageWidth : l.stageHeight);
      assert.equal(l.left + l.stageWidth, width); assert.ok(l.top + l.stageHeight <= height - 34);
    }
  }
});
test('an available landscape area is never rotated twice', () => {
  for (const [width, height] of [[568,320],[844,390],[915,412],[1024,768],[2560,1080]]) {
    const l = computeFrameLayout({ width, height }, { left: 47, right: 47, bottom: 21 }, true);
    assert.equal(l.rotated, false); assert.equal(l.transform, 'none'); assert.equal(l.width, width - 94);
  }
});
test('near-square and asymmetric safe areas choose rotation after subtracting the toolbar and insets', () => {
  const squareish = computeFrameLayout({ width: 500, height: 520 }, {}, true);
  assert.equal(squareish.rotated, false); assert.equal(squareish.width, 500); assert.equal(squareish.height, 476);
  for (const viewport of [{width:500,height:520},{width:720,height:720},{width:580,height:400}]) {
    for (const safe of [{},{top:47,bottom:34},{left:180,right:180},{left:80,right:40,top:15,bottom:30}]) {
      const l = computeFrameLayout(viewport, safe, true);
      assert.equal(l.rotated, l.stageWidth < l.stageHeight);
      assert.ok(l.width >= l.height, JSON.stringify({viewport,safe,l}));
    }
  }
});
test('viewport uses visible browser area, offsets and handles stale rotation values', () => {
  const { win, doc } = environment();
  win.visualViewport.height = 730; assert.equal(measureViewport(win).height, 730);
  win.visualViewport.offsetTop = 12; assert.equal(measureViewport(win).top, 12);
  doc.documentElement.clientWidth = win.innerWidth = 844; win.innerHeight = 390;
  assert.deepEqual(measureViewport(win), { width: 844, height: 390, left: 0, top: 0 });
  win.visualViewport.scale = 2; win.visualViewport.width = 195; win.visualViewport.height = 365;
  assert.equal(measureViewport(win).width, 195);
});
test('postMessage must come from both the current iframe window and exact game origin', () => {
  const frame = { contentWindow: {} }, data = { type: 'kyokushin:display', action: 'landscape' };
  assert.equal(trusted({ data, source: frame.contentWindow, origin: 'https://andreavullo.github.io' }, frame, 'https://andreavullo.github.io'), true);
  assert.equal(trusted({ data, source: {}, origin: 'https://andreavullo.github.io' }, frame, 'https://andreavullo.github.io'), false);
  assert.equal(trusted({ data, source: frame.contentWindow, origin: 'https://evil.example' }, frame, 'https://andreavullo.github.io'), false);
});
test('same live iframe survives both orientations and Flazio component replacement', () => {
  const { launcher, win, doc, resize } = environment(); launcher.open();
  const frame = launcher.getState().frame, overlay = frame.parentNode.parentNode;
  assert.equal(launcher.getState().layout.rotated, true); assert.equal(overlay.parentNode, doc.documentElement);
  resize(844, 390); launcher.layout(); assert.equal(launcher.getState().layout.rotated, false);
  resize(390, 844); launcher.layout(); assert.equal(launcher.getState().frame, frame);
  overlay.remove(); win.observer.callback(); assert.equal(overlay.parentNode, doc.documentElement); assert.equal(launcher.getState().frame, frame);
  assert.match(frame.src, /embed=1&hostdisplay=1/);
  launcher.close();
});
test('host acknowledgement, exit and ready messages reject untrusted senders', () => {
  const { launcher, win } = environment(); launcher.open(); const { frame } = launcher.getState();
  const post = data => win.dispatch('message', { data, source: frame.contentWindow, origin: 'http://127.0.0.1:8765' });
  win.dispatch('message', { data: { type: 'kyokushin:display', action: 'exit' }, source: {}, origin: 'http://127.0.0.1:8765' });
  assert.equal(launcher.getState().landscapeRequested, true);
  post({ type: 'kyokushin:display', action: 'exit' }); assert.equal(launcher.getState().landscapeRequested, false);
  post({ type: 'kyokushin:display', action: 'landscape', requestId: 8 }); assert.equal(launcher.getState().landscapeRequested, true);
  const ack = frame.contentWindow.messages.at(-1);
  assert.equal(ack.data.managed, true); assert.equal(ack.data.rotated, true); assert.equal(ack.data.requestId, 8); assert.equal(ack.origin, 'http://127.0.0.1:8765');
  launcher.layout(); assert.equal('requestId' in frame.contentWindow.messages.at(-1).data, false);
  post({ type: 'kyokushin:boot', state: 'ready' }); assert.equal(frame.parentNode.parentNode.dataset.ready, 'true');
  post({ type: 'kyokushin:display', action: 'close' }); assert.equal(launcher.getState().opened, false);
});
test('closing exactly restores adaptive styles, viewport metadata, scroll and listeners', () => {
  const { launcher, win, doc, meta, pending } = environment(); const count = () => [...win.listeners.values()].reduce((n, set) => n + set.size, 0);
  launcher.open(); assert.equal(doc.body.style.getPropertyValue('zoom'), '1'); assert.match(meta.getAttribute('content'), /device-width/);
  win.scrollY = 0; const frame = launcher.getState().frame; launcher.close();
  assert.equal(doc.body.style.getPropertyValue('zoom'), '0.4'); assert.equal(doc.body.style.getPropertyValue('transform'), 'scale(.5)');
  assert.equal(doc.body.style.getPropertyPriority('transform'), 'important'); assert.equal(meta.getAttribute('content'), 'width=1200');
  assert.equal(win.scrollY, 420); assert.equal(win.scrollX, 31); assert.equal(count(), 0); assert.equal(pending.size, 0);
  assert.equal(frame.isConnected, false); assert.equal(win.observer.disconnected, true);
});
test('late native fullscreen cannot reopen an exited or closed session', async () => {
  const { launcher, win, doc } = environment(); let resolve;
  doc.documentElement.requestFullscreen = () => new Promise(r => { resolve = () => { doc.fullscreenElement = doc.documentElement; r(); }; });
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; };
  launcher.open(); const frame = launcher.getState().frame;
  win.dispatch('message', { data: { type: 'kyokushin:display', action: 'exit' }, source: frame.contentWindow, origin: 'http://127.0.0.1:8765' });
  resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(doc.fullscreenElement, null);
  assert.equal(launcher.getState().landscapeRequested, false); launcher.close();
  launcher.open(); launcher.close(); resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(doc.fullscreenElement, null);
});
test('denied native fullscreen leaves the CSS landscape view usable', async () => {
  const { launcher, doc } = environment();
  doc.documentElement.requestFullscreen = () => Promise.reject(Error('blocked'));
  launcher.open(); await Promise.resolve(); assert.equal(launcher.getState().opened, true); assert.equal(launcher.getState().layout.rotated, true); launcher.close();
});
test('native fullscreen targets the root and restores the existing modal and iframe focus above it', async () => {
  const { launcher, doc } = environment(); let grant, exits = 0, target;
  doc.documentElement.requestFullscreen = function () { target = this; return new Promise(resolve => { grant = () => { doc.fullscreenElement = this; doc.dispatch('fullscreenchange'); resolve(); }; }); };
  doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; doc.dispatch('fullscreenchange'); };
  launcher.open(); const frame = launcher.getState().frame, dialog = frame.parentNode.parentNode;
  frame.focus(); grant(); await Promise.resolve(); await Promise.resolve();
  assert.equal(target, doc.documentElement); assert.ok(dialog.modalCount >= 2); assert.equal(dialog.open, true);
  assert.equal(launcher.getState().frame, frame); assert.equal(doc.activeElement, frame);
  launcher.close(); await Promise.resolve(); assert.equal(exits, 1); assert.equal(doc.fullscreenElement, null);
});
test('fullscreen already owned by the site is neither requested nor exited, including the root target', async () => {
  for (const useRoot of [true, false]) {
    const { launcher, doc } = environment(); let requests = 0, exits = 0;
    doc.fullscreenElement = useRoot ? doc.documentElement : doc.createElement('section');
    const prior = doc.fullscreenElement;
    doc.documentElement.requestFullscreen = async () => { requests++; };
    doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; };
    launcher.open(); launcher.close(); await Promise.resolve();
    assert.equal(requests, 0); assert.equal(exits, 0); assert.equal(doc.fullscreenElement, prior);
  }
});
test('losing native fullscreen clears ownership before an unrelated later root fullscreen', async () => {
  const { launcher, doc } = environment(); let exits = 0;
  doc.documentElement.requestFullscreen = async () => { doc.fullscreenElement = doc.documentElement; };
  doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; };
  launcher.open(); await Promise.resolve();
  doc.fullscreenElement = null; doc.dispatch('fullscreenchange');
  doc.fullscreenElement = doc.documentElement; doc.dispatch('fullscreenchange');
  launcher.close(); await Promise.resolve(); assert.equal(exits, 0);
});
test('a late native grant follows the newest reopened session without replacing its iframe', async () => {
  const { launcher, doc } = environment(); let grant, requests = 0, exits = 0;
  doc.documentElement.requestFullscreen = () => { requests++; return new Promise(resolve => { grant = () => { doc.fullscreenElement = doc.documentElement; resolve(); }; }); };
  doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; };
  launcher.open(); const old = launcher.getState().frame; launcher.close(); launcher.open(); const current = launcher.getState().frame;
  grant(); await Promise.resolve(); await Promise.resolve();
  assert.equal(requests, 1); assert.equal(exits, 0); assert.notEqual(current, old); assert.equal(launcher.getState().frame, current);
  assert.equal(doc.fullscreenElement, doc.documentElement); assert.equal(launcher.getState().opened, true);
  launcher.close(); await Promise.resolve(); assert.equal(exits, 1);
});
test('retry replaces one iframe and late messages from the previous attempt stay ignored', () => {
  const { launcher, win, doc, pending } = environment(); launcher.open();
  const old = launcher.getState().frame;
  // Expose the real timeout's Retry button without changing the live iframe.
  for (const fn of [...pending.values()]) fn();
  const retry = doc.documentElement.querySelectorAll('button').find(button => button.textContent === 'Riprova');
  assert.equal(retry.hidden, false); retry.dispatch('click');
  const frame = launcher.getState().frame; assert.notEqual(frame, old); assert.equal(old.isConnected, false);
  assert.equal(doc.documentElement.querySelectorAll('iframe').length, 1);
  win.dispatch('message', { data: { type: 'kyokushin:boot', state: 'ready' }, source: old.contentWindow, origin: 'http://127.0.0.1:8765' });
  assert.equal(frame.parentNode.parentNode.dataset.ready, 'false'); launcher.close();
});
test('repeated fragment installation creates just one controller and delegated handler', () => {
  const { win, doc } = environment(); const one = install(win, { gameUrl: '../Gioca.html' }); const two = install(win, { gameUrl: '../Gioca.html' });
  assert.equal(one, two); assert.equal(doc.listeners.get('click').size, 1); assert.equal(doc.querySelectorAll('[data-kyokushin-open]').length, 1);
});

test('adaptive resize cannot reapply page zoom, transforms or fixed viewport while the game is open', () => {
  const { launcher, win, doc, meta, resize } = environment(); launcher.open();
  const frame = launcher.getState().frame;
  resize(844, 390);
  doc.documentElement.style.setProperty('zoom', '.68', 'important');
  doc.body.style.setProperty('transform', 'scale(.68)');
  meta.setAttribute('content', 'width=1200, initial-scale=.68');
  win.observer.callback();
  assert.equal(doc.documentElement.style.getPropertyValue('zoom'), '1');
  assert.equal(doc.body.style.getPropertyValue('transform'), 'none');
  assert.equal(meta.getAttribute('content'), 'width=device-width, initial-scale=1, viewport-fit=cover');
  launcher.layout(); assert.equal(launcher.getState().layout.rotated, false);
  assert.equal(launcher.getState().frame, frame);
  // The surrounding page must keep the adaptive settings for its newest size,
  // rather than restoring the portrait settings captured before rotating.
  launcher.close();
  assert.equal(doc.documentElement.style.getPropertyValue('zoom'), '.68');
  assert.equal(doc.documentElement.style.getPropertyPriority('zoom'), 'important');
  assert.equal(doc.body.style.getPropertyValue('transform'), 'scale(.68)');
  assert.equal(meta.getAttribute('content'), 'width=1200, initial-scale=.68');
});
test('viewport replacement during adaptive rebuild stays usable and closes without modifying the replacement', () => {
  const { launcher, win, doc, meta } = environment(); launcher.open();
  const replacement = doc.createElement('meta'); replacement.name = 'viewport';
  replacement.setAttribute('content', 'width=960, initial-scale=.4');
  meta.remove(); doc.head.appendChild(replacement); win.observer.callback();
  assert.equal(replacement.getAttribute('content'), 'width=device-width, initial-scale=1, viewport-fit=cover');
  assert.equal(win.observer.observed.some(({node,options}) => node === doc.documentElement && options.attributes), true);
  assert.equal(win.observer.observed.some(({node,options}) => node === doc.head && options.subtree), true);
  launcher.close();
  assert.equal(replacement.getAttribute('content'), 'width=960, initial-scale=.4');
});

test('Flazio HTML components launch the modal in their same-origin top page, not in the component iframe', () => {
  const host = environment(390, 844), component = environment(320, 180);
  component.win.top = host.win;
  const launcher = install(component.win, { gameUrl: '../Gioca.html' });
  const button = component.doc.querySelector('[data-kyokushin-open]');
  component.doc.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  const frame = launcher.getState().frame;
  assert.equal(frame.parentNode.parentNode.parentNode, host.doc.documentElement);
  assert.equal(launcher.getState().layout.width, 800);
  assert.equal(launcher.getState().layout.height, 390);
  assert.equal(component.meta.getAttribute('content'), 'width=1200');
  assert.equal(host.win.KyokushinLauncher, launcher);
  assert.equal(component.win.KyokushinLauncher, launcher);
  launcher.close();
});
test('recreated HTML component delegates to the same top-page launcher and live iframe', () => {
  const host = environment(), first = environment(300, 180), second = environment(300, 180);
  first.win.top = second.win.top = host.win;
  const one = install(first.win, { gameUrl: '../Gioca.html' }); one.open();
  const frame = one.getState().frame;
  const two = install(second.win, { gameUrl: '../Gioca.html' });
  install(second.win, { gameUrl: '../Gioca.html' });
  assert.equal(one, two); assert.equal(second.doc.listeners.get('click').size, 1);
  const button = second.doc.querySelector('[data-kyokushin-open]');
  second.doc.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  assert.equal(two.getState().frame, frame);
  assert.equal(host.doc.querySelectorAll('iframe').length, 1);
  two.close();
});
test('cross-origin embedding never reaches into a parent that it cannot access', () => {
  const component = environment();
  component.win.top = Object.defineProperty({}, 'document', { get() { throw new Error('Blocked cross-origin'); } });
  const launcher = install(component.win, { gameUrl: '../Gioca.html' }); launcher.open();
  assert.equal(launcher.getState().frame.parentNode.parentNode.parentNode, component.doc.documentElement);
  launcher.close();
});

test('host visual viewport and panning stay inside the current layout through keyboard and browser chrome changes', () => {
  const { win } = environment(390, 844);
  Object.assign(win.visualViewport, { width: 390, height: 730, offsetLeft: 40, offsetTop: 200 });
  assert.deepEqual(measureViewport(win), { width: 390, height: 730, left: 0, top: 114 });
  Object.assign(win.visualViewport, { width: 390, height: 300, offsetLeft: Infinity, offsetTop: NaN });
  assert.deepEqual(measureViewport(win), { width: 390, height: 300, left: 0, top: 0 });
  Object.assign(win.visualViewport, { width: 420, height: 800, offsetTop: 50 });
  assert.deepEqual(measureViewport(win), { width: 390, height: 844, left: 0, top: 0 });
});
test('host keeps pinch zoom dimensions but rejects oversized stale viewports of the same shape', () => {
  const { win } = environment(844, 390);
  Object.assign(win.visualViewport, { width: 900, height: 400, offsetLeft: 60, offsetTop: 30 });
  assert.deepEqual(measureViewport(win), { width: 844, height: 390, left: 0, top: 0 });
  Object.assign(win.visualViewport, { width: 422, height: 195, scale: 2, offsetLeft: 600, offsetTop: 300 });
  assert.deepEqual(measureViewport(win), { width: 422, height: 195, left: 422, top: 195 });
});

test('the top-page controller, timer callbacks and event listeners are created in the top realm', () => {
  const host = environment(), component = environment(320, 180); component.win.top = host.win;
  const launcher = install(component.win, { gameUrl: '../Gioca.html' });
  const HostFunction = vm.runInContext('Function', host.doc.context);
  assert.equal(launcher.open instanceof HostFunction, true, 'controller must not retain the component realm');
  launcher.open();
  assert.equal([...host.pending.values()].every(fn => fn instanceof HostFunction), true);
  assert.equal([...host.win.listeners.get('message')].every(fn => fn instanceof HostFunction), true);
  const close = host.doc.querySelectorAll('button').find(button => button.textContent === 'Chiudi ×');
  assert.equal([...close.listeners.get('click')].every(fn => fn instanceof HostFunction), true);
  assert.equal(host.doc.querySelectorAll('[data-kyokushin-open]').length, 0, 'bootstrap must not add a second launch button');
  launcher.close();
});

test('CSP external bootstrap runs in the host, deduplicates pending loads and adds no host button', () => {
  const host = environment(), first = environment(320, 180), second = environment(320, 180);
  host.doc.blockInlineScripts = true;
  for (const component of [first, second]) {
    component.win.top = host.win;
    const script = component.doc.createElement('script'); script.src = 'http://127.0.0.1:8765/scripts/flazio-launcher.js';
    component.doc.currentScript = script; component.doc.head.appendChild(script);
    assert.equal(install(component.win, { gameUrl: '../Gioca.html' }), null);
  }
  const scripts = host.doc.querySelectorAll('script'); assert.equal(scripts.length, 1);
  const external = scripts[0]; assert.equal(external.getAttribute('data-kyokushin-host-only'), 'true');
  assert.equal(external.getAttribute('data-game-url'), 'http://127.0.0.1:8765/Gioca.html');
  host.doc.currentScript = external;
  vm.runInContext(require('node:fs').readFileSync(require.resolve('../scripts/flazio-launcher.js'), 'utf8'), host.doc.context);
  const launcher = host.win.KyokushinLauncher;
  assert.equal(launcher.open instanceof vm.runInContext('Function', host.doc.context), true);
  assert.equal(host.doc.querySelectorAll('[data-kyokushin-open]').length, 0);
  const button = second.doc.querySelector('[data-kyokushin-open]');
  second.doc.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  assert.equal(launcher.getState().opened, true); launcher.close();
});
test('failed external bootstrap can retry and never installs a controller in the component realm', () => {
  const host = environment(), component = environment(); component.win.top = host.win;
  host.doc.blockInlineScripts = true;
  const source = component.doc.createElement('script'); source.src = 'http://127.0.0.1:8765/scripts/flazio-launcher.js';
  component.doc.currentScript = source; component.doc.head.appendChild(source);
  install(component.win, { gameUrl: '../Gioca.html' });
  const external = host.doc.querySelectorAll('script')[0]; external.dispatch('error');
  assert.equal(host.doc.querySelectorAll('script').length, 0);
  assert.equal(host.win.KyokushinLauncher, undefined);
  assert.equal(component.win.KyokushinLauncher, undefined);
  install(component.win, { gameUrl: '../Gioca.html' });
  assert.equal(host.doc.querySelectorAll('script').length, 1);
});
