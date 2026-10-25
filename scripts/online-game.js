/* Authoritative two-player simulation over an ordered, reliable message channel. */
(function (global) {
  'use strict';
  const ACTIONS = ['left', 'right', 'jump', 'block', 'legBlock', 'tsuki', 'shita', 'kagi', 'mae', 'mawashi', 'ushiro', 'gedan', 'kaiten'];
  const PHASES = ['intro', 'fight', 'roundOver', 'matchOver'];
  const EVENTS = ['round', 'announcement', 'fight', 'jump', 'land', 'whiff', 'dash', 'attack', 'special', 'noKi', 'block', 'hit', 'combo', 'footstep', 'ko', 'time', 'match'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const slot = value => value === null || value === 0 || value === 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const held = () => Object.fromEntries(ACTIONS.map(action => [action, false]));
  const moves = () => global.KyokushinMoves || (typeof require === 'function' ? require('./game.js').KyokushinMoves : {});

  function encodeState(state) {
    // The transport serializes once. Copy only mutable state here instead of
    // stringifying and parsing the entire match on every network frame.
    return { ...state, timer: Number.isFinite(state.timer) ? state.timer : null,
      fighters: state.fighters.map(fighter => {
        const encoded = { ...fighter, comboMoves: fighter.comboMoves.slice(),
          inputQueue: fighter.inputQueue.map(item => ({ ...item })),
          buffer: fighter.buffer ? { ...fighter.buffer } : null };
        if (fighter.attack) {
          // Definitions are versioned game code, never data supplied by a peer.
          const { def, ...attack } = fighter.attack;
          encoded.attack = { ...attack, hitTime: Number.isFinite(attack.hitTime) ? attack.hitTime : null };
        }
        return encoded;
      }) };
  }

  function decodeState(raw, game, expectedIds) {
    if (!record(raw) || !Array.isArray(raw.fighters) || raw.fighters.length !== 2 || !PHASES.includes(raw.phase) || !['versus', 'training'].includes(raw.mode)) return null;
    if (!integer(raw.round) || raw.round < 1 || raw.round > 999 || !slot(raw.winner) || !slot(raw.roundWinner) || typeof raw.paused !== 'boolean') return null;
    if (raw.timer !== null && (!finite(raw.timer) || raw.timer < 0 || raw.timer > 60)) return null;
    if (raw.timer === null && raw.mode !== 'training') return null;
    for (const field of ['phaseTime', 'elapsed', 'hitstop', 'pace']) if (!finite(raw[field]) || raw[field] < 0) return null;
    for (const field of ['announcement', 'announcementSub']) if (typeof raw[field] !== 'string' || raw[field].length > 160) return null;
    if (!['easy', 'normal', 'hard'].includes(raw.difficulty)) return null;
    const definitions = moves(), fighters = [];
    for (let player = 0; player < 2; player++) {
      const source = raw.fighters[player];
      if (!record(source) || source.player !== player || !own(game.characters, source.id) || source.id === 'arcade-player' || (expectedIds && source.id !== expectedIds[player])) return null;
      const fighter = game.makeFighter(source.id, player, 0);
      for (const [key, defaultValue] of Object.entries(fighter)) {
        if (['attack', 'buffer', 'inputQueue', 'comboMoves'].includes(key)) continue;
        const value = source[key];
        if (typeof defaultValue === 'number') { if (!finite(value)) return null; }
        else if (typeof defaultValue === 'boolean') { if (typeof value !== 'boolean') return null; }
        else if (typeof defaultValue === 'string') { if (typeof value !== 'string' || value.length > 64) return null; }
        else if (['move', 'previousMove'].includes(key)) { if (value !== null && !own(definitions, value)) return null; }
        else if (['lastHitBy', 'comboTarget'].includes(key)) { if (!slot(value)) return null; }
        else if (key === 'guardType') { if (![null, 'arms', 'leg'].includes(value)) return null; }
        else if (key === 'stunType') { if (![null, 'hit', 'block'].includes(value)) return null; }
        fighter[key] = value;
      }
      if (fighter.facing !== -1 && fighter.facing !== 1) return null;
      if (fighter.hp < 0 || fighter.hp > fighter.maxHp || fighter.maxHp !== 1000 || fighter.ki < 0 || fighter.ki > 100 || fighter.maxKi !== 100) return null;
      if (fighter.x < 0 || fighter.x > 1280 || fighter.y < -1500 || fighter.y > 720) return null;
      if (!Array.isArray(source.comboMoves) || source.comboMoves.length > 6 || source.comboMoves.some(move => !own(definitions, move))) return null;
      if (!Array.isArray(source.inputQueue) || source.inputQueue.length > 3 || source.inputQueue.some(item => !record(item) || !own(definitions, item.move) || !finite(item.ttl))) return null;
      fighter.comboMoves = source.comboMoves.slice();
      fighter.inputQueue = source.inputQueue.map(item => ({ move: item.move, ttl: item.ttl }));
      fighter.buffer = fighter.inputQueue[0] || null;
      if (source.attack !== null) {
        const attack = source.attack;
        if (!record(attack) || !own(definitions, attack.move) || !integer(attack.serial) || (attack.hitTime !== null && !finite(attack.hitTime))) return null;
        fighter.attack = { move: attack.move, def: definitions[attack.move], serial: attack.serial, hitTime: attack.hitTime === null ? Infinity : attack.hitTime };
        for (const key of ['linked', 'hitApplied', 'hitConfirmed', 'whiffEmitted', 'landingEmitted']) {
          if (typeof attack[key] !== 'boolean') return null;
          fighter.attack[key] = attack[key];
        }
      }
      fighters.push(fighter);
    }
    return { fighters, phase: raw.phase, round: raw.round, timer: raw.timer === null ? Infinity : raw.timer,
      winner: raw.winner, roundWinner: raw.roundWinner, announcement: raw.announcement, announcementSub: raw.announcementSub,
      phaseTime: raw.phaseTime, elapsed: raw.elapsed, hitstop: raw.hitstop, paused: raw.paused,
      mode: raw.mode, difficulty: raw.difficulty, pace: raw.pace };
  }

  class DojoOnlineGame {
    constructor(options = {}) {
      if (!options.game || typeof options.send !== 'function') throw new TypeError('Motore e canale online richiesti');
      this.game = options.game;
      this.send = options.send;
      this.role = options.role === 'host' ? 'host' : 'guest';
      this.now = options.now || (() => global.performance?.now?.() ?? Date.now());
      this.onRemoteState = options.onRemoteState || (() => {});
      this.onMatchEnd = options.onMatchEnd || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.originalEvent = this.game.onEvent;
      this.replayEvent = options.onEvent || this.originalEvent;
      this.interpolationMs = Number.isFinite(options.interpolationMs) ? Math.max(0, Math.min(100, options.interpolationMs)) : 50;
      this.timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : 5000;
      this.epoch = 0; this.running = false; this.disposed = false; this.connected = true; this.reconnecting = false;
      this.localHeld = held(); this.snapshots = []; this.events = []; this.pauseVotes = [false, false];
      this.eventHook = event => {
        if (this.running && this.role === 'host') this.events.push({ seq: ++this.eventSeq, event: clone(event) });
        this.originalEvent?.(event);
      };
      this.game.onEvent = this.eventHook;
    }

    get playerIndex() { return this.role === 'host' ? 0 : 1; }
    get state() { return this.game.getState(); }
    get snapshot() { return this.state; }
    get renderState() {
      if (this.role === 'host' || this.snapshots.length < 2 || this.state.paused) return this.state;
      const target = this.now() - this.interpolationMs;
      let before = this.snapshots[0], after = this.snapshots[this.snapshots.length - 1];
      for (let index = 1; index < this.snapshots.length; index++) {
        if (this.snapshots[index].time >= target) { before = this.snapshots[index - 1]; after = this.snapshots[index]; break; }
        before = this.snapshots[index];
      }
      if (before === after || before.state.round !== after.state.round || before.state.phase !== after.state.phase) return this.state;
      const ratio = Math.max(0, Math.min(1, (target - before.time) / Math.max(1, after.time - before.time)));
      const state = { ...after.state, fighters: after.state.fighters.map((fighter, index) => {
        const previous = before.state.fighters[index];
        // Never interpolate damage, guards, attack identity, facing or round changes.
        return { ...fighter, x: previous.x + (fighter.x - previous.x) * ratio, y: previous.y + (fighter.y - previous.y) * ratio };
      }) };
      return state;
    }

    _status(status, details = {}) { this.onStatus(status, { epoch: this.epoch, role: this.role, ...details }); }
    _send(type, payload = {}) {
      if (this.disposed || !this.connected || this.reconnecting) return false;
      try {
        const sent = this.send({ type, v: 1, epoch: this.epoch, ...payload }) !== false;
        // Only state frames may be dropped by the transport under backpressure.
        if (!sent && type !== 'game-frame') this.disconnect('Connessione interrotta');
        return sent;
      }
      catch (_) { this.disconnect('Connessione interrotta'); return false; }
    }
    _reset(epoch) {
      this.epoch = epoch; this.running = true; this.connected = true; this.reconnecting = false;
      this.frameSeq = 0; this.remoteFrameSeq = -1; this.controlSeq = 0; this.remoteControlSeq = -1;
      this.eventSeq = 0; this.remoteEventSeq = 0; this.events = []; this.snapshots = [];
      this.localHeld = held(); this.pauseVotes = [false, false]; this.frameElapsed = 0;
      this.lastFramePaused = false;
      this.lastSeen = this.lastHeartbeat = this.lastRemoteInput = this.now();
      this.ended = false; this.game.clearInput();
    }
    startHost(options = {}) {
      if (this.disposed) return false;
      const epoch = options.epoch ?? this.epoch + 1;
      const ids = options.fighters;
      if (!integer(epoch) || epoch <= this.epoch || !['versus', 'training'].includes(options.mode) || !Array.isArray(ids) || ids.length !== 2 || ids.some(id => !own(this.game.characters, id) || id === 'arcade-player')) return false;
      this.role = 'host'; this.ids = ids.slice(); this._reset(epoch);
      this.game.start({ player: ids[0], opponent: ids[1], mode: options.mode, difficulty: 'normal', humanOpponent: true });
      const sent = this._send('game-start', { seq: 0, fighters: ids.slice(), mode: options.mode, state: encodeState(this.state), events: this.events.slice() });
      if (!sent) return false;
      if (sent) this.events.length = 0;
      this._status('started', { fighters: ids.slice(), mode: options.mode });
      return sent;
    }
    _receiveStart(message) {
      if (this.role !== 'guest' || !integer(message.epoch) || message.epoch <= this.epoch || !Array.isArray(message.fighters) || message.fighters.length !== 2 || !['versus', 'training'].includes(message.mode)) return false;
      const state = decodeState(message.state, this.game, message.fighters);
      if (!state || state.mode !== message.mode || message.seq !== 0) return false;
      this.ids = message.fighters.slice(); this._reset(message.epoch);
      this.game.options = { ...this.game.options, player: this.ids[0], opponent: this.ids[1], mode: state.mode, humanOpponent: true };
      this._applyState(state, 0, true);
      this._receiveEvents(message.events);
      this._send('game-heartbeat', { seq: ++this.controlSeq, held: this.localHeld });
      if (!this.connected) return false;
      this._status('started', { fighters: this.ids.slice(), mode: state.mode });
      return true;
    }
    _applyState(state, sequence, started = false) {
      this.game.state = state; this.game.paused = state.paused; this.remoteFrameSeq = sequence;
      if (state.paused) this.localHeld = held();
      this.snapshots.push({ time: this.now(), state });
      while (this.snapshots.length > 6) this.snapshots.shift();
      this.onRemoteState(state, { epoch: this.epoch, started, seq: sequence });
      this._matchEnd();
    }
    _receiveEvents(events) {
      if (!Array.isArray(events) || events.length > 256) return;
      for (const item of events) {
        if (!record(item) || !integer(item.seq) || item.seq <= this.remoteEventSeq || !record(item.event) || !EVENTS.includes(item.event.type)) continue;
        const event = {};
        for (const [key, value] of Object.entries(item.event)) {
          if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
          if (value === null || typeof value === 'boolean' || finite(value) || (typeof value === 'string' && value.length <= 160)) event[key] = value;
          else if (key === 'comboMoves' && Array.isArray(value) && value.length <= 6 && value.every(move => own(moves(), move))) event[key] = value.slice();
        }
        if (event.player !== undefined && ![0, 1].includes(event.player)) continue;
        if (event.target !== undefined && ![0, 1].includes(event.target)) continue;
        this.remoteEventSeq = item.seq; this.replayEvent?.(event);
      }
    }
    receive(message) {
      if (this.disposed || !this.connected || !record(message) || message.v !== 1 || typeof message.type !== 'string') return false;
      if (message.type === 'game-start') return this._receiveStart(message);
      if (!this.running || message.epoch !== this.epoch) return false;
      if (message.type === 'game-frame') {
        if (this.role !== 'guest' || !integer(message.seq) || message.seq <= this.remoteFrameSeq) return false;
        const state = decodeState(message.state, this.game, this.ids);
        if (!state || state.mode !== this.state.mode) return false;
        this.lastSeen = this.now();
        const wasPaused = this.game.paused;
        this._applyState(state, message.seq); this._receiveEvents(message.events);
        if (wasPaused !== state.paused) this._status(state.paused ? 'paused' : 'resumed', { paused: state.paused });
        return true;
      }
      if (!['game-input', 'game-reset', 'game-pause', 'game-heartbeat'].includes(message.type) || !integer(message.seq) || message.seq <= this.remoteControlSeq) return false;
      if (message.type === 'game-input' && (this.role !== 'host' || !ACTIONS.includes(message.action) || typeof message.down !== 'boolean' || typeof message.allowDash !== 'boolean')) return false;
      if (message.type === 'game-pause' && (this.role !== 'host' || typeof message.paused !== 'boolean')) return false;
      if (message.type === 'game-reset' && this.role !== 'host') return false;
      if (message.type === 'game-heartbeat' && (!record(message.held) || ACTIONS.some(action => typeof message.held[action] !== 'boolean'))) return false;
      this.remoteControlSeq = message.seq; this.lastSeen = this.lastRemoteInput = this.now();
      if (message.type === 'game-input') this.game.setInput(1, message.action, message.down, { allowDash: message.allowDash });
      else if (message.type === 'game-reset') this.game.clearInput(1);
      else if (message.type === 'game-pause') this._setPause(1, message.paused);
      else if (message.type === 'game-heartbeat' && this.role === 'host') {
        // Heartbeats release stale holds only. They must never synthesize a tap.
        for (const action of ACTIONS) if (!message.held[action] && this.game.inputs[1].held[action]) this.game.setInput(1, action, false);
      }
      return true;
    }
    setInput(action, down, meta = {}) {
      if (!this.running || this.disposed || !this.connected || this.reconnecting || !ACTIONS.includes(action) || typeof down !== 'boolean' || (down && this.game.paused)) return false;
      if (this.localHeld[action] === down) return false;
      this.localHeld[action] = down;
      const allowDash = meta.allowDash !== false && meta.phase !== 'move';
      if (this.role === 'host') this.game.setInput(0, action, down, { allowDash });
      else this._send('game-input', { seq: ++this.controlSeq, action, down, allowDash });
      return true;
    }
    clearInput() {
      this.localHeld = held();
      this.game.clearInput(this.playerIndex);
      if (this.running && this.role === 'guest') this._send('game-reset', { seq: ++this.controlSeq });
    }
    _setPause(player, value) {
      this.pauseVotes[player] = value;
      const paused = this.pauseVotes.some(Boolean), changed = this.game.paused !== paused;
      this.game.pause(paused);
      if (paused || changed) this.localHeld = held();
      if (changed) this._status(paused ? 'paused' : 'resumed', { paused, by: player, votes: this.pauseVotes.slice() });
      this._frame(true);
    }
    pause(value = !this.game.paused) {
      if (!this.running || this.disposed || !this.connected || this.reconnecting || typeof value !== 'boolean') return false;
      this.clearInput();
      if (this.role === 'host') this._setPause(0, value);
      else this._send('game-pause', { seq: ++this.controlSeq, paused: value });
      return true;
    }
    _frame(force = false) {
      if (this.role !== 'host' || (!force && this.frameElapsed < 1 / 30)) return false;
      this.frameElapsed %= 1 / 30;
      const state = this.state;
      // A paused simulation is immutable. Its first frame must get through;
      // subsequent liveness still uses heartbeats, without 30 duplicate frames/s.
      if (!force && state.paused && this.lastFramePaused && !this.events.length) return false;
      const sent = this._send('game-frame', { seq: ++this.frameSeq, ackInput: this.remoteControlSeq, state: encodeState(state), events: this.events.slice(0, 256) });
      if (sent) { this.events.splice(0, 256); this.lastFramePaused = state.paused; }
      return sent;
    }
    _matchEnd() {
      if (!this.ended && this.state.phase === 'matchOver') { this.ended = true; this.onMatchEnd(this.state, { epoch: this.epoch }); }
    }
    setReconnecting(value) {
      if (this.disposed || !this.running || !this.connected || typeof value !== 'boolean' || value === this.reconnecting) return;
      this.reconnecting = value; this.localHeld = held(); this.game.clearInput();
      if (!value) {
        // This grace belongs only to a peer whose transport reported recovery.
        // The other peer retains its own independent liveness deadline.
        this.lastSeen = this.lastHeartbeat = this.lastRemoteInput = this.now();
        if (this.role === 'guest') this._send('game-reset', { seq: ++this.controlSeq });
        else this._frame(true);
      }
    }
    update(dt) {
      if (!this.running || this.disposed || !this.connected || this.reconnecting) return this.state;
      const now = this.now();
      if (now - this.lastSeen > this.timeoutMs) { this.disconnect('L’altro giocatore non risponde'); return this.state; }
      if (this.role === 'host') {
        if (now - this.lastRemoteInput > 1000) this.game.clearInput(1);
        this.game.update(dt);
        if (Number.isFinite(dt) && dt > 0) this.frameElapsed += Math.min(dt, .1);
        this._frame(); this._matchEnd();
      }
      if (now - this.lastHeartbeat >= 250) {
        this.lastHeartbeat = now;
        this._send('game-heartbeat', { seq: ++this.controlSeq, held: { ...this.localHeld } });
      }
      return this.state;
    }
    disconnect(reason = 'Connessione interrotta') {
      if (this.disposed || !this.connected) return;
      this.connected = false; this.running = false; this.localHeld = held(); this.game.clearInput(); this.game.pause(true);
      this._status('disconnected', { reason });
    }
    dispose() {
      if (this.disposed) return;
      this.clearInput(); this.running = false; this.disposed = true; this.connected = false;
      this.game.clearInput(); this.game.pause(true); this.game.options.humanOpponent = false;
      if (this.game.onEvent === this.eventHook) this.game.onEvent = this.originalEvent;
      this.events = []; this.snapshots = [];
    }
  }
  global.DojoOnlineGame = DojoOnlineGame;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DojoOnlineGame, encodeState, decodeState };
})(typeof window !== 'undefined' ? window : globalThis);
