'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DojoOnlineClient } = require('../scripts/online-client.js');
const TOKEN = 'a'.repeat(64), CODE = 'ABC234';
const profile = { name: 'Test', fighter: 'angelo', mode: 'versus' };
const tick = async () => { for (let index = 0; index < 100; index++) await Promise.resolve(); };
function room(role = 'host', paired = false, revision = 1) { return { code: CODE, role, mode: 'versus', status: paired ? 'paired' : 'waiting', revision, players: [{ slot: 0, name: 'Host', fighter: 'angelo', ready: false }, ...(paired ? [{ slot: 1, name: 'Guest', fighter: 'samuel', ready: false }] : [])] }; }
function membership(role = 'host', paired = false) { return { code: CODE, token: TOKEN, role, room: room(role, paired), iceServers: [{ urls: 'stun:provided.example:3478' }, { urls: 'turns:provided.example:5349', username: 'test', credential: 'secret' }] }; }
function timers() {
  let id = 0; const pending = new Map();
  return { pending, setTimeout: (callback, delay) => { pending.set(++id, { callback, delay }); return id; }, clearTimeout: value => pending.delete(value), async run(delay) { const entry = [...pending].find(([, timer]) => timer.delay === delay); assert.ok(entry, 'timer ' + delay + ' exists'); pending.delete(entry[0]); entry[1].callback(); await tick(); } };
}
class Channel {
  constructor(label = 'dojo-game-v1') { this.label = label; this.ordered = true; this.maxRetransmits = null; this.maxPacketLifeTime = null; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; }
  open() { this.readyState = 'open'; this.onopen?.(); }
  send(message) { this.sent.push(message); }
  close() { this.readyState = 'closed'; this.closed = true; this.onclose?.(); }
}
class Peer {
  static instances = [];
  constructor(options) { this.options = options; this.connectionState = 'new'; this.iceConnectionState = 'new'; this.remoteDescription = null; this.candidates = []; this.calls = []; Peer.instances.push(this); }
  createDataChannel(label, options) { this.calls.push(['channel', label, options]); return this.channel = new Channel(label); }
  async createOffer() { this.calls.push(['offer']); return { type: 'offer', sdp: 'v=0\nhost-offer' }; }
  async createAnswer() { this.calls.push(['answer']); return { type: 'answer', sdp: 'v=0\nguest-answer' }; }
  async setLocalDescription(description) { this.localDescription = description; this.calls.push(['local', description.type]); this.onicecandidate?.({ candidate: { candidate: 'candidate:local', sdpMid: '0', sdpMLineIndex: 0, toJSON() { return { candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex }; } } }); }
  async setRemoteDescription(description) { this.remoteDescription = description; this.calls.push(['remote', description.type]); }
  async addIceCandidate(candidate) { assert.ok(this.remoteDescription, 'remote description exists first'); this.candidates.push(candidate); }
  close() { this.closed = true; this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
}
function setup(options = {}) {
  const clock = timers(), requests = [], errors = [], states = [], rooms = [], messages = [];
  let currentRoom = room(options.role || 'host', !!options.paired), response = null;
  const fetch = async (url, init) => {
    const request = { url, init, body: init.body ? JSON.parse(init.body) : null }; requests.push(request);
    if (response) { const result = await response(request); if (result !== undefined) return result; }
    const data = init.method === 'POST' && request.body?.protocol === 1 ? { ...membership(options.role || 'host', !!options.paired), room: currentRoom } : request.body?.action === 'signal' ? { ok: true, seq: requests.length } : { ok: true, room: currentRoom, messages: [] };
    return { ok: true, status: 200, json: async () => data };
  };
  const client = new DojoOnlineClient({ endpoint: 'https://rooms.example/online/', fetch, RTCPeerConnection: Peer, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onRoom: value => rooms.push(value), onMessage: value => messages.push(value), onConnection: (status, message) => states.push({ status, message }), onError: error => errors.push(error) });
  return { client, clock, requests, errors, states, rooms, messages, setRoom: value => { currentRoom = value; }, setResponse: callback => { response = callback; } };
}
const jsonResponse = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('room creation uses correct protocol and leaves credentials out of URL and storage', async () => {
  const play = setup(); const result = await play.client.create(profile);
  assert.equal(result.code, CODE); assert.equal(play.client.role, 'host'); assert.equal(play.client.connected, false);
  assert.equal(play.requests[0].url, 'https://rooms.example/online/rooms');
  assert.deepEqual(play.requests[0].body, { ...profile, protocol: 1 });
  assert.equal(play.client.peer, null, 'a waiting host does not spend the connection timeout');
  await play.clock.run(0);
  assert.equal(play.requests.at(-1).url, 'https://rooms.example/online/rooms/ABC234?after=0');
  assert.equal(play.requests.at(-1).init.headers.Authorization, 'Bearer ' + TOKEN);
  assert.ok(play.requests.every(request => !request.url.includes(TOKEN)));
  assert.equal(play.requests[0].init.credentials, 'omit');
  await play.client.leave();
});

test('join normalizes a six-character code and matchmaking calls the public queue', async () => {
  const play = setup({ role: 'guest', paired: true });
  await play.client.join({ ...profile, code: ' ab c234 ' });
  assert.equal(play.requests[0].url, 'https://rooms.example/online/rooms/ABC234/join');
  await play.client.leave();
  const match = setup(); await match.client.matchmake(profile);
  assert.equal(match.requests[0].url, 'https://rooms.example/online/match');
  await match.client.leave();
});

test('invalid input fails before creating a room and reports an actionable error', async () => {
  const play = setup();
  await assert.rejects(play.client.join({ ...profile, code: '??' }), /codice stanza/);
  assert.equal(play.requests.length, 0); assert.equal(play.errors.length, 1);
  await assert.rejects(play.client.create({ ...profile, name: 'a\n\u0000' }), /Inserisci il nome/);
});

test('host creates a reliable ordered channel and posts offer before local ICE candidates', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick();
  const peer = play.client.peer;
  assert.deepEqual(peer.options.iceServers, membership().iceServers);
  assert.deepEqual(peer.calls.find(call => call[0] === 'channel'), ['channel', 'dojo-game-v1', { ordered: true }]);
  const signals = play.requests.filter(request => request.body?.action === 'signal');
  assert.deepEqual(signals.map(request => request.body.type), ['offer', 'candidate']);
  assert.deepEqual(signals[0].body.payload, { type: 'offer', sdp: 'v=0\nhost-offer' });
  peer.channel.open(); assert.equal(play.client.connected, true); assert.equal(play.states.at(-1).status, 'connected');
  await play.client.leave(); assert.equal(peer.closed, true);
});

