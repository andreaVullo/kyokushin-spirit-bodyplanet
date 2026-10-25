'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { inviteURL, readInvite, canUseOnline, browserContext, androidBrowserURL } = require('../scripts/invite-entry.js');

test('messaging invitations preserve the private room without iframe credentials or browser overrides', () => {
  const info = readInvite('https://example.test/dojo/Gioca.html?room=ab23xy&hostdisplay=1&embed=1&token=private&url=https://evil.test/#secret');
  assert.equal(info.inviteURL, 'https://example.test/dojo/online.html?room=AB23XY');
  assert.equal(info.gameURL, 'https://example.test/dojo/Gioca.html?online=1&fromInvite=1&standalone=1&room=AB23XY');
  assert.equal(info.code, 'AB23XY'); assert.equal(info.invalid, false);
});
test('generic online links, invalid rooms and local files have a usable safe destination', () => {
  assert.equal(readInvite('https://example.test/dojo/online.html').gameURL, 'https://example.test/dojo/Gioca.html?online=1&fromInvite=1&standalone=1');
  const invalid = readInvite('https://example.test/online.html?room=%3Cimg%3E');
  assert.equal(invalid.invalid, true); assert.equal(invalid.code, ''); assert.equal(new URL(invalid.gameURL).searchParams.has('room'), false);
  assert.equal(inviteURL('AB23XY', 'file:///Users/example/Gioca.html'), 'https://andreavullo.github.io/kyokushin-spirit-bodyplanet/online.html?room=AB23XY');
  assert.equal(inviteURL('AB23XY', 'http://localhost:8765/Gioca.html'), 'http://localhost:8765/online.html?room=AB23XY');
  assert.throws(() => inviteURL('AB01XY', 'https://example.test/Gioca.html'));
});
test('the browser probe closes its resources and never makes an offer or asks for media', () => {
  const calls = [];
  class Peer {
    constructor(options) { calls.push(['peer', options]); }
    createDataChannel(label) { calls.push(['channel', label]); return { close() { calls.push('channel closed'); } }; }
    createOffer() { throw new Error('An entry page must not connect to a room'); }
    close() { calls.push('peer closed'); }
  }
  assert.equal(canUseOnline({ RTCPeerConnection: Peer }), true);
  assert.deepEqual(calls, [['peer', { iceServers: [] }], ['channel', 'dojo-capability-check'], 'channel closed', 'peer closed']);
  assert.equal(canUseOnline({}), false);
  let closed = false;
  class BlockedPeer { createDataChannel() { throw new Error('Disabled by WebView'); } close() { closed = true; } }
  assert.equal(canUseOnline({ RTCPeerConnection: BlockedPeer }), false); assert.equal(closed, true);
});
test('Android external-browser actions keep the exact room and an HTTPS fallback without a forced app', () => {
  const info = readInvite('https://example.test/dojo/online.html?room=AB23XY');
  const intent = androidBrowserURL(info.gameURL, info.inviteURL);
  assert.match(intent, /^intent:\/\/example\.test\/dojo\/Gioca\.html\?online=1&fromInvite=1&standalone=1&room=AB23XY#Intent;/);
  assert.ok(intent.includes('action=android.intent.action.VIEW;'));
  assert.ok(intent.includes('S.browser_fallback_url=' + encodeURIComponent(info.inviteURL)));
  assert.equal(intent.includes('package='), false);
  assert.equal(androidBrowserURL('javascript:alert(1)', info.inviteURL), null);
});
test('app hints never classify ordinary iPhone Safari or Android Chrome as blocked', () => {
  assert.deepEqual(browserContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1' }), { android: false, ios: true, inApp: false });
  assert.equal(browserContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel) Chrome/130.0.0.0 Mobile Safari/537.36' }).inApp, false);
  assert.equal(browserContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel; wv) Chrome/130.0.0.0 Mobile Safari/537.36' }).inApp, true);
});

function lobby(navigator) {
  const context = vm.createContext({ navigator, URL, location: { href: 'https://example.test/game/Gioca.html?room=OLD234&embed=1' }, module: { exports: {} } });
  vm.runInContext(fs.readFileSync(require.resolve('../scripts/online-ui.js'), 'utf8'), context);
  const view = Object.create(context.module.exports.OnlineUI.prototype);
  view.room = { code: 'AB23XY' }; view.options = {}; view.setStatus = message => { view.message = message; };
  return view;
}
test('sharing a room invokes the native sheet once with a clean entry URL', async () => {
  let shared, copied = false;
  const view = lobby({ share: async data => { shared = data; }, clipboard: { writeText: async () => { copied = true; } } });
  await view.copy(true);
  assert.equal(shared.url, 'https://example.test/game/online.html?room=AB23XY'); assert.equal(copied, false);
});
test('a blocked share sheet falls back to copy, while cancellation does not unexpectedly copy', async () => {
  const writes = [];
  const blocked = lobby({ share: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); }, clipboard: { writeText: async value => writes.push(value) } });
  await blocked.copy(true); assert.deepEqual(writes, ['https://example.test/game/online.html?room=AB23XY']);
  const cancelled = lobby({ share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); }, clipboard: { writeText: async value => writes.push(value) } });
  await cancelled.copy(true); assert.equal(writes.length, 1);
  await blocked.copy(false); assert.equal(writes[1], 'AB23XY');
});
test('a share sheet completing after room exit cannot copy a stale invitation or update a new room', async () => {
  for (const nextRoom of [null, { code: 'CD45YZ' }, { code: 'AB23XY' }]) {
    for (const failed of [false, true]) {
      let finish, writes = 0;
      const view = lobby({ share: () => new Promise((resolve, reject) => { finish = failed ? () => reject(new Error('Share unavailable')) : resolve; }),
        clipboard: { writeText: async () => { writes++; } } });
      const work = view.copy(true); view.room = nextRoom; view.message = 'Stato corrente';
      finish(); await work;
      assert.equal(view.message, 'Stato corrente'); assert.equal(writes, 0);
    }
  }
});
test('pending clipboard success and failure are ignored after the room changes', async () => {
  for (const failed of [false, true]) {
    let finish, copied;
    const view = lobby({ clipboard: { writeText: value => { copied = value; return new Promise((resolve, reject) => { finish = failed ? () => reject(new Error('Copy unavailable')) : resolve; }); } } });
    const work = view.copy(false); view.room = null; view.message = 'Fuori dalla stanza';
    finish(); await work;
    assert.equal(copied, 'AB23XY'); assert.equal(view.message, 'Fuori dalla stanza');
  }
});
