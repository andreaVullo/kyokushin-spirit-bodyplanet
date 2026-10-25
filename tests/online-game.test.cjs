'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { KyokushinGame, KyokushinMoves } = require('../scripts/game.js');
const { DojoOnlineGame, encodeState, decodeState } = require('../scripts/online-game.js');

function pair(mode = 'versus', options = {}) {
  let time = 0;
  const hostEvents = [], guestEvents = [], hostStatus = [], guestStatus = [], queue = [], sent = [];
  const hostGame = new KyokushinGame({ random: () => .1, onEvent: event => hostEvents.push(event) });
  const guestGame = new KyokushinGame({ random: () => .9, onEvent: event => guestEvents.push(event) });
  let dropFrames = false, hostEnded = 0, guestEnded = 0;
  const wire = (to, message) => {
    if (dropFrames && message.type === 'game-frame') return false;
    const copy = JSON.parse(JSON.stringify(message));
    sent.push({ to, message: copy }); queue.push({ to, message: copy }); return true;
  };
  const host = new DojoOnlineGame({ game: hostGame, role: 'host', now: () => time, send: message => wire('guest', message), onStatus: (status, detail) => hostStatus.push({ status, detail }), onMatchEnd: () => hostEnded++, ...options });
  const guest = new DojoOnlineGame({ game: guestGame, role: 'guest', now: () => time, send: message => wire('host', message), onStatus: (status, detail) => guestStatus.push({ status, detail }), onMatchEnd: () => guestEnded++, ...options });
  function flush() { let count = 0; while (queue.length) { const item = queue.shift(); (item.to === 'host' ? host : guest).receive(item.message); if (++count > 1000) throw new Error('Message loop'); } }
  assert.equal(host.startHost({ epoch: 1, mode, fighters: ['angelo', 'samuel'] }), true); flush();
  function advance(seconds, deliver = true) {
    for (let remaining = seconds; remaining > 1e-8; remaining -= 1 / 120) {
      const dt = Math.min(1 / 120, remaining); time += dt * 1000;
      host.update(dt); if (deliver) flush(); guest.update(dt); if (deliver) flush();
    }
  }
  function contact() { hostGame.state.phase = 'fight'; hostGame.state.phaseTime = 0; hostGame.state.fighters[0].x = 500; hostGame.state.fighters[1].x = 630; }
  return { host, guest, hostGame, guestGame, hostEvents, guestEvents, hostStatus, guestStatus, queue, sent, flush, advance, contact,
    setTime: value => { time = value; }, dropFrames: value => { dropFrames = value; }, ends: () => [hostEnded, guestEnded] };
}

function latest(play, type, to = 'guest') { return play.sent.findLast(item => item.to === to && item.message.type === type).message; }

test('host starts two equal fighters; guest never independently simulates physics or damage', () => {
  const play = pair();
  assert.equal(play.host.playerIndex, 0); assert.equal(play.guest.playerIndex, 1);
  assert.deepEqual(encodeState(play.guest.state), encodeState(play.host.state));
  const elapsed = play.guest.state.elapsed;
  play.guest.update(.5); assert.equal(play.guest.state.elapsed, elapsed);
  play.advance(1.6);
  assert.equal(play.host.state.phase, 'fight');
  assert.equal(play.guest.state.phase, 'fight');
  assert.ok(Math.abs(play.host.state.elapsed - play.guest.state.elapsed) < 1 / 30 + .001);
});

test('guest keyboard/touch uses slot 1 and fast press/release survives between snapshots', () => {
  const play = pair(); play.contact();
  play.guest.setInput('tsuki', true); play.guest.setInput('tsuki', false); play.flush();
  assert.equal(play.hostGame.inputs[1].held.tsuki, false);
  assert.deepEqual(play.hostGame.inputs[1].pressed, ['tsuki']);
  play.advance(.4);
  assert.equal(play.host.state.fighters[0].hp, 935);
  assert.equal(play.host.state.fighters[1].hp, 1000);
  assert.equal(play.guest.state.fighters[0].hp, 935);
  assert.equal(play.hostEvents.filter(event => event.type === 'hit').length, 1);
  assert.equal(play.guestEvents.filter(event => event.type === 'hit').length, 1);
});

test('rapid guest punches retain ordered edges and form tsuki / gyaku without repeats', () => {
  const play = pair(); play.contact();
  play.guest.setInput('tsuki', true); play.guest.setInput('tsuki', true); play.guest.setInput('tsuki', false);
  play.guest.setInput('tsuki', true); play.guest.setInput('tsuki', false); play.flush();
  play.advance(.6);
  assert.deepEqual(play.hostEvents.filter(event => event.type === 'attack').map(event => event.move), ['tsuki', 'gyaku']);
});