test('guest buffers remote ICE, applies offer, flushes ICE and posts a standard answer', async () => {
  const play = setup({ role: 'guest', paired: true }); await play.client.join({ ...profile, code: CODE });
  play.setResponse(request => request.init.method === 'GET' ? jsonResponse({ room: room('guest', true), messages: [
    { seq: 2, from: 0, type: 'candidate', payload: { candidate: 'candidate:remote', sdpMid: '0', sdpMLineIndex: 0 } },
    { seq: 3, from: 0, type: 'offer', payload: { type: 'offer', sdp: 'v=0\nremote-offer' } }
  ] }) : undefined);
  await play.clock.run(0);
  const peer = play.client.peer;
  assert.equal(peer.remoteDescription.type, 'offer'); assert.equal(peer.candidates.length, 1);
  assert.deepEqual(play.requests.filter(request => request.body?.action === 'signal').map(request => request.body.type), ['answer', 'candidate']);
  assert.equal(play.client.cursor, 3);
  const channel = new Channel(); peer.ondatachannel({ channel }); channel.open();
  channel.onmessage({ data: JSON.stringify({ type: 'game-input', action: 'mae' }) });
  assert.deepEqual(play.messages, [{ type: 'game-input', action: 'mae' }]);
  await play.client.leave();
});

