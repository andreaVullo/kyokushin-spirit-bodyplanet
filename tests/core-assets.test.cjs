'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(root, 'scripts/core-assets.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/core/manifest.json'), 'utf8'));
const keys = Object.keys(manifest);

function element(attribute, name) {
  const attributes = { ['data-portable-' + attribute]: name };
  return { attributes, getAttribute: key => attributes[key], setAttribute: (key, value) => { attributes[key] = value; } };
}
function harness(protocol = 'https:') {
  const scripts = [], portable = [element('src', 'assets/portraits.png'), element('href', 'assets/kyokushin-logo.png')];
  const scriptURL = protocol === 'file:' ? 'file:///game/scripts/core-assets.js' : protocol + '//example.test/dojo/scripts/core-assets.js?v=7';
  const document = {
    currentScript: { src: scriptURL },
    createElement: tag => { assert.equal(tag, 'script'); return {}; },
    head: { append: script => scripts.push(script) },
    querySelectorAll(selector) { return portable.filter(item => Object.hasOwn(item.attributes, selector.slice(1, -1))); },
  };
  const context = vm.createContext({ document, URL, location: { protocol } });
  context.window = context;
  vm.runInContext(loader, context);
  return { context, scripts, portable, scriptURL };
}
function register(h, overrides = {}) {
  h.context.__kyokushinOfflineAssets = Object.assign(Object.fromEntries(keys.map(key => [key, 'data:image/png;base64,aW1hZ2U='])), overrides);
}

test('all extracted core PNGs match the complete manifest and offline envelope byte for byte', () => {
  assert.equal(keys.length, 10);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/core/offline.js'), 'utf8'), context);
  const offline = context.window.__kyokushinOfflineAssets;
  assert.equal(Object.isFrozen(offline), true);
  assert.deepEqual(Object.keys(offline).sort(), keys.slice().sort());
  const files = fs.readdirSync(path.join(root, 'assets/core')).filter(name => name.endsWith('.png')).sort();
  assert.deepEqual(files, Object.values(manifest).map(item => path.basename(item.file)).sort());
  for (const [name, entry] of Object.entries(manifest)) {
    assert.match(entry.file, /^assets\/core\/[a-z-]+\.png$/);
    const bytes = fs.readFileSync(path.join(root, entry.file));
    assert.equal(bytes.length, entry.bytes, name + ' byte size');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, name + ' SHA-256');
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name + ' PNG header');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, name + ' dimensions');
    assert.match(offline[name], /^data:image\/png;base64,/);
    assert.deepEqual(Buffer.from(offline[name].split(',')[1], 'base64'), bytes, name + ' original bytes');
  }
});

test('hosted pages use separately cached PNG URLs and never request the offline envelope', async () => {
  for (const protocol of ['https:', 'http:']) {
    const h = harness(protocol);
    await h.context.__kyokushinAssetsReady;
    assert.equal(h.scripts.length, 0);
    for (const name of keys) {
      const expected = new URL('../' + manifest[name].file, h.scriptURL).href;
      assert.equal(h.context.__kyokushinAsset(name), expected);
    }
    assert.equal(h.portable[0].attributes.src, protocol + '//example.test/dojo/assets/core/portraits.png');
    assert.equal(h.portable[1].attributes.href, protocol + '//example.test/dojo/assets/core/kyokushin-logo.png');
  }
});

test('file pages wait for the envelope before updating portable image sources', async () => {
  const h = harness('file:');
  assert.equal(h.scripts.length, 1);
  assert.equal(h.scripts[0].src, 'file:///game/assets/core/offline.js');
  let ready = false;
  h.context.__kyokushinAssetsReady.then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(h.portable[0].attributes.src, undefined);
  register(h);
  h.scripts[0].onload();
  await h.context.__kyokushinAssetsReady;
  assert.equal(ready, true);
  for (const name of keys) assert.equal(h.context.__kyokushinAsset(name), h.context.__kyokushinOfflineAssets[name]);
  assert.match(h.portable[0].attributes.src, /^data:image\/png;base64,/);
  assert.match(h.portable[1].attributes.href, /^data:image\/png;base64,/);
});

test('missing offline files produce an actionable rejection and leave image elements untouched', async () => {
  const h = harness('file:');
  h.scripts[0].onerror();
  await assert.rejects(h.context.__kyokushinAssetsReady, /immagini offline.*cartelle scripts e assets/);
  assert.equal(h.portable[0].attributes.src, undefined);
  assert.equal(h.portable[1].attributes.href, undefined);
});

test('empty, partial or malformed offline envelopes fail instead of tainting the game canvas', async () => {
  for (const broken of ['missing', 'empty', 'partial', 'file-url', 'empty-payload']) {
    const h = harness('file:');
    if (broken !== 'missing') register(h);
    if (broken === 'empty') h.context.__kyokushinOfflineAssets = {};
    if (broken === 'partial') delete h.context.__kyokushinOfflineAssets[keys[0]];
    if (broken === 'file-url') h.context.__kyokushinOfflineAssets[keys[0]] = 'file:///fallback.png';
    if (broken === 'empty-payload') h.context.__kyokushinOfflineAssets[keys[0]] = 'data:image/png;base64,';
    h.scripts[0].onload();
    await assert.rejects(h.context.__kyokushinAssetsReady, /immagini offline/);
    assert.equal(h.portable[0].attributes.src, undefined);
  }
});

test('resource lookup accepts only explicit asset names, including before offline readiness', () => {
  for (const protocol of ['https:', 'file:']) {
    const h = harness(protocol);
    for (const invalid of ['toString', '__proto__', '../secret.png', 'assets/portraits.png?x=1', 'https://example.test/image.png']) {
      assert.throws(() => h.context.__kyokushinAsset(invalid), /Risorsa del dojo mancante/);
    }
  }
});
