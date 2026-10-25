'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DojoDisplay } = require('../scripts/display-controller.js');
const { DojoOrientation } = require('../scripts/orientation.js');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Advance fake timers independently of native fullscreen promise settlement.
// This reproduces the browser races without wall-clock waits or browser APIs.
function harness({ embedded = false, native = 'pending' } = {}) {
  const win = new Events(), doc = new Events(), element = {};
  const timers = new Map(), messages = [], requests = [], notifications = [];
  let time = 0, timerId = 0, exits = 0, resets = 0, locks = 0;
  const hostOrigin = embedded ? 'https://www.kyokushinkaicataniadojo.it' : null;
  win.parent = embedded ? { postMessage: (data, origin) => messages.push({ data, origin }) } : win;
  win.document = doc;
  win.screen = { orientation: { lock() { locks++; throw new Error('OS rotation is locked'); } } };
  win.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: time + delay }); return id; };
  win.clearTimeout = id => timers.delete(id);
  doc.fullscreenElement = null;
  doc.exitFullscreen = () => {
    exits++;
    doc.fullscreenElement = null;
    doc.dispatch('fullscreenchange');
    return Promise.resolve();
  };
  if (native !== 'unavailable') element.requestFullscreen = () => {
    const request = deferred();
    requests.push(request);
    if (native === 'throw') throw new Error('Fullscreen disabled');
    if (native === 'reject') request.reject(new Error('Fullscreen not allowed'));
    if (native === 'undefined') return undefined;
    return request.promise;
  };
  const display = new DojoDisplay({ window: win, document: doc, element, hostOrigin,
    onInputReset: () => { resets++; },
    onChange: () => notifications.push({ requested: display.requested, hostManaged: display.hostManaged }),
  });
  function advance(ms) {
    const until = time + ms;
    while (true) {
      const next = Array.from(timers).filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id); time = timer.at; timer.callback();
    }
    time = until;
  }
  function message(data, options = {}) {
    win.dispatch('message', { data, origin: options.origin ?? hostOrigin, source: options.source ?? win.parent });
  }
  function ack(landscapeRequested, managed = true, requestId) {
    message({ type: 'kyokushin:display-state', managed, landscapeRequested,
      ...(requestId === undefined ? {} : { requestId }) });
  }
  function layout(width = 390, height = 844) {
    return DojoOrientation.resolve({ touchEnabled: true, width, height, landscapeRequested: display.requested,
      hostManaged: display.hostManaged || display.hostPending });
  }
  function enter(index = 0) {
    doc.fullscreenElement = element;
    doc.dispatch('fullscreenchange');
    requests[index]?.resolve();
  }
  return { display, win, doc, element, timers, messages, requests, notifications, advance, message, ack, layout, enter,
    get exits() { return exits; }, get resets() { return resets; }, get locks() { return locks; } };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

for (const native of ['unavailable', 'throw', 'reject', 'undefined']) {
  test(`${native} native fullscreen still leaves portrait playable through the local layout`, async () => {
    const h = harness({ native });
    h.display.open();
    await settle();
    assert.equal(h.display.requested, true);
    assert.equal(h.display.nativePending, false);
    assert.equal(h.layout().virtual, true);
    assert.equal(h.layout().blocked, false);
    assert.equal(h.layout().logicalWidth, 844);
    h.advance(5000);
    assert.equal(h.display.requested, true);
    assert.equal(h.locks, 0, 'play does not depend on changing the OS rotation lock');
    h.display.close();
    assert.equal(h.layout().blocked, true);
  });
}

test('an indefinitely pending native promise never gates the local layout', () => {
  const h = harness();
  h.display.open();
  assert.equal(h.display.nativePending, true);
  assert.equal(h.layout().blocked, false);
  h.advance(1499);
  assert.equal(h.display.nativePending, true);
  h.advance(1);
  assert.equal(h.display.nativePending, false);
  assert.equal(h.display.requested, true);
  assert.equal(h.layout().virtual, true);
  assert.equal(h.locks, 0);
});

test('closing before a pending native request completes exits its late grant', async () => {
  const h = harness();
  h.display.open();
  h.display.close();
  h.enter();
  await settle();
  assert.equal(h.display.requested, false);
  assert.equal(h.display.nativePending, false);
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.exits, 1);
  assert.equal(h.layout().blocked, true);
  h.advance(5000);
  assert.equal(h.display.requested, false);
});

test('a late grant without a fullscreen event is also discarded after closing', async () => {
  const h = harness();
  h.display.open();
  h.display.close();
  h.doc.fullscreenElement = h.element;
  h.requests[0].resolve();
  await settle();
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.display.requested, false);
  assert.equal(h.exits, 1);
});