test('host accepts answer and new polls use the last processed signal sequence', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick();
  play.setResponse(request => request.init.method === 'GET' ? jsonResponse({ room: room('host', true), messages: [{ seq: 8, from: 1, type: 'answer', payload: { type: 'answer', sdp: 'v=0\nremote-answer' } }] }) : undefined);
  await play.clock.run(0); assert.equal(play.client.peer.remoteDescription.type, 'answer'); assert.equal(play.client.cursor, 8);
  await play.clock.run(800); assert.ok(play.requests.some(request => request.url.endsWith('?after=8')));
  await play.client.leave();
});

test('connection begins when a waiting room gains its second player', async () => {
  const play = setup(); await play.client.create(profile);
  assert.equal(play.client.peer, null); play.setRoom(room('host', true, 2)); await play.clock.run(0);
  assert.ok(play.client.peer); assert.equal(play.states.at(-1).status, 'connecting');
  await play.client.leave();
});

test('polling slows after channel connection and room heartbeat runs independently', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); play.client.channel.open();
  await play.clock.run(0); assert.ok([...play.clock.pending.values()].some(timer => timer.delay === 4000));
  await play.clock.run(5000); assert.equal(play.requests.at(-1).body.action, 'heartbeat');
  assert.ok([...play.clock.pending.values()].some(timer => timer.delay === 5000));
  await play.client.leave(); assert.equal(play.clock.pending.size, 0);
});

test('failed membership immediately stops polling, channel and heartbeat', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer;
  play.setResponse(request => request.init.method === 'GET' ? jsonResponse({ error: 'Stanza scaduta.' }, 410) : undefined);
  await play.clock.run(0);
  assert.equal(play.client.room, null); assert.equal(play.client.connected, false); assert.equal(peer.closed, true);
  assert.equal(play.clock.pending.size, 0); assert.equal(play.errors.at(-1).message, 'Stanza scaduta.');
});

test('connection timeout is Italian and closes room credentials and pending peer', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick();
  await play.clock.run(25000);
  assert.equal(play.client.room, null); assert.match(play.errors.at(-1).message, /collegare i due dispositivi/);
  assert.ok(play.requests.some(request => request.body?.action === 'leave'));
});

test('leaving while creation is pending closes the eventual orphan room', async () => {
  const play = setup(); let resolve;
  play.setResponse(request => request.body?.protocol === 1 ? new Promise(done => { resolve = done; }) : undefined);
  const pending = play.client.create(profile); await tick(); await play.client.leave();
  resolve(jsonResponse(membership())); assert.equal(await pending, null);
  assert.equal(play.client.room, null); assert.equal(play.rooms.length, 0);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 1);
});

test('starting a second request cannot resurrect the first room or overwrite its membership', async () => {
  const play = setup(); let resolve, count = 0;
  play.setResponse(request => request.body?.protocol === 1 && ++count === 1 ? new Promise(done => { resolve = done; }) : undefined);
  const first = play.client.create(profile); await tick(); const second = await play.client.matchmake(profile);
  resolve(jsonResponse({ ...membership(), code: 'DEF567', room: { ...room(), code: 'DEF567' }, token: 'b'.repeat(64) }));
  assert.equal(await first, null); assert.equal(play.client.room.code, second.code);
  assert.ok(play.requests.some(request => request.url.endsWith('/DEF567') && request.body?.action === 'leave'));
  await play.client.leave();
});

test('late REST response after leave never restarts polling or creates a peer', async () => {
  const play = setup(); await play.client.create(profile); let resolve;
  play.setResponse(request => request.init.method === 'GET' ? new Promise(done => { resolve = done; }) : undefined);
  await play.clock.run(0); await play.client.leave();
  resolve(jsonResponse({ room: room('host', true, 2), messages: [] })); await tick();
  assert.equal(play.client.peer, null); assert.equal(play.clock.pending.size, 0);
});

