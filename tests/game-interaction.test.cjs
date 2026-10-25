'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { protectGameSurface } = require('../scripts/game-interaction.js');

function fixture() {
  const listeners = new Map();
  const surface = {
    addEventListener(type, listener, options) { listeners.set(type, { listener, options }); },
    removeEventListener(type, listener, capture) { if (listeners.get(type)?.listener === listener && capture) listeners.delete(type); },
    contains(node) { return node.inside !== false; }
  };
  const dispose = protectGameSurface(surface);
  function fire(type, target) {
    let prevented = false;
    listeners.get(type)?.listener({ target, preventDefault() { prevented = true; } });
    return prevented;
  }
  function field(options = {}) {
    const node = { disabled: false, readOnly: false, matches: () => true, ...options };
    node.closest = () => node;
    return node;
  }
  return { listeners, dispose, fire, field };
}

test('arena labels, sprites and control icons cannot start browser selection, dragging or menus', () => {
  const { fire } = fixture();
  for (const type of ['selectstart', 'dragstart', 'contextmenu']) {
    for (const target of [{ closest: () => null }, { nodeType: 3, parentElement: { closest: () => null } }]) assert.equal(fire(type, target), true);
  }
});
test('native editing remains available for desktop names and room codes, including nested editable text', () => {
  const { fire, field } = fixture();
  for (const type of ['selectstart', 'dragstart', 'contextmenu']) {
    assert.equal(fire(type, field()), false);
    assert.equal(fire(type, field({ matches: () => false, isContentEditable: true })), false);
    assert.equal(fire(type, { nodeType: 3, parentElement: field() }), false);
  }
});
test('touch fields managed by the graphic keyboard do not summon selection handles or callouts', () => {
  const { fire, field } = fixture();
  for (const type of ['selectstart', 'dragstart', 'contextmenu']) {
    assert.equal(fire(type, field({ readOnly: true })), true);
    assert.equal(fire(type, field({ disabled: true })), true);
    assert.equal(fire(type, field({ matches: () => false, isContentEditable: false })), true);
  }
});
test('protection never consumes pointer, touch, click, keyboard or scroll events and can be removed', () => {
  const { listeners, dispose } = fixture();
  assert.deepEqual([...listeners.keys()], ['selectstart', 'dragstart', 'contextmenu']);
  for (const { options } of listeners.values()) assert.deepEqual(options, { capture: true, passive: false });
  dispose();assert.equal(listeners.size, 0);
});