test('completion of an older request cannot clear a newer request or its timeout', async () => {
  const h = harness();
  h.display.open();
  h.display.close();
  h.display.open();
  const serial = h.display.serial, resets = h.resets;
  h.requests[0].reject(new Error('Earlier request lost activation'));
  await settle();
  assert.equal(h.display.serial, serial);
  assert.equal(h.display.requested, true);
  assert.equal(h.display.nativePending, true);
  assert.equal(h.resets, resets);
  h.advance(1500);
  assert.equal(h.display.nativePending, false);
  assert.equal(h.layout().blocked, false);
});

test('an older successful grant does not exit a newly requested session', async () => {
  const h = harness();
  h.display.open();
  h.display.close();
  h.display.open();
  h.enter(0);
  await settle();
  assert.equal(h.doc.fullscreenElement, h.element);
  assert.equal(h.display.requested, true);
  assert.equal(h.exits, 0);
  h.requests[1].resolve();
  await settle();
  assert.equal(h.display.requested, true);
  assert.equal(h.display.nativePending, false);
});

test('native fullscreen loss resets held input while preserving the requested adaptive view', async () => {
  const h = harness();
  h.display.open(); h.enter(); await settle();
  assert.equal(h.display.nativeOwned, true);
  const resets = h.resets;
  h.doc.fullscreenElement = null;
  h.doc.dispatch('fullscreenchange');
  assert.equal(h.display.requested, true);
  assert.equal(h.display.nativeOwned, false);
  assert.equal(h.display.nativePending, false);
  assert.ok(h.resets > resets);
  assert.equal(h.layout().virtual, true);
  assert.equal(h.layout().blocked, false);
  assert.equal(h.layout(844,390).virtual, false);
  assert.equal(h.layout(844,390).blocked, false);
  assert.equal(h.layout().virtual, true, 'returning to locked portrait restores the local turn');
  assert.equal(h.requests.length, 1, 'do not force the user back into browser fullscreen');
  h.display.toggle();
  assert.equal(h.display.requested, false, 'the explicit game exit still closes the adaptive view');
  assert.equal(h.layout().blocked, true);
});

test('fullscreen loss before its request promise settles cannot remove the adaptive view later', async () => {
  const h = harness();
  h.display.open();
  h.doc.fullscreenElement = h.element;
  h.doc.dispatch('fullscreenchange');
  h.doc.fullscreenElement = null;
  h.doc.dispatch('fullscreenchange');
  assert.equal(h.display.requested, true);
  assert.equal(h.display.nativePending, false);
  h.requests[0].resolve(); await settle(); h.advance(5000);
  assert.equal(h.display.requested, true);
  assert.equal(h.layout().blocked, false);
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.requests.length, 1);
  h.display.close();
  assert.equal(h.display.requested, false);
});

test('unrelated fullscreen elements are neither claimed nor exited', () => {
  const h = harness(), unrelated = {};
  h.doc.fullscreenElement = unrelated;
  h.display.open();
  assert.equal(h.requests.length, 0);
  h.doc.dispatch('fullscreenchange');
  assert.equal(h.display.nativeOwned, false);
  h.display.close();
  assert.equal(h.doc.fullscreenElement, unrelated);
  assert.equal(h.exits, 0);
});

test('host messages require the expected parent, exact origin, type and boolean state', () => {
  const h = harness({ embedded: true });
  const valid = { type: 'kyokushin:display-state', managed: true, landscapeRequested: true };
  const serial = h.display.serial;
  h.message(valid, { origin: 'https://attacker.example' });
  h.message(valid, { source: {} });
  h.message({ ...valid, type: 'unrelated' });
  h.message({ ...valid, landscapeRequested: 'true' });
  h.message(null);
  assert.equal(h.display.serial, serial);
  assert.equal(h.display.requested, false);
  assert.equal(h.display.hostManaged, false);
  h.message(valid);
  assert.equal(h.display.requested, true);
  assert.equal(h.display.hostManaged, true);
  assert.equal(h.messages[0].data.action, 'sync');
  assert.equal(h.messages[0].origin, 'https://www.kyokushinkaicataniadojo.it');
});

test('an unresponsive older host falls back locally after exactly 500 ms', () => {
  const h = harness({ embedded: true });
  h.display.open();
  assert.equal(h.display.hostPending, true);
  assert.equal(h.requests.length, 0, 'the host receives the display request');
  assert.equal(h.layout().virtual, false);
  h.advance(499);
  assert.equal(h.display.hostPending, true);
  h.advance(1);
  assert.equal(h.display.hostPending, false);
  assert.equal(h.display.requested, true);
  assert.equal(h.layout().virtual, true);
  assert.equal(h.layout().blocked, false);
  assert.equal(h.messages.at(-1).data.action, 'landscape');
});