test('readiness updates are authenticated and stale revisions cannot revert selection', async () => {
  const play = setup(); await play.client.create(profile);
  const next = room('host', false, 3); next.players[0].fighter = 'samuel'; next.players[0].ready = true; play.setRoom(next);
  await play.client.update({ fighter: 'samuel', ready: true });
  const request = play.requests.at(-1); assert.deepEqual(request.body, { action: 'update', fighter: 'samuel', ready: true });
  assert.equal(request.init.headers.Authorization, 'Bearer ' + TOKEN);
  play.setRoom(room('host', false, 2)); await play.clock.run(0);
  assert.equal(play.client.room.players[0].fighter, 'samuel');
  await play.client.leave();
});

test('frame congestion drops frames but preserves ordered controls, then disconnects at one MB', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const channel = play.client.channel; channel.open();
  channel.bufferedAmount = 150 * 1024;
  assert.equal(play.client.send({ type: 'game-frame', seq: 1 }), false);
  assert.equal(play.client.send({ type: 'game-input', action: 'mae' }), true);
  assert.equal(channel.sent.length, 1);
  channel.bufferedAmount = 1024 * 1024 + 1;
  assert.equal(play.client.send({ type: 'game-input', action: 'mae' }), false);
  assert.equal(play.client.connected, false); assert.match(play.errors.at(-1).message, /Connessione troppo lenta/);
});

test('packets must be JSON objects under 64 KB; invalid input is never dispatched', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const channel = play.client.channel; channel.open();
  assert.equal(play.client.send({ type: 'game-frame', huge: 'x'.repeat(65536) }), false);
  for (const data of ['bad json', 'null', '[]', JSON.stringify({ type: 'game-frame', huge: 'x'.repeat(65536) }), new Uint8Array(2)]) channel.onmessage({ data });
  assert.equal(play.messages.length, 0);
  channel.onmessage({ data: JSON.stringify({ type: 'lobby-ready', ready: true }) }); assert.equal(play.messages.length, 1);
  await play.client.leave();
});

test('an unexpected or unreliable data channel cannot replace the combat channel', async () => {
  const play = setup({ role: 'guest', paired: true }); await play.client.join({ ...profile, code: CODE });
  const peer = play.client.peer, invalid = new Channel(); invalid.maxRetransmits = 0;
  peer.ondatachannel({ channel: invalid }); assert.equal(invalid.closed, true); assert.equal(play.client.channel, null);
  const first = new Channel(); peer.ondatachannel({ channel: first }); first.open();
  const second = new Channel(); peer.ondatachannel({ channel: second }); assert.equal(second.closed, true); assert.equal(play.client.channel, first);
  await play.client.leave();
});

test('peer connection failure is reported once and all callbacks are removed before cleanup', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer;
  peer.connectionState = 'failed'; peer.onconnectionstatechange(); await tick();
  assert.equal(play.errors.length, 1); assert.equal(play.client.peer, null); assert.equal(peer.onconnectionstatechange, null);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 1);
});

