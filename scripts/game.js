/* game.js */
/* Bodyplanet — Kyokushin Spirit. A small, dependency-free fighting engine. */
(function (global) {
  'use strict';

  const ROSTER = global.KyokushinRoster || { angelo: { short: 'ANGELO' }, samuel: { short: 'SAMUEL' } };
  const FLOOR = 625;
  const LEFT = 90;
  const RIGHT = 1190;
  const MAX_HP = 1000;
  const PACE = 1.3;
  const QUEUE_WINDOW = .68;
  const MAX_COMBO = 6;
  const DASH_TAP_WINDOW = .25;
  const ACTIONS = ['left', 'right', 'jump', 'block', 'legBlock', 'tsuki', 'shita', 'kagi', 'mae', 'mawashi', 'ushiro', 'gedan', 'kaiten'];
  const ATTACKS = ['tsuki', 'gyaku', 'shita', 'kagi', 'mae', 'mawashi', 'ushiro', 'gedan', 'kaiten'];
  const KICKS = new Set(['mae', 'mawashi', 'ushiro', 'gedan', 'kaiten']);
  const BASE_MOVES = {
    tsuki:  { name: 'Chūdan tsuki', shortName: 'TSUKI', duration: .34, start: .095, end: .17, damage: 65, reach: 142, height: 149, radius: 37, level: 'body', stun: .25, push: 140, lunge: 52, ki: 7 },
    gyaku:  { name: 'Gyaku tsuki', shortName: 'GYAKU TSUKI', duration: .43, start: .13, end: .22, damage: 95, reach: 161, height: 143, radius: 36, level: 'body', stun: .29, push: 185, lunge: 105, ki: 9 },
    shita:  { name: 'Shita tsuki', shortName: 'SHITA TSUKI', duration: .46, start: .135, end: .235, damage: 90, reach: 149, height: 155, radius: 31, level: 'body', stun: .30, push: 145, lunge: 95, ki: 9 },
    kagi:   { name: 'Kagi tsuki', shortName: 'KAGI TSUKI', duration: .54, start: .19, end: .29, damage: 110, reach: 174, height: 145, radius: 34, level: 'body', stun: .36, push: 205, lunge: 105, ki: 10 },
    gedan:  { name: 'Gedan mawashi geri', shortName: 'GEDAN', duration: .57, start: .20, end: .31, damage: 90, reach: 199, height: 57, radius: 33, level: 'low', stun: .32, push: 165, lunge: 50, ki: 10 },
    mae:    { name: 'Mae geri', shortName: 'MAE GERI', duration: .62, start: .20, end: .32, damage: 120, reach: 218, height: 145, radius: 38, level: 'body', stun: .36, push: 235, lunge: 90, ki: 11 },
    mawashi:{ name: 'Jōdan mawashi geri', shortName: 'MAWASHI GERI', duration: .75, start: .265, end: .385, damage: 145, reach: 235, height: 215, radius: 28, level: 'high', stun: .39, push: 280, lunge: 75, ki: 13 },
    ushiro: { name: 'Ushiro geri', shortName: 'USHIRO GERI', duration: .88, start: .36, end: .49, damage: 185, reach: 248, height: 153, radius: 39, level: 'body', stun: .46, push: 420, lunge: 118, ki: 16 },
    kaiten: { name: 'Kaiten dō mawashi geri', shortName: 'KAITEN GERI', duration: 1.13, start: .36, end: .61, damage: 235, reach: 248, height: 178, radius: 65, level: 'high', stun: .57, push: 405, lunge: 225, ki: 0, cost: 45, knockdown: true },
  };
  const MOVES = Object.freeze(Object.fromEntries(Object.entries(BASE_MOVES).map(([id, def]) => [id, Object.freeze({
    ...def, duration: def.duration / PACE, start: def.start / PACE, end: def.end / PACE,
    stun: def.stun / PACE, lunge: def.lunge * PACE, push: def.push * PACE,
  })])));
  const CHAINS = {
    tsuki: ['gyaku', 'shita', 'mae', 'gedan'], gyaku: ['shita', 'kagi', 'mae', 'gedan'],
    shita: ['kagi', 'mae'], kagi: ['mae', 'mawashi', 'ushiro'],
    mae: ['mawashi', 'ushiro'], gedan: ['mae'], mawashi: ['kaiten'],
  };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;

  class KyokushinGame {
    constructor(options = {}) {
      this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
      this.random = options.random || Math.random;
      this.characters = { ...ROSTER };
      this.options = { player: 'angelo', mode: 'cpu', difficulty: 'normal', humanOpponent: false };
      this.inputs = [this.newInput(), this.newInput()];
      this.paused = false;
      this.state = null;
      this.start(this.options);
    }

    newInput() { return { held: Object.fromEntries(ACTIONS.map(a => [a, false])), pressed: [], directionTap: null }; }

    registerArcadeCharacter(profile) {
      const name = String(profile?.name || '').normalize('NFC').trim().replace(/ +/g, ' ');
      if ([...name].length < 2 || [...name].length > 24 || !/^[\p{L}\p{M}\p{N} .’'\-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) throw new TypeError('Nome del karateka non valido');
      this.characters['arcade-player'] = Object.freeze({ name, short: name.toUpperCase() });
    }

    makeFighter(id, player, x) {
      return {
        id, player, x, y: FLOOR, vx: 0, vy: 0, facing: player === 0 ? 1 : -1,
        state: 'idle', move: null, previousMove: null, moveProgress: 0, moveTime: 0,
        hp: MAX_HP, maxHp: MAX_HP, ki: 45, maxKi: 100, combo: 0, wins: 0,
        stun: 0, invulnerable: 0, hitFlash: 0, guardFlash: 0, walkCycle: 0,
        lastDamage: 0, comboDamage: 0, comboTimer: 0, comboMoves: [], comboActive: false, comboTarget: null, lastHitBy: null, attackSerial: 0,
        attack: null, buffer: null, inputQueue: [], crouching: false, blocking: false,
        guardType: null, legBlocking: false, stunType: null, movement: 0, retreating: false,
        dashProgress: 0, dashDirection: 0, dashBack: false, dashRemaining: 0, dashDuration: 0, dashDistance: 0, dashCooldown: 0, dashSettling: false,
        airborne: false, knockdown: false, recovery: 0,
      };
    }

    start(options = {}) {
      this.options = { ...this.options, ...options };
      if (!Object.prototype.hasOwnProperty.call(this.characters, this.options.player)) this.options.player = 'angelo';
      if (!Object.prototype.hasOwnProperty.call(this.characters, this.options.opponent)) this.options.opponent = this.options.player === 'samuel' ? 'angelo' : 'samuel';
      if (!['cpu', 'versus', 'training'].includes(this.options.mode)) this.options.mode = 'cpu';
      if (!['easy', 'normal', 'hard'].includes(this.options.difficulty)) this.options.difficulty = 'normal';
      this.options.humanOpponent = this.options.humanOpponent === true;
      this.inputs = [this.newInput(), this.newInput()];
      const id = this.options.player;
      this.state = {
        fighters: [this.makeFighter(id, 0, 380), this.makeFighter(this.options.opponent, 1, 900)],
        phase: 'intro', round: 1, timer: this.options.mode === 'training' ? Infinity : 60,
        winner: null, roundWinner: null, announcement: 'ROUND 1', announcementSub: 'SPIRITO • TECNICA • RISPETTO',
        phaseTime: 0, elapsed: 0, hitstop: 0, paused: false,
        mode: this.options.mode, difficulty: this.options.difficulty, pace: PACE,
      };
      this.paused = false;
      this.ai = { decision: .25, guard: 0, retreat: 0, attackCooldown: .55, reaction: 0 };
      this.emit('round', { round: 1, announcement: 'ROUND 1' });
      return this.state;
    }

    reset() { return this.start(this.options); }
    getState() { return this.state; }
    pause(value = !this.paused) {
      this.paused = !!value;
      this.state.paused = this.paused;
      if (this.paused) this.clearInput();
      return this.paused;
    }
    clearInput(playerIndex) {
      if (playerIndex === 0 || playerIndex === 1) this.inputs[playerIndex] = this.newInput();
      else this.inputs = [this.newInput(), this.newInput()];
    }

    setInput(playerIndex, action, pressed, options = {}) {
      const input = this.inputs[playerIndex];
      if (!input || !ACTIONS.includes(action)) return;
      if (this.paused && pressed) return;
      const edge = pressed && !input.held[action];
      input.held[action] = !!pressed;
      const direction = action === 'left' || action === 'right';
      const allowDash = options?.allowDash !== false;
      // Sliding a held thumb between buttons is movement, not a second tap.
      if (direction && !allowDash) input.directionTap = null;
      if (edge) {
        input.pressed.push(action);
        if (direction && allowDash) {
          const fighter = this.state.fighters[playerIndex];
          const opposite = action === 'left' ? 'right' : 'left';
          if (!this.canDash(fighter, input) || input.held[opposite]) { input.directionTap = null; return; }
          const previous = input.directionTap;
          input.directionTap = { action, time: this.state.elapsed };
          if (previous?.action === action && this.state.elapsed - previous.time <= DASH_TAP_WINDOW) {
            this.beginDash(fighter, action === 'right' ? 1 : -1);
            input.directionTap = null;
          }
        }
      }
    }

    emit(type, details = {}) { this.onEvent({ type, ...details }); }

    update(dt) {
      if (this.paused || !this.state || !Number.isFinite(dt) || dt <= 0) return this.state;
      // Catch-up stays bounded after a hidden tab; normal frames retain their full time.
      let remaining = Math.min(dt, .1);
      while (remaining > .000001) {
        const step = Math.min(remaining, 1 / 120);
        this.step(step);
        remaining -= step;
      }
      return this.state;
    }

    step(dt) {
      const s = this.state;
      s.elapsed += dt;
      for (const fighter of s.fighters) {
        fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
        fighter.guardFlash = Math.max(0, fighter.guardFlash - dt);
      }
      // The round clock uses real play time, including short impact freezes.
      if (s.phase === 'fight' && s.mode !== 'training') s.timer = Math.max(0, s.timer - dt);
      if (s.hitstop > 0) {
        s.hitstop = Math.max(0, s.hitstop - dt);
        if (s.phase === 'fight' && s.timer <= 0) this.finishRound('time');
        return;
      }
      s.phaseTime += dt;

      if (s.phase === 'intro') {
        this.discardPressed();
        if (s.phaseTime > .85 && s.announcement !== 'HAJIME!') {
          s.announcement = 'HAJIME!'; s.announcementSub = 'COMBATTI CON SPIRITO';
          this.emit('announcement', { text: 'HAJIME!' });
        }
        if (s.phaseTime >= 1.55) {
          s.phase = 'fight'; s.phaseTime = 0; s.announcement = ''; s.announcementSub = '';
          this.emit('fight', { round: s.round });
        }
        return;
      }

      if (s.phase === 'roundOver' || s.phase === 'matchOver') {
        this.discardPressed();
        for (const fighter of s.fighters) this.updatePhysics(fighter, dt);
        if (s.phase === 'roundOver' && s.phaseTime >= 2.35) this.nextRound();
        return;
      }

      if (s.mode !== 'versus' && !this.options.humanOpponent) this.updateAI(dt);
      for (let i = 0; i < 2; i++) this.updateFighter(s.fighters[i], s.fighters[1 - i], this.inputs[i], dt);
      this.separateFighters();
      this.finishDashes();

      // Determine both contacts before applying either, allowing honest trades.
      const contacts = [];
      for (let i = 0; i < 2; i++) {
        const a = s.fighters[i], target = s.fighters[1 - i];
        if (!a.attack || a.attack.hitApplied || a.moveTime < a.attack.def.start || a.moveTime > a.attack.def.end) continue;
        if (this.intersects(a, target)) contacts.push([a, target, a.attack]);
      }
      for (const [a, target, attack] of contacts) this.applyHit(a, target, attack);
      // A hit can stop a dash while the fighters overlap. Resolve that contact
      // immediately, before hitstop freezes the interrupted pose.
      if (s.fighters.some(f => f.dashSettling && f.dashRemaining <= 0)) {
        this.separateFighters();
        this.finishDashes();
      }

      if (s.mode === 'training') {
        for (const fighter of s.fighters) {
          if (fighter.hp < MAX_HP && fighter.stun <= 0 && !fighter.knockdown && fighter.comboTimer <= 0) fighter.hp = Math.min(MAX_HP, fighter.hp + 180 * dt);
          if (fighter.hp <= 0) { fighter.hp = MAX_HP; fighter.stun = 0; fighter.knockdown = false; fighter.invulnerable = .65; }
        }
      } else {
        if (s.fighters.some(f => f.hp <= 0)) this.finishRound('ko');
        else if (s.timer <= 0) this.finishRound('time');
      }
    }

    discardPressed() { for (const input of this.inputs) input.pressed.length = 0; }

    updateFighter(f, opponent, input, dt) {
      f.invulnerable = Math.max(0, f.invulnerable - dt);
      f.stun = Math.max(0, f.stun - dt);
      if (f.stun === 0) f.stunType = null;
      f.recovery = Math.max(0, f.recovery - dt);
      f.dashCooldown = Math.max(0, f.dashCooldown - dt);
      f.comboTimer = Math.max(0, f.comboTimer - dt);
      if (opponent.stun <= 0 || opponent.stunType !== 'hit' || opponent.lastHitBy !== f.player || opponent.knockdown) f.comboActive = false;
      if (f.comboTimer === 0) { f.combo = 0; f.comboDamage = 0; f.comboMoves = []; f.comboActive = false; }
      // Queue entries age only at the front; a fast input sequence keeps its order.
      if (f.inputQueue.length) {
        f.inputQueue[0].ttl -= dt;
        if (f.inputQueue[0].ttl <= 0) f.inputQueue.shift();
      }
      this.syncBuffer(f);
      // A little ki regeneration guarantees that the signature technique returns.
      f.ki = Math.min(f.maxKi, f.ki + (this.state.mode === 'training' ? 7 : 2.1) * dt);

      this.updatePhysics(f, dt);
      const dashedThisStep = this.updateDash(f, opponent, dt);
      // Facing must be updated before interpreting the relative back direction.
      if (!f.attack && !dashedThisStep && f.stun <= 0 && !f.knockdown) f.facing = opponent.x >= f.x ? 1 : -1;
      const away = f.facing === 1 ? input.held.left : input.held.right;
      const toward = f.facing === 1 ? input.held.right : input.held.left;
      const retreat = away && !toward;
      const ownsBlockstun = f.stun > 0 && f.stunType === 'block';
      const mayGuard = !dashedThisStep && !f.airborne && !f.attack && !f.knockdown && (f.stun <= 0 || ownsBlockstun);
      if (!mayGuard) f.guardType = null;
      else if (!ownsBlockstun) {
        const check = input.held.legBlock;
        f.guardType = check ? 'leg' : input.held.block || retreat ? 'arms' : null;
      }
      f.legBlocking = f.guardType === 'leg';
      f.blocking = f.guardType !== null;
      f.crouching = false; // Compatibility field: ducking is no longer an action.
      f.movement = 0; f.retreating = false;

      for (const action of input.pressed) {
        if (ATTACKS.includes(action)) this.requestAttack(f, action);
        else if (action === 'jump' && !dashedThisStep && !f.attack && f.stun <= 0 && !f.airborne && !f.knockdown) {
          f.vy = -690 * PACE; f.airborne = true; f.blocking = false; f.legBlocking = false; f.guardType = null; f.crouching = false;
          this.emit('jump', { player: f.player, x: f.x, y: f.y });
        }
      }
      input.pressed.length = 0;

      if (f.attack) {
        const previousProgress = f.moveProgress;
        f.moveTime += dt;
        f.moveProgress = clamp(f.moveTime / f.attack.def.duration, 0, 1);
        f.state = 'attack';
        if (f.move === 'kaiten' && !f.attack.landingEmitted && previousProgress < .82 && f.moveProgress >= .82) {
          f.attack.landingEmitted = true;
          this.emit('land', { player: f.player, x: f.x, y: FLOOR, heavy: true, move: 'kaiten' });
        }
        const def = f.attack.def;
        if (f.moveTime < def.end) {
          const lungeFactor = f.moveTime < def.start ? .65 : 1;
          f.x = clamp(f.x + f.facing * def.lunge * lungeFactor * dt, LEFT, RIGHT);
        }
        if (f.moveTime > def.end && !f.attack.hitApplied && !f.attack.whiffEmitted) {
          f.attack.whiffEmitted = true;
          this.emit('whiff', { player: f.player, move: f.move, x: f.x + f.facing * def.reach, y: f.y - def.height });
        }
        const canCancel = f.attack.hitConfirmed && f.combo < MAX_COMBO && f.moveTime >= f.attack.hitTime + .016 && f.buffer && (CHAINS[f.move] || []).includes(f.buffer.move);
        if (canCancel) {
          const nextMove = this.takeQueuedMove(f);
          f.attack = null;
          this.beginAttack(f, nextMove, true);
        } else if (f.moveTime >= def.duration) {
          f.previousMove = f.move;
          f.move = null; f.attack = null; f.moveProgress = 0; f.moveTime = 0;
          if (f.buffer && f.stun <= 0) {
            const nextMove = this.takeQueuedMove(f);
            this.beginAttack(f, nextMove);
          }
        }
        return;
      }

      if (f.stun > 0 || f.knockdown) {
        f.state = ownsBlockstun ? f.legBlocking ? 'legBlock' : 'block' : 'hit';
        return;
      }
      if (dashedThisStep) {
        f.state = 'dash'; f.movement = f.dashDirection; f.retreating = f.dashBack;
        return;
      }
      if (f.buffer) { const move = this.takeQueuedMove(f); this.beginAttack(f, move); return; }

      let movement = 0;
      if (!f.legBlocking && (!input.held.block || retreat)) movement = Number(input.held.right) - Number(input.held.left);
      if (movement) {
        const backpedal = movement !== f.facing;
        const beforeX = f.x;
        f.x = clamp(f.x + movement * (backpedal ? 180 : 235) * PACE * (f.airborne ? .85 : 1) * dt, LEFT, RIGHT);
        if (!f.airborne) {
          const oldStep = Math.floor(f.walkCycle / Math.PI);
          f.walkCycle += Math.abs(f.x - beforeX) * (backpedal ? 8 / 180 : 11 / 235);
          if (Math.floor(f.walkCycle / Math.PI) > oldStep) this.emit('footstep', { player: f.player, x: f.x, y: f.y, back: backpedal });
        }
        f.movement = movement; f.retreating = backpedal;
      }
      f.state = f.airborne ? 'jump' : f.legBlocking ? 'legBlock' : f.blocking ? 'block' : movement ? 'walk' : 'idle';
    }

    syncBuffer(f) { f.buffer = f.inputQueue[0] || null; }
    takeQueuedMove(f) { const next = f.inputQueue.shift(); this.syncBuffer(f); return next?.move; }
    clearQueue(f) { f.inputQueue.length = 0; f.buffer = null; }

    canDash(f, input = this.inputs[f?.player]) {
      return !!f && !this.paused && this.state.phase === 'fight' && f.hp > 0 &&
        !f.airborne && f.y >= FLOOR && !f.attack && f.stun <= 0 && !f.knockdown &&
        !f.legBlocking && !input?.held.legBlock && !f.inputQueue.length &&
        !input?.pressed.some(action => ATTACKS.includes(action) || action === 'jump') &&
        f.dashRemaining <= 0 && f.dashCooldown <= 0;
    }

    beginDash(f, direction) {
      if (!this.canDash(f)) return false;
      const opponent = this.state.fighters[1 - f.player];
      f.facing = opponent.x >= f.x ? 1 : -1;
      f.dashDirection = direction > 0 ? 1 : -1;
      f.dashBack = f.dashDirection !== f.facing;
      f.dashDuration = f.dashBack ? .20 : .18;
      f.dashDistance = f.dashBack ? 115 : 150;
      f.dashRemaining = f.dashDuration; f.dashProgress = 0; f.dashSettling = true;
      f.dashCooldown = f.dashDuration + .24;
      f.state = 'dash'; f.guardType = null; f.blocking = false; f.legBlocking = false;
      f.crouching = false; f.vx = 0;
      this.emit('dash', { player: f.player, x: f.x, y: f.y, direction: f.dashDirection, back: f.dashBack });
      return true;
    }

    stopDash(f) { f.dashRemaining = 0; }

    updateDash(f, opponent, dt) {
      if (f.dashRemaining <= 0) return false;
      if (f.stun > 0 || f.knockdown || f.hp <= 0 || f.airborne) { this.stopDash(f); return false; }
      const previous = f.dashProgress;
      f.dashRemaining = Math.max(0, f.dashRemaining - dt);
      if (f.dashRemaining < 1e-8) f.dashRemaining = 0;
      f.dashProgress = clamp(1 - f.dashRemaining / f.dashDuration, 0, 1);
      const ease = t => 1 - (1 - t) * (1 - t);
      const distance = f.dashDistance * (ease(f.dashProgress) - ease(previous));
      const desired = f.x + f.dashDirection * distance;
      const next = clamp(desired, LEFT, RIGHT);
      // Dashes may cross the opponent's body; their strike hurtboxes stay live.
      f.x = next;
      if (Math.abs(next - desired) > .01) {
        this.stopDash(f); f.dashProgress = 1;
        f.dashCooldown = Math.min(f.dashCooldown, .24);
      }
      return true;
    }

    updatePhysics(f, dt) {
      if (f.airborne || f.y < FLOOR || f.vy < 0) {
        f.vy += 1840 * PACE * PACE * dt;
        f.y += f.vy * dt;
        if (f.y >= FLOOR) {
          f.y = FLOOR; f.vy = 0;
          if (f.airborne) this.emit('land', { player: f.player, x: f.x, y: FLOOR, heavy: f.knockdown });
          f.airborne = false;
          if (f.knockdown) f.recovery = Math.max(f.recovery, .34 / PACE);
        }
      }
      if (f.knockdown && !f.airborne && f.stun <= 0 && f.recovery <= 0 && f.hp > 0) {
        f.knockdown = false; f.invulnerable = .25;
      }
      f.x = clamp(f.x + f.vx * dt, LEFT, RIGHT);
      f.vx *= Math.exp(-8 * PACE * dt);
      if (Math.abs(f.vx) < .5) f.vx = 0;
    }

    requestAttack(f, action) {
      if (!ATTACKS.includes(action) || f.knockdown || f.hp <= 0) return;
      let move = action;
      // Resolve punches against the queued predecessor, not just the current pose.
      const preceding = f.inputQueue.at(-1)?.move || f.move || (f.comboTimer > 0 ? f.previousMove : null);
      if (action === 'tsuki' && preceding === 'tsuki') move = 'gyaku';
      if (f.attack || f.dashRemaining > 0 || f.dashSettling || f.stun > 0 || f.inputQueue.length) {
        if (f.inputQueue.length < 3) f.inputQueue.push({ move, ttl: QUEUE_WINDOW });
        this.syncBuffer(f);
        return;
      }
      if (MOVES[move].cost && f.ki < MOVES[move].cost) {
        this.emit('noKi', { player: f.player, move, required: MOVES[move].cost });
        return;
      }
      this.beginAttack(f, move);
    }

    beginAttack(f, move, linked = false) {
      const def = MOVES[move];
      if (!def || f.hp <= 0 || f.knockdown || f.stun > 0 || f.dashRemaining > 0 || f.dashSettling) return false;
      if (def.cost && f.ki < def.cost) { this.emit('noKi', { player: f.player, move, required: def.cost }); return false; }
      f.ki -= def.cost || 0;
      f.attack = { def, linked, hitApplied: false, hitConfirmed: false, hitTime: Infinity, whiffEmitted: false, landingEmitted: false, serial: ++f.attackSerial, move };
      // A confirmed link reuses the previous movement's momentum and skips a
      // small amount of preparation, keeping even mae → ushiro continuous.
      f.move = move; f.previousMove = move; f.moveTime = linked ? Math.min(.03, def.start * .22) : 0;
      f.moveProgress = f.moveTime / def.duration;
      f.state = 'attack'; f.blocking = false; f.legBlocking = false; f.guardType = null; f.crouching = false; f.movement = 0; f.retreating = false;
      this.emit('attack', { player: f.player, move, x: f.x, y: f.y, facing: f.facing });
      if (move === 'kaiten') {
        this.emit('special', { player: f.player, move, x: f.x, y: f.y - 150, facing: f.facing });
      }
      return true;
    }

    intersects(attacker, target) {
      if (target.hp <= 0 || target.invulnerable > 0 || target.knockdown) return false;
      const def = attacker.attack.def;
      const distance = (target.x - attacker.x) * attacker.facing;
      if (distance < -20 || distance > def.reach + 27) return false;
      // Jumps clear low kicks through real height geometry; standing height is fixed.
      const hitY = attacker.y - def.height;
      const top = target.y - 236;
      const bottom = target.y - 15;
      return hitY + def.radius >= top && hitY - def.radius <= bottom;
    }

    applyHit(attacker, target, attack) {
      if (attack.hitApplied) return;
      attack.hitApplied = true;
      const def = attack.def;
      const facingAttacker = (attacker.x - target.x) * target.facing >= -25;
      const guardType = target.guardType;
      const blocked = target.blocking && !target.airborne && target.dashRemaining <= 0 && target.state !== 'dash' && facingAttacker &&
        (guardType === 'leg' ? KICKS.has(attack.move) : guardType === 'arms' && def.level !== 'low');
      const x = mix(attacker.x, target.x, .77);
      const y = clamp(attacker.y - def.height, target.y - 215, target.y - 30);
      if (blocked) {
        const chip = def.cost && guardType !== 'leg' ? 12 : 0;
        target.hp = Math.max(1, target.hp - chip);
        target.stun = Math.max(target.stun, def.stun * .48);
        target.stunType = 'block'; target.guardFlash = .17;
        target.state = guardType === 'leg' ? 'legBlock' : 'block';
        target.vx = attacker.facing * def.push * .45;
        target.ki = Math.min(target.maxKi, target.ki + 4);
        attacker.ki = Math.min(attacker.maxKi, attacker.ki + 2);
        this.state.hitstop = Math.max(this.state.hitstop, .026);
        attacker.comboActive = false;
        this.emit('block', { player: attacker.player, target: target.player, x, y, move: attack.move, damage: chip, facing: attacker.facing, guardType });
        return;
      }
      attack.hitConfirmed = true;
      attack.hitTime = attacker.moveTime;
      const connected = attacker.comboActive && attacker.comboTarget === target.player && target.stun > 0 && target.stunType === 'hit' && target.lastHitBy === attacker.player;
      if (!connected) { attacker.combo = 0; attacker.comboDamage = 0; attacker.comboMoves = []; }
      const scaling = Math.max(.38, 1 - attacker.combo * .12);
      const damage = Math.round(def.damage * scaling);
      target.hp = Math.max(0, target.hp - damage);
      this.stopDash(target);
      this.inputs[target.player].directionTap = null;
      target.lastDamage = damage;
      target.hitFlash = .18;
      target.stun = def.stun; target.stunType = 'hit'; target.lastHitBy = attacker.player;
      target.vx = attacker.facing * def.push;
      target.attack = null; target.move = null; target.moveProgress = 0; target.moveTime = 0;
      this.clearQueue(target); target.blocking = false; target.legBlocking = false; target.guardType = null; target.crouching = false; target.state = 'hit'; target.comboActive = false;
      attacker.combo += 1; attacker.comboDamage += damage; attacker.comboTimer = 1.15;
      attacker.comboMoves.push(attack.move); attacker.comboActive = true; attacker.comboTarget = target.player;
      attacker.ki = Math.min(attacker.maxKi, attacker.ki + def.ki);
      target.ki = Math.min(target.maxKi, target.ki + def.ki * .6);
      const comboLimit = attacker.combo >= MAX_COMBO;
      if (def.knockdown || comboLimit || (attack.move === 'ushiro' && attacker.combo >= 3)) {
        target.knockdown = true; target.airborne = true; target.vy = -265 * PACE;
        target.stun = Math.max(target.stun, .62 / PACE);
        attacker.comboActive = false;
        this.clearQueue(attacker);
      }
      this.state.hitstop = Math.max(this.state.hitstop, def.cost ? .072 : damage > 130 ? .052 : .034);
      const comboMoves = [...attacker.comboMoves];
      this.emit('hit', { player: attacker.player, target: target.player, x, y, move: attack.move, damage, combo: attacker.combo, comboDamage: attacker.comboDamage, comboMoves, facing: attacker.facing, knockdown: target.knockdown, comboLimit });
      if (attacker.combo > 1) this.emit('combo', { player: attacker.player, target: target.player, combo: attacker.combo, comboDamage: attacker.comboDamage, comboMoves, x, y, finished: target.knockdown });
    }

    separateFighters() {
      const [a, b] = this.state.fighters;
      if (a.dashRemaining > 0 || b.dashRemaining > 0) return;
      const dashEnded = a.dashSettling || b.dashSettling;
      if (Math.abs(a.y - b.y) > 145 || ((a.knockdown || b.knockdown) && !dashEnded)) return;
      const distance = Math.abs(a.x - b.x);
      if (distance >= 82) return;
      // At an exact meeting point, the dash directions choose the crossed side
      // deterministically, including simultaneous opposite dashes at a wall.
      const crossingDirection = (a.dashSettling ? a.dashDirection : 0) - (b.dashSettling ? b.dashDirection : 0);
      const direction = distance < 1e-6 && crossingDirection ? Math.sign(crossingDirection) : a.x <= b.x ? -1 : 1;
      const middle = clamp((a.x + b.x) * .5, LEFT + 41, RIGHT - 41);
      a.x = middle + direction * 41;
      b.x = middle - direction * 41;
    }

    finishDashes() {
      let ended = false;
      for (const f of this.state.fighters) {
        if (f.dashSettling && f.dashRemaining <= 0) { f.dashSettling = false; ended = true; }
      }
      if (!ended) return;
      for (const f of this.state.fighters) {
        const opponent = this.state.fighters[1 - f.player];
        if (!f.attack && f.dashRemaining <= 0 && !f.knockdown) f.facing = opponent.x >= f.x ? 1 : -1;
      }
    }

    updateAI(dt) {
      const s = this.state, ai = this.ai;
      const f = s.fighters[1], opponent = s.fighters[0];
      const input = this.inputs[1];
      ai.decision -= dt; ai.guard = Math.max(0, ai.guard - dt); ai.retreat = Math.max(0, ai.retreat - dt);
      ai.attackCooldown = Math.max(0, ai.attackCooldown - dt);
      input.held.left = input.held.right = input.held.block = input.held.legBlock = false;
      if (!f.attack && f.stun <= 0 && !f.knockdown) f.facing = opponent.x >= f.x ? 1 : -1;
      const toward = opponent.x > f.x ? 'right' : 'left';
      const away = toward === 'right' ? 'left' : 'right';
      const distance = Math.abs(opponent.x - f.x);
      if (s.mode === 'training') {
        // A stationary partner: occasional visible guards, no attacks or round timer.
        if (ai.decision <= 0) { ai.decision = 1.25 + this.random(); ai.guard = this.random() < .2 ? .6 : 0; }
        input.held.block = ai.guard > 0;
        return;
      }
      const skill = s.difficulty === 'hard' ? 2 : s.difficulty === 'easy' ? 0 : 1;
      const observedAttack = opponent.attack?.serial;
      if (observedAttack !== ai.observedAttack) { ai.observedAttack = observedAttack; ai.reaction = 0; }
      else if (opponent.attack) ai.reaction += dt;
      else ai.reaction = 0;
      if (ai.decision <= 0) {
        ai.decision = [.23, .15, .105][skill] + this.random() * .07;
        if (opponent.attack && ai.reaction > [.15, .105, .075][skill] && distance < 275 && this.random() < [.23, .48, .72][skill]) {
          ai.guard = .18 + this.random() * .20;
          ai.guardLow = KICKS.has(opponent.move) && this.random() < .8;
        }
        if (!f.attack && f.stun <= 0 && !f.knockdown && ai.attackCooldown <= 0 && ai.guard <= 0) {
          if (distance < 252 && this.random() < [.50, .72, .86][skill]) {
            let choices;
            if (distance < 160) choices = ['tsuki', 'tsuki', 'shita', 'kagi', 'gyaku', 'gedan', 'mae'];
            else if (distance < 195) choices = ['kagi', 'mae', 'gedan', 'mawashi', 'ushiro'];
            else if (distance < 212) choices = ['mae', 'gedan', 'mawashi', 'mae', 'ushiro'];
            else choices = ['mawashi', 'ushiro', 'mae'];
            let move = choices[Math.floor(this.random() * choices.length)];
            if (f.ki >= 45 && distance < 270 && this.random() < [.08, .15, .22][skill]) move = 'kaiten';
            this.requestAttack(f, move);
            ai.attackCooldown = [.48, .23, .10][skill] + this.random() * .23;
            if (this.random() < .16) ai.retreat = .20;
          } else if (distance > 290 && this.random() < .035 && !f.airborne) {
            f.vy = -650 * PACE; f.airborne = true;
          }
        }
        // Only confirmed attacks are chained; there is always recovery to punish.
        if (f.attack && f.attack.hitConfirmed && f.comboActive && f.moveTime > f.attack.hitTime && !f.buffer && this.random() < [.18, .40, .68][skill]) {
          const followups = CHAINS[f.move];
          if (followups) this.requestAttack(f, followups[Math.floor(this.random() * followups.length)]);
        }
      }
      if (ai.guard > 0) { input.held.legBlock = !!ai.guardLow; input.held.block = !ai.guardLow; }
      else if (ai.retreat > 0 && distance < 245) input.held[away] = true;
      else if (distance > (f.id === 'samuel' ? 178 : 154)) input.held[toward] = true;
      else if (distance < 115 && !f.attack) input.held[away] = true;
    }

    finishRound(reason) {
      const s = this.state;
      if (s.phase !== 'fight') return;
      this.clearInput();
      const [a, b] = s.fighters;
      const winner = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
      s.roundWinner = winner;
      s.phaseTime = 0;
      s.announcement = reason === 'ko' ? 'K.O.' : 'TEMPO!';
      if (winner === null) s.announcementSub = 'HIKIWAKE · PAREGGIO';
      else {
        const victor = s.fighters[winner];
        victor.wins += 1;
        s.announcementSub = `${this.characters[victor.id].short} VINCE IL ROUND`;
      }
      for (let i = 0; i < 2; i++) {
        const f = s.fighters[i];
        f.attack = null; this.clearQueue(f); this.stopDash(f); f.blocking = false; f.legBlocking = false; f.guardType = null; f.movement = 0; f.retreating = false;
        f.move = null; f.moveProgress = 0;
        f.state = winner === i ? 'victory' : f.hp <= 0 ? 'ko' : 'idle';
        if (f.hp <= 0) { f.knockdown = true; f.vy = -170 * PACE; f.airborne = true; }
      }
      this.separateFighters();
      this.finishDashes();
      s.phase = 'roundOver';
      this.emit(reason === 'ko' ? 'ko' : 'time', { winner, round: s.round, x: winner === null ? 640 : s.fighters[1 - winner].x, y: FLOOR - 130 });
      if (winner !== null && s.fighters[winner].wins >= 2) {
        s.phase = 'matchOver'; s.winner = winner;
        this.emit('match', { winner, id: s.fighters[winner].id, round: s.round });
      }
    }

    nextRound() {
      const s = this.state;
      s.fighters = s.fighters.map((old, i) => {
        const fresh = this.makeFighter(old.id, i, i === 0 ? 380 : 900);
        fresh.wins = old.wins;
        fresh.ki = Math.max(30, old.ki * .75);
        return fresh;
      });
      s.round += 1; s.timer = 60; s.phase = 'intro'; s.phaseTime = 0; s.roundWinner = null;
      s.announcement = `ROUND ${s.round}`; s.announcementSub = 'OSU. NON ARRENDERTI.';
      this.inputs = [this.newInput(), this.newInput()];
      this.ai = { decision: .25, guard: 0, retreat: 0, attackCooldown: .6, reaction: 0 };
      this.emit('round', { round: s.round, announcement: s.announcement });
    }
  }

  global.KyokushinGame = KyokushinGame;
  global.KyokushinMoves = MOVES;
  if (typeof module !== 'undefined' && module.exports) module.exports = { KyokushinGame, KyokushinMoves: MOVES };
})(typeof window !== 'undefined' ? window : globalThis);
