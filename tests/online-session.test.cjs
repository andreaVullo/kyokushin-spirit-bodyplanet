'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { OnlineSession } = require('../scripts/online-session.js');
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(role = 'host', prepare = async () => {}) {
  const calls = { lobby: 0, prepare: [], versus: [], start: [], pause: [], clients: [], engines: [] }, timers = new Map(); let timerId = 0;
  const initial = { code: 'AB23XY', mode: 'versus', role, revision: 1, status: 'paired', players: [{ slot: 0, name: 'Andrea', fighter: 'angelo', ready: false }, { slot: 1, name: 'Marco', fighter: 'samuel', ready: false }] };
  class UI {
    constructor(options) { this.options = options; this.busy = false; this.result = null; this.error = ''; }
    setBusy(value) { this.busy = value; } setStatus(value) { this.status = value; } setError(value) { this.error = value; }
    setConnection(value, message) { this.connectionReady = value; this.connectionMessage = message; }
    showHome(value) { this.home = value; this.busy = false; } showRoom(value) { this.room = clone(value); } showSearching() {}
    hide() { this.hidden = true; } hideResult() { this.result = null; } showResult(value) { this.result = value; }
  }
  class Client {
    constructor(options) { this.options = options; this.role = role; this.room = clone(initial); this.connected = true; this.sent = []; this.updates = []; this.left = false; this.sendWorks = true; calls.clients.push(this); }
    async create() { return this.room; } async join() { return this.room; } async matchmake() { return this.room; }
    async update(values) {
      this.updates.push(values); if (this.updateFailure) throw this.updateFailure;
      if (this.updateWait) await this.updateWait;
      this.room.revision++;
      Object.assign(this.room.players.find(player => player.slot === (this.role === 'guest' ? 1 : 0)), values);
      this.options.onRoom(clone(this.room)); return clone(this.room);
    }
    send(packet) { if (!this.sendWorks) return false; this.sent.push(clone(packet)); return true; }
    leave() { this.left = true; this.connected = false; }
  }
  class Engine {
    constructor(options) { this.options = options; this.received = []; this.updates = 0; this.disposed = false; calls.engines.push(this); }
    startHost(info) { this.start = clone(info); this.options.onStatus('started', { epoch: info.epoch }); return true; }
    receive(message) { this.received.push(message); if (message.type === 'game-start') this.options.onStatus('started', { epoch: message.epoch }); }
    dispose() { this.disposed = true; } pause() {} clearInput() {} setInput() {} update() { this.updates++; }
    setReconnecting(value) { this.reconnecting = value; }
  }
  const session = new OnlineSession({ UI, Client, Engine, roster: { angelo: {}, samuel: {} }, endpoint: 'https://example.test', game: { getState: () => ({ fighters: [] }) },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    onOpen() {}, onBack() {}, onLobby() { calls.lobby++; }, onPrepare(info) { calls.prepare.push(clone(info)); return prepare(info); },
    onVersus(info) { calls.versus.push(clone(info)); }, onStart(info) { calls.start.push(clone(info)); }, onPause(...args) { calls.pause.push(args); }
  });
  return { session, calls, timers,
    async enter() { session.open(); await session.enter(role === 'host' ? 'create' : 'join', { name: 'Andrea', fighter: 'angelo', mode: 'versus' }); session.connection('connected'); return session.client; },
    ready() { const room = clone(session.client.room); room.revision++; room.players.forEach(player => { player.ready = true; }); session.client.room = clone(room); session.roomChanged(room); },
    runTimer(ms) { for (const [id, timer] of timers) if (timer.ms === ms) { timers.delete(id); timer.fn(); } }
  };
}
const preparePacket = (epoch = 1) => ({ type: 'online-prepare', epoch, mode: 'versus', fighters: ['angelo', 'samuel'], names: ['Andrea', 'Marco'] });
const startPacket = (epoch = 1) => ({ type: 'game-start', epoch, mode: 'versus', fighters: ['angelo', 'samuel'] });
async function playing(f) { await f.enter(); f.ready(); await tick(); f.session.receive({ type: 'online-loaded', epoch: 1 }); f.runTimer(1400); assert.equal(f.session.phase, 'playing'); }