test('only an HTTPS service or a local development service is accepted', () => {
  for (const endpoint of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com?token=a']) assert.throws(() => new DojoOnlineClient({ endpoint }), /Indirizzo/);
  const client = new DojoOnlineClient({ endpoint: 'http://127.0.0.1:8765', fetch: () => {}, RTCPeerConnection: Peer });
  assert.equal(client.endpoint, 'http://127.0.0.1:8765');
});

test('rapid fighter selection and ready requests remain ordered at the server', async () => {
  const play = setup(); await play.client.create(profile); let release;
  play.setResponse(request => request.body?.action === 'update' && request.body.fighter ? new Promise(resolve => { release = resolve; }) : undefined);
  const first = play.client.update({ fighter: 'samuel' }), second = play.client.update({ ready: true }); await tick();
  assert.equal(play.requests.filter(request => request.body?.action === 'update').length, 1);
  const selected = room('host', false, 2); selected.players[0].fighter = 'samuel';
  release(jsonResponse({ ok: true, room: selected })); await first; await second;
  assert.deepEqual(play.requests.filter(request => request.body?.action === 'update').map(request => request.body), [{ action: 'update', fighter: 'samuel' }, { action: 'update', ready: true }]);
  await play.client.leave();
});

test('a blackholed creation times out after 12 seconds, aborts fetch and permits retry', async () => {
  const play = setup();
  play.setResponse(request => request.body?.protocol === 1 ? new Promise(() => {}) : undefined);
  const entering = play.client.create(profile); const rejection = assert.rejects(entering, /non risponde/);
  await tick(); const signal = play.requests[0].init.signal; assert.equal(signal.aborted, false);
  await play.clock.run(12000); await rejection;
  assert.equal(signal.aborted, true); assert.equal(play.client.pending, false); assert.equal(play.client.room, null);
  assert.equal(play.errors.length, 1); assert.equal(play.clock.pending.size, 0);
  play.setResponse(null); await play.client.create(profile); assert.equal(play.client.room.code, CODE);
  await play.client.leave();
});

test('the same deadline bounds a stalled JSON body and closes a late orphan response', async () => {
  const play = setup(); let release;
  play.setResponse(request => request.body?.protocol === 1 ? { ok: true, status: 201, json: () => new Promise(resolve => { release = resolve; }) } : undefined);
  const entering = play.client.create(profile); const rejection = assert.rejects(entering, /non risponde/);
  await tick(); await play.clock.run(12000); await rejection;
  release(membership()); await tick();
  assert.equal(play.client.room, null); assert.equal(play.rooms.length, 0);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 1);
  assert.equal(play.clock.pending.size, 0);
});

test('a stalled poll is aborted and rescheduled instead of remaining pending forever', async () => {
  const play = setup(); await play.client.create(profile);
  play.setResponse(request => request.init.method === 'GET' ? new Promise(() => {}) : undefined);
  await play.clock.run(0); const request = play.requests.at(-1);
  await play.clock.run(12000);
  assert.equal(request.init.signal.aborted, true);
  assert.ok([...play.clock.pending.values()].some(timer => timer.delay === 800));
  assert.ok(play.client.room, 'one transient request failure does not destroy a healthy room');
  await play.client.leave();
});

test('a stalled keepalive leave is bounded and cannot retain local room state', async () => {
  const play = setup(); await play.client.create(profile);
  play.setResponse(request => request.body?.action === 'leave' ? new Promise(() => {}) : undefined);
  const leaving = play.client.leave(); await tick();
  assert.equal(play.client.room, null); assert.equal(play.client.connected, false);
  const request = play.requests.at(-1); assert.equal(request.init.keepalive, true);
  await play.clock.run(12000); await leaving;
  assert.equal(request.init.signal.aborted, true); assert.equal(play.clock.pending.size, 0);
});

test('initial ICE disconnected preserves both unready players and the original negotiation deadline', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer;
  peer.connectionState = 'connecting'; peer.iceConnectionState = 'checking';
  peer.iceConnectionState = 'disconnected'; peer.oniceconnectionstatechange();
  assert.ok(play.client.room); assert.equal(peer.closed, undefined); assert.equal(play.errors.length, 0);
  assert.deepEqual(play.client.room.players.map(player => player.ready), [false, false]);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 0);
  assert.ok([...play.clock.pending.values()].some(timer => timer.delay === 25000));
  assert.equal([...play.clock.pending.values()].filter(timer => timer.delay === 12000).length, 0);
  await play.clock.run(0); await play.clock.run(5000);
  assert.ok(play.client.room, 'room polling and heartbeat continue while more candidates arrive');
  peer.iceConnectionState = 'connected'; peer.connectionState = 'connected'; peer.oniceconnectionstatechange();
  assert.equal(play.client.connected, false, 'ICE success alone is not an open data channel');
  peer.channel.open(); assert.equal(play.client.connected, true);
  assert.equal(play.states.filter(item => item.status === 'connected').length, 1);
  assert.equal([...play.clock.pending.values()].filter(timer => timer.delay === 25000).length, 0);
  await play.client.leave();
});