test('direction double-tap produces a dash, joystick sliding does not', () => {
  for (const allowDash of [true, false]) {
    const play = pair(); play.contact();
    play.guest.setInput('right', true, { allowDash }); play.guest.setInput('right', false); play.flush(); play.advance(.05);
    play.guest.setInput('right', true, { allowDash }); play.flush();
    assert.equal(play.hostGame.state.fighters[1].state === 'dash', allowDash);
  }
  const play = pair(); play.contact();
  play.guest.setInput('right', true, { phase: 'move' }); play.guest.setInput('right', false); play.guest.setInput('right', true, { phase: 'move' }); play.flush();
  assert.equal(play.hostGame.state.fighters[1].dashRemaining, 0);
});

test('training has human control, infinite timer and regeneration without AI interference', () => {
  const play = pair('training'); play.contact();
  play.hostGame.updateAI = () => { throw new Error('AI must not control an online player'); };
  play.guest.setInput('left', true); play.flush();
  play.advance(.15);
  assert.ok(play.host.state.fighters[1].x < 630);
  assert.equal(play.host.state.timer, Infinity); assert.equal(play.guest.state.timer, Infinity);
  play.guest.clearInput(); play.flush();
  play.host.state.fighters[0].hp = 750; play.advance(.2);
  assert.ok(play.host.state.fighters[0].hp > 750);
});

test('snapshot round-trip restores Infinity and canonical attack definitions', () => {
  const play = pair('training'); play.contact();
  play.host.setInput('tsuki', true); play.hostGame.update(.01);
  const wire = encodeState(play.host.state);
  assert.equal(wire.timer, null); assert.equal(wire.fighters[0].attack.hitTime, null);
  assert.equal(wire.fighters[0].attack.def, undefined);
  wire.fighters[0].attack.def = { damage: 999999 };
  const result = decodeState(wire, play.guestGame, ['angelo', 'samuel']);
  assert.equal(result.timer, Infinity); assert.equal(result.fighters[0].attack.hitTime, Infinity);
  assert.equal(result.fighters[0].attack.def, KyokushinMoves.tsuki);
});

test('clearing local input does not clear the other player', () => {
  const play = pair(); play.contact();
  play.host.setInput('left', true); play.guest.setInput('right', true); play.flush();
  play.host.clearInput();
  assert.equal(play.hostGame.inputs[0].held.left, false); assert.equal(play.hostGame.inputs[1].held.right, true);
  play.host.setInput('block', true); play.guest.clearInput(); play.flush();
  assert.equal(play.hostGame.inputs[0].held.block, true); assert.equal(play.hostGame.inputs[1].held.right, false);
});

test('pause is shared and each player must release their own pause request', () => {
  const play = pair(); play.contact();
  play.host.setInput('left', true); play.guest.setInput('right', true); play.flush();
  play.guest.pause(true); play.flush();
  assert.equal(play.hostGame.paused, true); assert.equal(play.guestGame.paused, true);
  assert.equal(play.hostGame.inputs[0].held.left, false); assert.equal(play.hostGame.inputs[1].held.right, false);
  const x = play.host.state.fighters[0].x; play.advance(.2); assert.equal(play.host.state.fighters[0].x, x);
  play.host.pause(true); play.guest.pause(false); play.flush(); assert.equal(play.hostGame.paused, true);
  play.host.pause(false); play.flush(); assert.equal(play.hostGame.paused, false); assert.equal(play.guestGame.paused, false);
  assert.equal(play.guest.setInput('tsuki', true), true);
});

test('redundant resume request does not strand a held host direction', () => {
  const play = pair(); play.contact(); play.host.setInput('left', true);
  play.guest.pause(false); play.flush();
  assert.equal(play.hostGame.inputs[0].held.left, true);
  assert.equal(play.host.setInput('left', false), true);
  assert.equal(play.hostGame.inputs[0].held.left, false);
});

test('duplicate input, duplicate snapshots and replayed events are ignored', () => {
  const play = pair(); play.contact();
  play.guest.setInput('tsuki', true); const input = latest(play, 'game-input', 'host'); play.flush();
  assert.equal(play.host.receive(input), false);
  play.advance(.25);
  const hitFrame = play.sent.find(item => item.message.type === 'game-frame' && item.message.events.some(event => event.event.type === 'hit')).message;
  const hits = play.guestEvents.filter(event => event.type === 'hit').length;
  assert.equal(play.guest.receive(hitFrame), false);
  const replay = JSON.parse(JSON.stringify(latest(play, 'game-frame'))); replay.seq += 100; replay.events = hitFrame.events;
  assert.equal(play.guest.receive(replay), true);
  assert.equal(play.guestEvents.filter(event => event.type === 'hit').length, hits);
});

test('new epoch resets a rematch and rejects previous frame, input and start packets', () => {
  const play = pair(); play.contact(); play.guest.setInput('mae', true); play.flush(); play.advance(.2);
  const input = latest(play, 'game-input', 'host'), frame = latest(play, 'game-frame'), start = latest(play, 'game-start');
  assert.equal(play.host.startHost({ epoch: 2, mode: 'training', fighters: ['samuel', 'angelo'] }), true); play.flush();
  assert.equal(play.guest.epoch, 2); assert.equal(play.guest.state.mode, 'training');
  assert.equal(play.guest.state.fighters[0].id, 'samuel');
  assert.equal(play.host.receive(input), false); assert.equal(play.guest.receive(frame), false); assert.equal(play.guest.receive(start), false);
  assert.equal(play.guest.state.fighters[0].hp, 1000);
});