test('closing while awaiting host acknowledgment cancels the local fallback timer', () => {
  const h = harness({ embedded: true });
  h.display.open(); h.advance(300); h.display.close();
  const resets = h.resets;
  h.advance(5000);
  assert.equal(h.display.requested, false);
  assert.equal(h.display.hostPending, false);
  assert.equal(h.resets, resets);
  assert.equal(h.messages.at(-1).data.action, 'exit');
});

test('an old landscape acknowledgment cannot reopen a later closed request', () => {
  const h = harness({ embedded: true });
  h.display.open();
  const opening = h.messages.at(-1).data.requestId;
  h.display.close();
  const closing = h.messages.at(-1).data.requestId;
  assert.ok(Number.isInteger(opening));
  assert.ok(closing > opening);
  const resets = h.resets;
  h.ack(true, true, opening);
  assert.equal(h.display.requested, false);
  assert.equal(h.resets, resets);
  h.ack(false, true, closing);
  assert.equal(h.display.requested, false);
  assert.equal(h.display.hostManaged, true);
});

test('an old exit acknowledgment cannot cancel a newer open request', () => {
  const h = harness({ embedded: true });
  h.display.open(); h.display.close();
  const closing = h.messages.at(-1).data.requestId;
  h.display.open();
  const reopening = h.messages.at(-1).data.requestId;
  assert.ok(reopening > closing);
  const resets = h.resets;
  h.ack(false, true, closing);
  assert.equal(h.display.requested, true);
  assert.equal(h.display.hostPending, true);
  assert.equal(h.resets, resets);
  h.ack(true, true, reopening);
  assert.equal(h.display.requested, true);
  assert.equal(h.display.hostManaged, true);
  assert.equal(h.display.hostPending, false);
});

test('unversioned host resize reports do not invalidate the current request acknowledgment', () => {
  const h = harness({ embedded: true });
  h.display.open();
  const current = h.messages.at(-1).data.requestId;
  h.ack(true);
  h.ack(true);
  assert.equal(h.display.serial, current);
  h.ack(true, true, current);
  assert.equal(h.display.serial, current);
  assert.equal(h.display.hostManaged, true);
  assert.equal(h.display.requested, true);
});

test('a late managed acknowledgment transfers layout ownership without a second turn', () => {
  const h = harness({ embedded: true });
  h.display.open(); h.advance(500);
  assert.equal(h.layout().virtual, true);
  h.ack(true);
  assert.equal(h.display.hostManaged, true);
  assert.equal(h.display.hostPending, false);
  assert.equal(h.display.requested, true);
  const hosted = h.layout(844, 390);
  assert.equal(hosted.virtual, false);
  assert.equal(hosted.blocked, false);
  assert.equal(hosted.logicalWidth, 844);
  assert.equal(hosted.logicalHeight, 390);
  h.advance(5000);
  assert.equal(h.display.requested, true);
  assert.equal(h.requests.length, 0);
});

test('host takeover exits any owned native surface without cancelling the host request', () => {
  const h = harness({ embedded: true });
  h.display.open(); h.advance(500);
  h.doc.fullscreenElement = h.element;
  h.doc.dispatch('fullscreenchange');
  assert.equal(h.display.nativeOwned, true);
  h.ack(true);
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.exits, 1);
  assert.equal(h.display.nativeOwned, false);
  assert.equal(h.display.hostManaged, true);
  assert.equal(h.display.requested, true);
  assert.equal(h.messages.filter(message => message.data.action === 'exit').length, 0);
});

test('an explicit unmanaged host response permits the local fallback', () => {
  const h = harness({ embedded: true });
  h.display.open(); h.ack(true, false);
  assert.equal(h.display.hostPending, false);
  assert.equal(h.display.hostManaged, false);
  assert.equal(h.layout().virtual, true);
  assert.equal(h.layout().blocked, false);
});

test('returning to portrait remains playable with the OS rotation lock untouched', async () => {
  const h = harness();
  h.display.open(); h.enter(); await settle();
  assert.equal(h.layout().virtual, true);
  assert.equal(h.layout(844, 390).virtual, false);
  assert.equal(h.layout(844, 390).blocked, false);
  assert.equal(h.layout().virtual, true);
  assert.equal(h.layout().blocked, false);
  assert.equal(h.display.requested, true);
  assert.equal(h.locks, 0);
});

test('destroy clears timers and unregisters listeners', () => {
  const h = harness({ embedded: true });
  h.display.open(); h.display.destroy();
  const resets = h.resets;
  h.ack(true); h.doc.dispatch('fullscreenchange'); h.advance(5000);
  assert.equal(h.display.requested, false);
  assert.equal(h.resets, resets);
  assert.equal(h.timers.size, 0);
  assert.equal(h.win.listeners.get('message').size, 0);
  assert.equal(h.doc.listeners.get('fullscreenchange').size, 0);
});