test('an unopened channel never reports connected while ICE remains disconnected', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer;
  peer.iceConnectionState = 'disconnected'; peer.channel.open();
  assert.equal(play.client.connected, false); assert.equal(play.client.everConnected, false);
  assert.equal(play.states.filter(item => item.status === 'connected').length, 0);
  peer.iceConnectionState = 'completed'; peer.connectionState = 'connected'; peer.onconnectionstatechange();
  assert.equal(play.client.connected, true); assert.equal(play.client.everConnected, true);
  await play.client.leave();
});

test('failed first negotiation explains the missing relay without claiming a transient disconnect', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick();
  play.client.iceServers = [{ urls: 'stun:provided.example:3478' }];
  const peer = play.client.peer; peer.iceConnectionState = 'failed'; peer.oniceconnectionstatechange();
  assert.equal(play.client.room, null); assert.match(play.errors.at(-1).message, /collegamento diretto/);
  assert.match(play.errors.at(-1).message, /non è ancora configurato un collegamento alternativo/);
  assert.doesNotMatch(play.errors.at(-1).message, /altra rete|nuova stanza/);
});

test('initial disconnected eventually uses the original 25 second deadline, without a recovery grace', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick();
  const peer = play.client.peer; peer.iceConnectionState = 'disconnected'; peer.oniceconnectionstatechange();
  assert.equal(play.client.recovering, false); await play.clock.run(25000);
  assert.equal(play.client.room, null); assert.equal(play.errors.length, 1);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 1);
});

test('an established connection has a cancellable 12 second recovery grace with room membership intact', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer;
  peer.connectionState = 'connected'; peer.iceConnectionState = 'connected'; peer.channel.open();
  peer.connectionState = 'disconnected'; peer.iceConnectionState = 'disconnected'; peer.onconnectionstatechange(); peer.oniceconnectionstatechange();
  assert.equal(play.client.connected, false); assert.equal(play.client.recovering, true); assert.ok(play.client.room);
  assert.equal(play.states.filter(item => item.status === 'reconnecting').length, 1);
  assert.equal([...play.clock.pending.values()].filter(timer => timer.delay === 12000).length, 1);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 0);
  assert.equal(play.client.send({ type: 'game-input', action: 'mae' }), false);
  await play.clock.run(0); await play.clock.run(5000); assert.ok(play.client.room);
  peer.iceConnectionState = 'connected'; peer.oniceconnectionstatechange();
  assert.equal(play.client.connected, false, 'the aggregate connection must recover too');
  peer.connectionState = 'connected'; peer.onconnectionstatechange();
  assert.equal(play.client.connected, true); assert.equal(play.client.recovering, false);
  assert.equal(play.states.at(-1).message, 'Collegamento ripristinato.');
  assert.equal([...play.clock.pending.values()].filter(timer => timer.delay === 12000).length, 0);
  assert.equal(play.client.send({ type: 'game-input', action: 'mae' }), true);
  await play.client.leave();
});

test('unrecovered established connection closes once after its grace and names the lost connection', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer; peer.channel.open();
  peer.iceConnectionState = 'disconnected'; peer.oniceconnectionstatechange();
  await play.clock.run(12000);
  assert.equal(play.client.room, null); assert.equal(peer.closed, true); assert.equal(play.errors.length, 1);
  assert.match(play.errors[0].message, /non si è ripristinato/);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 1);
});

test('leaving during recovery cancels its grace without a late error or reopening the channel', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer; peer.channel.open();
  peer.iceConnectionState = 'disconnected'; peer.oniceconnectionstatechange();
  const grace = [...play.clock.pending.values()].find(timer => timer.delay === 12000).callback;
  await play.client.leave(); assert.equal(play.clock.pending.size, 0);
  grace(); await tick(); assert.equal(play.errors.length, 0); assert.equal(play.client.connected, false);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 1);
});