test('dropped congested snapshots preserve authoritative hit events for the next successful send', () => {
  const play = pair(); play.contact(); play.dropFrames(true);
  play.guest.setInput('tsuki', true); play.flush(); play.advance(.25);
  assert.equal(play.guestEvents.filter(event => event.type === 'hit').length, 0);
  assert.equal(play.hostEvents.filter(event => event.type === 'hit').length, 1);
  play.dropFrames(false); play.advance(.08);
  assert.equal(play.guestEvents.filter(event => event.type === 'hit').length, 1);
  assert.equal(play.guest.state.fighters[0].hp, 935);
});

test('heartbeat corrects stale held keys without manufacturing attack presses', () => {
  const play = pair(); play.contact();
  play.hostGame.setInput(1, 'block', true); play.hostGame.setInput(1, 'block', false);
  play.hostGame.setInput(1, 'right', true); play.hostGame.inputs[1].pressed = [];
  play.guest.localHeld.tsuki = true; play.advance(.3);
  assert.equal(play.hostGame.inputs[1].held.right, false);
  assert.equal(play.hostGame.inputs[1].held.tsuki, false);
  assert.equal(play.hostEvents.filter(event => event.type === 'attack').length, 0);
});

test('missing remote input releases holds, then connection timeout pauses the game', () => {
  const play = pair(); play.contact(); play.guest.setInput('right', true); play.flush();
  play.setTime(1100); play.host.update(.01);
  assert.equal(play.hostGame.inputs[1].held.right, false);
  play.setTime(5100); play.host.update(.01);
  assert.equal(play.host.connected, false); assert.equal(play.hostGame.paused, true);
  assert.equal(play.hostStatus.at(-1).status, 'disconnected');
});

test('explicit disconnect and disposal release inputs and restore the local engine', () => {
  const play = pair('training'); play.contact(); play.host.setInput('block', true); play.guest.setInput('mae', true); play.flush();
  play.host.disconnect('Il giocatore ha lasciato la stanza');
  assert.equal(play.hostGame.paused, true); assert.equal(play.host.setInput('mae', true), false);
  assert.ok(play.hostGame.inputs.every(input => Object.values(input.held).every(value => !value)));
  play.host.dispose(); assert.equal(play.hostGame.options.humanOpponent, false);
  play.hostGame.start({ mode: 'training' }); let aiCalls = 0; play.hostGame.updateAI = () => aiCalls++;
  play.hostGame.state.phase = 'fight'; play.hostGame.update(.01); assert.ok(aiCalls > 0);
});

test('remote presentation interpolates position but never changes simulation or authoritative damage', () => {
  const play = pair('training', { interpolationMs: 50 }); play.contact();
  play.host.setInput('left', true); play.advance(.4);
  const authoritative = play.guest.state.fighters[0].x, render = play.guest.renderState.fighters[0].x;
  assert.ok(render > authoritative, 'render position trails movement by one snapshot');
  assert.equal(play.guest.state.fighters[0].x, authoritative);
  assert.equal(play.guest.renderState.fighters[0].hp, play.guest.state.fighters[0].hp);
});

test('match completion callback runs once on both peers and resets on rematch', () => {
  const play = pair(); play.contact(); play.host.state.fighters[0].wins = 1; play.host.state.fighters[1].hp = 1;
  play.host.setInput('tsuki', true); play.advance(.3); assert.deepEqual(play.ends(), [1, 1]);
  play.advance(.4); assert.deepEqual(play.ends(), [1, 1]);
  play.host.startHost({ epoch: 2, mode: 'versus', fighters: ['angelo', 'samuel'] }); play.flush();
  play.contact(); play.host.state.fighters[0].wins = 1; play.host.state.fighters[1].hp = 1;
  play.host.setInput('tsuki', true); play.advance(.3); assert.deepEqual(play.ends(), [2, 2]);
});

test('malformed snapshot and command data cannot replace state or alter the remote player', () => {
  const play = pair(); play.advance(.1); const valid = latest(play, 'game-frame');
  for (const mutate of [message => { message.state.fighters[0].x = 1e100; }, message => { message.state.fighters[0].id = '__proto__'; }, message => { message.state.fighters[1].player = 0; }, message => { message.state.mode = 'cpu'; }, message => { message.state.fighters[1].hp = -1; }, message => { message.state.timer = null; }]) {
    const bad = JSON.parse(JSON.stringify(valid)); bad.seq += 100; mutate(bad);
    assert.equal(play.guest.receive(bad), false);
  }
  assert.equal(play.host.receive({ type: 'game-input', v: 1, epoch: 1, seq: 100, action: '__proto__', down: true, allowDash: true }), false);
  assert.equal(play.host.receive({ type: 'game-input', v: 1, epoch: 1, seq: 100, action: 'mae', down: 'yes', allowDash: true }), false);
  assert.equal(play.host.startHost({ epoch: 2, mode: 'versus', fighters: ['arcade-player', 'samuel'] }), false);
});