test('host starts only after both ready, both asset loads and the VS countdown', async () => {
  const loading = deferred(), f = fixture('host', () => loading.promise), client = await f.enter();
  assert.equal(f.calls.prepare.length, 0); f.ready(); assert.equal(f.session.phase, 'loading');
  assert.deepEqual(client.sent.map(packet => packet.type), ['online-prepare']);
  f.session.receive({ type: 'online-loaded', epoch: 1 }); assert.equal(f.calls.versus.length, 0);
  loading.resolve(); await tick(); assert.equal(f.session.phase, 'versus'); assert.equal(f.calls.start.length, 0);
  f.runTimer(1400); assert.equal(f.session.phase, 'playing'); assert.equal(f.calls.start.length, 1);
  assert.deepEqual(client.sent.map(packet => packet.type), ['online-prepare', 'online-versus']);
});
test('guest acknowledges its assets, waits for host VS and accepts only the prepared match', async () => {
  const f = fixture('guest'), client = await f.enter(); f.ready(); assert.equal(f.calls.prepare.length, 0);
  f.session.receive(preparePacket()); await tick(); assert.deepEqual(client.sent, [{ type: 'online-loaded', epoch: 1 }]);
  f.session.receive(startPacket()); assert.equal(f.calls.start.length, 0);
  f.session.receive({ type: 'online-versus', epoch: 1 }); assert.equal(f.session.phase, 'versus');
  f.session.receive(startPacket(2)); f.session.receive({ ...startPacket(), fighters: ['samuel', 'angelo'] });
  assert.equal(f.session.engine.received.length, 0);
  f.session.receive(startPacket()); assert.equal(f.session.phase, 'playing'); assert.equal(f.calls.start.length, 1);
});
test('a guest cannot prepare a host match or spoof an old loading error', async () => {
  const f = fixture('host'); await f.enter(); f.session.receive(preparePacket()); assert.equal(f.session.phase, 'room');
  f.session.receive({ type: 'online-error', epoch: 8 }); assert.equal(f.session.phase, 'room'); assert.equal(f.session.ui.error, '');
});
test('prepare rejects inherited roster property names', async () => {
  const f = fixture('guest'); await f.enter();
  f.session.receive({ ...preparePacket(), fighters: ['constructor', 'samuel'] });
  assert.equal(f.session.phase, 'room'); assert.equal(f.calls.prepare.length, 0);
});
test('returning to the room disposes the simulation, rejects ghost frames and waits for both ready resets', async () => {
  const f = fixture(); await playing(f); const old = f.session.engine, client = f.session.client;
  await f.session.returnToRoom();
  assert.equal(old.disposed, true); assert.equal(f.session.engine, null); assert.equal(f.session.phase, 'room');
  assert.equal(f.session.ui.busy, true); assert.ok(f.session.ui.room.players.every(player => !player.ready));
  f.session.receive({ type: 'game-frame', epoch: 1 }); f.session.update(.02); assert.equal(old.received.length, 0); assert.equal(old.updates, 0);
  assert.deepEqual(client.updates, [{ ready: false }]); assert.equal(client.sent.at(-1).type, 'online-room-reset');
  f.session.receive({ type: 'online-room-reset', epoch: 1, revision: 5 }); assert.equal(f.session.ui.busy, false);
  const stale = clone(client.room); stale.revision = 4; stale.players.forEach(player => { player.ready = true; }); f.session.roomChanged(stale);
  assert.equal(f.session.phase, 'room'); assert.equal(f.calls.prepare.length, 1);
  const fresh = clone(stale); fresh.revision = 6; f.session.roomChanged(fresh); await tick();
  assert.equal(f.session.phase, 'loading'); assert.notEqual(f.session.engine, old); assert.equal(f.session.epoch, 2);
});
test('a duplicate return-to-room packet does not restart its readiness handshake', async () => {
  const f = fixture(); await playing(f); await f.session.returnToRoom();
  const generation = f.session.generation; f.session.receive({ type: 'online-room', epoch: 1 });
  assert.equal(f.session.generation, generation); assert.equal(f.session.client.updates.length, 1);
});
test('rematch requires two independent votes and creates a fresh match epoch', async () => {
  const f = fixture(); await playing(f); const previous = f.session.engine; f.session.showResult();
  f.session.rematch(); assert.equal(f.session.phase, 'result'); assert.equal(f.session.ui.result.rematchRequested, true);
  f.session.receive({ type: 'online-rematch', epoch: 0 }); assert.equal(f.calls.prepare.length, 1);
  f.session.receive({ type: 'online-rematch', epoch: 1 }); await tick();
  assert.equal(f.session.phase, 'loading'); assert.equal(f.session.epoch, 2); assert.equal(previous.disposed, true); assert.notEqual(f.session.engine, previous);
  f.session.receive({ type: 'online-loaded', epoch: 1 }); assert.equal(f.session.phase, 'loading');
  f.session.receive({ type: 'online-loaded', epoch: 2 }); f.runTimer(1400); assert.equal(f.session.phase, 'playing'); assert.equal(f.calls.start.length, 2);
});
test('leaving during a load prevents a late resolution or rejection from affecting a new lobby', async () => {
  for (const reject of [false, true]) {
    const loading = deferred(), f = fixture('host', () => loading.promise); await f.enter(); f.ready(); const oldClient = f.session.client;
    f.session.leave(); f.session.open(); assert.equal(oldClient.left, true);
    if (reject) loading.reject(new Error('old load')); else loading.resolve(); await tick();
    assert.equal(f.session.phase, 'home'); assert.equal(f.session.ui.error, ''); assert.equal(f.calls.versus.length, 0); assert.equal(f.calls.start.length, 0); assert.equal(f.timers.size, 0);
  }
});
test('returning during asset loading cancels that loading attempt and ignores its rejection', async () => {
  const loading = deferred(), f = fixture('host', () => loading.promise); await f.enter(); f.ready();
  await f.session.returnToRoom(); loading.reject(new Error('cancelled artwork')); await tick();
  assert.equal(f.session.phase, 'room'); assert.equal(f.session.ui.error, ''); assert.equal(f.calls.versus.length, 0);
});
test('a failed artwork load closes the connection and permits a clean retry', async () => {
  const f = fixture('host', async () => { throw new Error('asset failed'); }); const client = await f.enter(); f.ready(); await tick();
  assert.equal(f.session.phase, 'home'); assert.equal(client.left, true); assert.equal(f.session.engine, null); assert.match(f.session.ui.error, /caricare le mosse/); assert.equal(f.session.epoch, 0);
  await f.session.enter('create', { name: 'Andrea', fighter: 'angelo', mode: 'versus' }); assert.equal(f.session.phase, 'room'); assert.ok(f.session.room);
});
test('a failed send or timed out loading barrier tears down the engine without starting', async () => {
  const first = fixture(); const client = await first.enter(); client.sendWorks = false; first.ready(); await tick();
  assert.equal(first.session.phase, 'home'); assert.equal(first.calls.start.length, 0); assert.equal(first.session.engine, null);
  const loading = deferred(), second = fixture('host', () => loading.promise); await second.enter(); second.ready(); second.runTimer(45000);
  assert.equal(second.session.phase, 'home'); assert.match(second.session.ui.error, /scaduto/); loading.resolve(); await tick(); assert.equal(second.calls.start.length, 0);
});
test('a stale mutation failure cannot write an error into a new lobby', async () => {
  const f = fixture(); const client = await f.enter(), mutation = deferred(); client.update = () => mutation.promise;
  const change = f.session.change({ ready: true }); f.session.leave(); f.session.open(); mutation.reject(new Error('old update failed')); await change;
  assert.equal(f.session.phase, 'home'); assert.equal(f.session.ui.error, '');
});
test('lobby recovery preserves room and ready flags while preventing ready until reconnected', async () => {
  const f = fixture(), client = await f.enter();
  client.room.players[0].ready = true; client.room.revision++; f.session.roomChanged(client.room);
  client.connected = false; f.session.connection('reconnecting', 'Ricollego i karateka…');
  assert.equal(f.session.phase, 'room'); assert.equal(f.session.ui.connectionReady, false); assert.equal(f.session.room.players[0].ready, true);
  await f.session.change({ ready: true }); assert.equal(client.updates.length, 0);
  f.ready(); await tick(); assert.equal(f.session.phase, 'room'); assert.equal(client.left, false);
  client.connected = true; f.session.connection('connected'); await tick();
  assert.equal(f.session.ui.connectionReady, true); assert.equal(f.session.phase, 'loading'); assert.equal(f.calls.prepare.length, 1);
});
test('guest asset completion during recovery defers its loaded control packet', async () => {
  const loading = deferred(), f = fixture('guest', () => loading.promise), client = await f.enter();
  f.session.receive(preparePacket()); client.connected = false; f.session.connection('reconnecting');
  loading.resolve(); await tick(); assert.equal(f.session.phase, 'loading'); assert.equal(client.sent.length, 0); assert.equal(client.left, false);
  client.connected = true; f.session.connection('connected');
  assert.deepEqual(client.sent, [{ type: 'online-loaded', epoch: 1 }]);
});
test('host VS countdown waits for recovery instead of sending start on a disconnected transport', async () => {
  const f = fixture(), client = await f.enter(); f.ready(); await tick(); f.session.receive({ type: 'online-loaded', epoch: 1 });
  client.connected = false; f.session.connection('reconnecting'); f.runTimer(1400);
  assert.equal(f.session.phase, 'versus'); assert.equal(f.calls.start.length, 0); assert.equal(client.left, false);
  client.connected = true; f.session.connection('connected'); assert.equal(f.session.phase, 'playing'); assert.equal(f.calls.start.length, 1);
});
test('rematch consent arriving during recovery starts once after connection returns', async () => {
  const f = fixture(); await playing(f); const client = f.session.client; f.session.showResult(); f.session.rematch();
  client.connected = false; f.session.connection('reconnecting'); f.session.receive({ type: 'online-rematch', epoch: 1 });
  assert.equal(f.session.phase, 'result'); assert.equal(f.calls.prepare.length, 1);
  client.connected = true; f.session.connection('connected'); await tick();
  assert.equal(f.session.phase, 'loading'); assert.equal(f.session.epoch, 2); assert.equal(f.calls.prepare.length, 2);
});
test('return-to-room acknowledgment is retried after recovery without changing readiness', async () => {
  const f = fixture(); await playing(f); const client = f.session.client, mutation = deferred(); client.updateWait = mutation.promise;
  const returning = f.session.returnToRoom(); client.connected = false; f.session.connection('reconnecting'); mutation.resolve(); await returning;
  assert.equal(f.session.phase, 'room'); assert.equal(client.sent.at(-1).type, 'online-room');
  f.session.receive({ type: 'online-room-reset', epoch: 1, revision: client.room.revision });
  assert.equal(f.session.roomReset.complete, false); assert.equal(f.session.ui.busy, true);
  client.connected = true; f.session.connection('connected'); assert.equal(client.sent.at(-1).type, 'online-room-reset');
  assert.equal(f.session.ui.busy, false); assert.ok(f.session.room.players.every(player => !player.ready));
});