test('a transient failure of an extra ICE candidate cannot destroy an already open channel', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer; peer.channel.open();
  play.setResponse(request => request.body?.action === 'signal' && request.body.type === 'candidate' ? jsonResponse({ error: 'Temporaneamente non disponibile' }, 503) : undefined);
  peer.onicecandidate({ candidate: { candidate: 'candidate:extra', sdpMid: '0', sdpMLineIndex: 0 } }); await tick();
  assert.equal(play.client.connected, true); assert.ok(play.client.room); assert.equal(play.errors.length, 0);
  assert.equal(play.requests.filter(request => request.body?.action === 'leave').length, 0);
  play.setResponse(null); peer.onicecandidate({ candidate: { candidate: 'candidate:next', sdpMid: '0', sdpMLineIndex: 0 } }); await tick();
  assert.equal(play.requests.at(-1).body.payload.candidate, 'candidate:next');
  await play.client.leave();
});

test('candidate membership failures remain fatal even after the channel has opened', async () => {
  for (const status of [401, 403, 404, 409, 410]) {
    const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer; peer.channel.open();
    play.setResponse(request => request.body?.action === 'signal' && request.body.type === 'candidate' ? jsonResponse({ error: 'Accesso alla stanza non valido.' }, status) : undefined);
    peer.onicecandidate({ candidate: { candidate: 'candidate:extra', sdpMid: '0', sdpMLineIndex: 0 } }); await tick();
    assert.equal(play.client.connected, false); assert.equal(play.client.room, null); assert.equal(play.errors.length, 1);
  }
});

test('six relay URLs supplied by the service are preserved for future relay configuration', () => {
  const play = setup();
  const urls = ['turn:relay.example:3478?transport=udp','turn:relay.example:3478?transport=tcp','turns:relay.example:5349?transport=tcp','turn:relay.example:53?transport=udp','turn:relay.example:80?transport=tcp','turns:relay.example:443?transport=tcp'];
  assert.deepEqual(play.client._iceServers([{ urls, username: 'temporary', credential: 'temporary' }])[0].urls, urls);
});

test('an optional candidate rejected by the browser does not invalidate an established path', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer;
  peer.channel.open(); peer.remoteDescription = { type: 'answer', sdp: 'v=0\nanswer' };
  peer.addIceCandidate = async () => { throw new Error('OperationError: candidate could not be applied'); };
  play.setResponse(request => request.init.method === 'GET' ? jsonResponse({ room: room('host', true), messages: [{ seq: 8, from: 1, type: 'candidate', payload: { candidate: 'candidate:optional', sdpMid: '0', sdpMLineIndex: 0 } }] }) : undefined);
  await play.clock.run(0);
  assert.equal(play.client.cursor, 8); assert.equal(play.client.connected, true); assert.equal(play.errors.length, 0);
  await play.client.leave();
});

test('transient posting errors for extra candidates also preserve an active recovery grace', async () => {
  const play = setup({ paired: true }); await play.client.create(profile); await tick(); const peer = play.client.peer; peer.channel.open();
  peer.iceConnectionState = 'disconnected'; peer.oniceconnectionstatechange();
  play.setResponse(request => request.body?.action === 'signal' && request.body.type === 'candidate' ? jsonResponse({ error: 'Temporaneamente non disponibile' }, 503) : undefined);
  peer.onicecandidate({ candidate: { candidate: 'candidate:extra', sdpMid: '0', sdpMLineIndex: 0 } }); await tick();
  assert.ok(play.client.room); assert.equal(play.client.recovering, true); assert.equal(play.errors.length, 0);
  assert.ok([...play.clock.pending.values()].some(timer => timer.delay === 12000));
  await play.client.leave();
});
