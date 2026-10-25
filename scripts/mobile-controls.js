/* mobile-controls.js */
/* Aggregated keyboard and multitouch input for the local arcade game. */
(function (global) {
  'use strict';
  const ACTIONS = new Set(['left', 'right', 'jump', 'block', 'legBlock', 'tsuki', 'shita', 'kagi', 'mae', 'mawashi', 'ushiro', 'gedan', 'kaiten']);
  const BANKS = {
    punches: [
      ['tsuki', 'Tsuki, pugno diretto al corpo'],
      ['shita', 'Shita tsuki, montante al corpo'],
      ['kagi', 'Kagi tsuki, gancio al corpo'],
      ['mae', 'Mae geri, calcio frontale']
    ],
    kicks: [
      ['mae', 'Mae geri, calcio frontale'],
      ['mawashi', 'Mawashi geri, calcio circolare alto'],
      ['gedan', 'Gedan, calcio basso'],
      ['ushiro', 'Ushiro geri, calcio posteriore']
    ],
    special: [
      ['kaiten', 'Kaiten geri, tecnica speciale da 45 Spirit'],
      ['block', 'Tieni premuto per parare con le braccia'],
      ['legBlock', 'Tieni premuto per parare i calci con il ginocchio'],
      ['ushiro', 'Ushiro geri, calcio posteriore']
    ]
  };
  const BANK_ORDER = ['punches', 'kicks', 'special'];
  const BANK_LABELS = ['pugni', 'calci', 'speciali e parate'];
  // Small, consistent karate silhouettes remain legible without names. Motion
  // strokes distinguish the straight, rising and hooked punches at a glance.
  const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${content}</svg>`;
  const head = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="currentColor" stroke="none"/>`;
  const motion = path => `<path d="${path}" stroke-width="2.4" opacity=".65"/>`;
  const punchBase = head(23, 17) + '<path d="M19 24 28 24 31 40 19 40Z" fill="currentColor" stroke="none"/><path d="M20 27 12 33 19 35M22 40 16 49 10 58M28 40 34 50 43 57"/>';
  const ICONS = {
    tsuki: svg(punchBase + '<path d="M27 27 39 27 53 27"/><path d="M52 25h5v5h-5Z" fill="currentColor" stroke="none"/>' + motion('M36 14H56m-5-4 5 4-5 4')),
    shita: svg(punchBase + '<path d="M28 28 42 37 49 23"/><path d="m47 21 5 1-1 5-5-1Z" fill="currentColor" stroke="none"/>' + motion('M57 36V15m-4 5 4-5 4 5')),
    kagi: svg(punchBase + '<path d="M28 27 48 30 48 19 39 19"/><path d="M36 16h5v6h-5Z" fill="currentColor" stroke="none"/>' + motion('M57 29Q62 7 39 8m4-4-5 4 5 4')),
    mae: svg(head(21, 13) + '<path d="m18 21 10-1 3 18-12 1Z" fill="currentColor" stroke="none"/><path d="M20 23 12 31 20 34M27 23 34 26 38 20M24 39 18 49 15 59M28 39 39 31 54 32"/>' + motion('M40 42h18m-4-4 4 4-4 4')),
    mawashi: svg(head(18, 18) + '<path d="m16 26 9-3 9 17-11 5Z" fill="currentColor" stroke="none"/><path d="M18 27 10 36 17 39M25 26 32 29 35 23M27 43 20 50 17 59M31 40 43 27 56 20"/>' + motion('M43 12Q59 9 60 28m-4-4 4 5 3-5')),
    gedan: svg(head(22, 13) + '<path d="M18 21h10l3 19H18Z" fill="currentColor" stroke="none"/><path d="M19 24 12 32 20 34M27 24 34 29 38 22M22 40 16 51 14 59M29 40 41 48 55 52"/>' + motion('M39 58h20m-4-4 4 4-4 3')),
    ushiro: svg(head(19, 24) + '<path d="m25 27 16 5-4 10-17-7Z" fill="currentColor" stroke="none"/><path d="M25 29 16 39 10 36M28 34 23 43 17 43M36 40 33 50 34 59M39 35 48 32 57 31"/>' + motion('M40 17h19m-5-4 5 4-5 4')),
    kaiten: svg(head(23, 43) + '<path d="m25 35 10-11 8 8-12 11Z" fill="currentColor" stroke="none"/><path d="M27 37 15 33 12 26M32 38 41 45 46 39M36 27 29 17 20 20M40 28 48 17 52 8"/>' + motion('M11 17A23 23 0 1 0 55 40m-5 3 6-3 2 6')),
    block: svg(head(32, 15) + '<path d="M26 24h12l3 17H24Z" fill="currentColor" stroke="none"/><path d="M26 26 18 30 21 16M38 26 46 30 43 16M28 41 22 50 18 59M36 41 42 50 46 59"/>' + motion('M15 9 9 23m40-14 6 14')),
    legBlock: svg(head(27, 13) + '<path d="M22 22h11l2 19H22Z" fill="currentColor" stroke="none"/><path d="M23 25 16 31 19 19M32 25 39 29 42 19M25 41 23 51 25 59M32 40 44 32 47 48"/>' + motion('M53 28v22m-3-17 3-5 3 5'))
  };
  const BANK_ICONS = { punches: ICONS.tsuki, kicks: ICONS.mawashi, special: ICONS.kaiten };

  class DojoControls {
    constructor({ element, setInput, canPlay = () => true, onTouch = () => {} } = {}) {
      if (!element?.addEventListener || typeof setInput !== 'function') throw new TypeError('DojoControls requires an element and setInput callback.');
      this.element = element;
      this.document = element.ownerDocument;
      this.setInput = setInput;
      this.canPlay = canPlay;
      this.onTouch = onTouch;
      this.sources = new Map();
      this.actions = new Map();
      this.pointers = new Map();
      this.padKeys = new Map();
      this.bank = 'punches';
      this.destroyed = false;
      this.listeners = [];
      this.originalStyle = {};
      for (const key of ['touchAction', 'userSelect', 'webkitUserSelect', 'webkitTouchCallout']) {
        this.originalStyle[key] = element.style[key];
        element.style[key] = 'none';
      }
      this._listen(element, 'pointerdown', event => this._down(event));
      this._listen(element, 'pointermove', event => this._move(event));
      this._listen(element, 'pointerup', event => this._end(event, 'up'));
      this._listen(element, 'pointercancel', event => this._end(event, 'cancel'));
      this._listen(element, 'lostpointercapture', event => this._end(event, 'lostcapture'));
      this._listen(element, 'keydown', event => this._keyDown(event));
      this._listen(element, 'keyup', event => this._keyUp(event));
      this._listen(element, 'click', event => {
        const cycle = this._within(event.target, '[data-bank-cycle]');
        if (!cycle) return;
        event.preventDefault();event.stopPropagation();
        if (!this.canPlay() || cycle.disabled) return;
        this.cycleBank();
        this.onTouch(event);
      });
      this._listen(element, 'focusout', event => {
        for (const [code, record] of [...this.padKeys]) {
          if (record.button === this._button(event.target)) this._releasePadKey(code, 'blur');
        }
      });
      // Capture is supported on target browsers; these also release pointers if
      // capture is unavailable and the finger/mouse leaves the controls.
      if (this.document?.addEventListener) {
        this._listen(this.document, 'pointermove', event => { if (this.pointers.get(event.pointerId)?.captured === false) this._move(event); });
        this._listen(this.document, 'pointerup', event => this._end(event, 'up'));
        this._listen(this.document, 'pointercancel', event => this._end(event, 'cancel'));
      }
      for (const type of ['click', 'contextmenu', 'dragstart']) {
        this._listen(element, type, event => {
          if (!this._button(event.target) && !this._within(event.target, '[data-joystick]')) return;
          event.preventDefault();
          if (type === 'click') event.stopPropagation(); // No delayed synthetic attack/click.
        });
      }
      this._syncButtons();
      this.setBank(this.bank);
    }

    _listen(target, type, listener) {
      target.addEventListener(type, listener, { passive: false });
      this.listeners.push({ target, type, listener });
    }

    _key(player, action) { return `${player}:${action}`; }
    _valid(player, action) { return (player === 0 || player === 1) && ACTIONS.has(action); }

    _button(target) {
      return this._within(target, '[data-action]');
    }

    _within(target, selector) {
      const node = target?.closest?.(selector) || target?.parentElement?.closest?.(selector);
      return node && this.element.contains(node) ? node : null;
    }

    /** Changing banks releases only touch actions, preserving a held joystick/key. */
    setBank(bank) {
      if (this.destroyed || !BANKS[bank]) return false;
      const buttons = [...this.element.querySelectorAll('[data-action-slot]')];
      if (bank !== this.bank) {
        for (const record of [...this.pointers.values()]) if (record.kind !== 'joystick') this._finishPointer(record.pointerId, 'bank');
        for (const [code, record] of [...this.padKeys]) if (buttons.includes(record.button)) this._releasePadKey(code, 'bank');
      }
      this.bank = bank;
      this.element.dataset.activeBank = bank;
      for (const button of buttons) {
        const spec = BANKS[bank][Number(button.dataset.actionSlot)];
        if (!spec) continue;
        const [action, description] = spec;
        button.dataset.action = action;
        button.setAttribute('aria-label', description);
        const icon = button.querySelector('[data-action-icon]');
        if (icon) icon.innerHTML = ICONS[action];
      }
      const index = BANK_ORDER.indexOf(bank), next = (index + 1) % BANK_ORDER.length;
      for (const cycle of this.element.querySelectorAll('[data-bank-cycle]')) {
        cycle.dataset.bankIndex = String(index);
        cycle.setAttribute('aria-label', `Cambia tecniche. Gruppo ${index + 1} di 3: ${BANK_LABELS[index]}. Prossimo gruppo: ${BANK_LABELS[next]}.`);
        const icon = cycle.querySelector('[data-bank-icon]');
        if (icon) icon.innerHTML = BANK_ICONS[bank];
        const dots = cycle.querySelector('.bank-dots')?.children || [];
        for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === index);
      }
      this._syncButtons();
      return true;
    }

    /** One native click/tap advances one group; pointer events never duplicate it. */
    cycleBank() {
      if (this.destroyed || !this.canPlay()) return false;
      return this.setBank(BANK_ORDER[(BANK_ORDER.indexOf(this.bank) + 1) % BANK_ORDER.length]);
    }

    _binding(button) {
      if (!button || button.disabled) return null;
      const player = button.dataset.player === undefined ? 0 : Number(button.dataset.player);
      const action = button.dataset.action;
      return this._valid(player, action) ? { player, action } : null;
    }

    _buttons() {
      const list = [...this.element.querySelectorAll('[data-action]')];
      if (this.element.dataset?.action) list.unshift(this.element);
      return list;
    }

    _syncButtons() {
      for (const button of this._buttons()) {
        const binding = this._binding(button);
        const down = !!binding && !!this.actions.get(this._key(binding.player, binding.action))?.size;
        button.classList.toggle('pressed', down);
        button.setAttribute('aria-pressed', String(down));
      }
    }

    /** Hold one action for an arbitrary stable source, e.g. "key:KeyA". */
    press(source, player, action) {
      return this._press(source, player, action, { origin: 'external', phase: 'press' });
    }

    _press(source, player, action, meta) {
      if (this.destroyed || source === null || source === undefined || !this._valid(player, action)) return false;
      if (!this.canPlay()) { this._release(source, meta); return false; }
      const previous = this.sources.get(source);
      if (previous?.player === player && previous.action === action) return true;
      if (previous) this._release(source, meta);
      const key = this._key(player, action);
      let owners = this.actions.get(key);
      if (!owners) { owners = new Set(); this.actions.set(key, owners); }
      const wasHeld = owners.size > 0;
      owners.add(source); this.sources.set(source, { player, action });
      if (!wasHeld) this.setInput(player, action, true, meta);
      this._syncButtons();
      return true;
    }

    /** Releasing one source never releases another finger/key on the action. */
    release(source) { return this._release(source, { origin: 'external', phase: 'release' }); }

    _release(source, meta) {
      const previous = this.sources.get(source);
      if (!previous) return false;
      this.sources.delete(source);
      const key = this._key(previous.player, previous.action), owners = this.actions.get(key);
      owners?.delete(source);
      if (!owners?.size) {
        this.actions.delete(key);
        this.setInput(previous.player, previous.action, false, meta);
      }
      this._syncButtons();
      return true;
    }

    _meta(record, phase) { return { origin: 'pointer', phase, pointerType: record.pointerType, pointerId: record.pointerId }; }

    _activationKey(event) {
      const code = event.code || (event.key === ' ' ? 'Space' : event.key);
      return ['Enter', 'NumpadEnter', 'Space'].includes(code) ? code : null;
    }

    _keyDown(event) {
      if (this._activationKey(event) && this._within(event.target, '[data-bank-cycle]')) {
        // Keep the button's native Enter/Space click, but not game shortcuts or
        // repeated Enter clicks while a keyboard button is held down.
        event.stopPropagation();
        if (event.repeat) event.preventDefault();
        return;
      }
      const code = this._activationKey(event), button = this._button(event.target), binding = this._binding(button);
      if (!code || !binding || this.destroyed) return;
      // Preserve a held guard and suppress the browser's synthetic click as well
      // as the game's global Enter/Space shortcuts on these focused buttons.
      event.preventDefault();event.stopPropagation();
      if (event.repeat || this.padKeys.has(code) || !this.canPlay()) return;
      const source = Symbol(`pad-key:${code}`);
      if (this._press(source, binding.player, binding.action, { origin: 'pad-keyboard', phase: 'down', key: code })) {
        this.padKeys.set(code, { source, button });
      }
    }

    _keyUp(event) {
      if (this._activationKey(event) && this._within(event.target, '[data-bank-cycle]')) { event.stopPropagation();return; }
      const code = this._activationKey(event);
      if (!code || (!this.padKeys.has(code) && !this._button(event.target))) return;
      event.preventDefault();event.stopPropagation();
      this._releasePadKey(code, 'up');
    }

    _releasePadKey(code, phase) {
      const record = this.padKeys.get(code);
      if (!record) return;
      this.padKeys.delete(code);
      this._release(record.source, { origin: 'pad-keyboard', phase, key: code });
    }

    _down(event) {
      if (this.destroyed || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const joystick = this._within(event.target, '[data-joystick]');
      if (joystick) { this._joystickDown(event, joystick); return; }
      const button = this._button(event.target), binding = this._binding(button);
      if (!binding) return;
      event.preventDefault();
      if (!this.canPlay() || this.pointers.has(event.pointerId)) return;
      const record = { source: Symbol(`pointer:${event.pointerId}`), pointerId: event.pointerId,
        pointerType: event.pointerType || 'touch', button, captured: false };
      this.pointers.set(event.pointerId, record);
      if (!this._press(record.source, binding.player, binding.action, this._meta(record, 'down'))) {
        this.pointers.delete(event.pointerId); return;
      }
      try {
        if (this.element.setPointerCapture) { this.element.setPointerCapture(event.pointerId); record.captured = true; }
      } catch (_) { record.captured = false; }
      this.onTouch(event);
    }

    _joystickDown(event, joystick) {
      event.preventDefault();
      if (!this.canPlay() || this.pointers.has(event.pointerId) || [...this.pointers.values()].some(record => record.joystick === joystick)) return;
      const record = { kind: 'joystick', joystick, source: Symbol(`stick:${event.pointerId}`),
        jumpSource: Symbol(`stick-jump:${event.pointerId}`), horizontal: null, jumping: false,
        pointerId: event.pointerId, pointerType: event.pointerType || 'touch', captured: false };
      this.pointers.set(event.pointerId, record);
      try {
        if (this.element.setPointerCapture) { this.element.setPointerCapture(event.pointerId); record.captured = true; }
      } catch (_) { record.captured = false; }
      this._joystickMove(event, record);
      this.onTouch(event);
    }

    _joystickMove(event, record) {
      const rect = record.joystick.getBoundingClientRect();
      const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
      // A CSS-rotated cabinet still receives screen-axis client coordinates.
      // An iframe rotated by its host already receives local coordinates, so
      // only the child's own virtual-landscape mode needs this inverse turn.
      const rotated = !!this.document.body?.classList?.contains('virtual-landscape');
      const vector = global.DojoOrientation?.localVector(dx, dy, rotated)
        || { x: rotated ? dy : dx, y: rotated ? -dx : dy };
      const localWidth = record.joystick.offsetWidth || (rotated ? rect.height : rect.width);
      const localHeight = record.joystick.offsetHeight || (rotated ? rect.width : rect.height);
      const radius = Math.max(1, Math.min(localWidth, localHeight) / 2);
      const x = vector.x / radius, y = vector.y / radius;
      const old = record.horizontal;
      const direction = x > (old === 'right' ? .16 : .27) ? 'right' : x < (old === 'left' ? -.16 : -.27) ? 'left' : null;
      if (direction !== old) {
        this._release(record.source, this._meta(record, direction ? 'move' : 'up'));
        // A new flick from neutral is a deliberate tap. Crossing directly from
        // left to right is movement and must not accidentally prime a dash.
        if (direction) this._press(record.source, 0, direction, this._meta(record, old ? 'move' : 'down'));
        record.horizontal = direction;
      }
      const jumping = y < (record.jumping ? -.28 : -.48);
      if (jumping !== record.jumping) {
        if (jumping) this._press(record.jumpSource, 0, 'jump', this._meta(record, 'down'));
        else this._release(record.jumpSource, this._meta(record, 'move'));
        record.jumping = jumping;
      }
      const length = Math.hypot(x, y), travel = radius * .55 / Math.max(1, length);
      record.joystick.style.setProperty('--stick-x', `${x * travel}px`);
      record.joystick.style.setProperty('--stick-y', `${y * travel}px`);
      record.joystick.classList.toggle('engaged', true);
      record.joystick.classList.toggle('jumping', jumping);
      record.joystick.setAttribute('aria-label', `Joystick: ${direction === 'left' ? 'sinistra' : direction === 'right' ? 'destra' : 'neutro'}${jumping ? ', salto' : ''}. Trascina per muoverti, verso l’alto per saltare.`);
    }

    _resetJoystick(joystick) {
      joystick.style.setProperty('--stick-x', '0px');joystick.style.setProperty('--stick-y', '0px');
      joystick.classList.toggle('engaged', false);joystick.classList.toggle('jumping', false);
      joystick.setAttribute('aria-label', 'Joystick: trascina a sinistra o destra per muoverti, in alto per saltare. Due flick nella stessa direzione per scattare.');
    }

    _move(event) {
      const record = this.pointers.get(event.pointerId);
      if (!record) return;
      event.preventDefault();
      if (!this.canPlay()) { this._finishPointer(event.pointerId, 'cancel'); return; }
      if (record.kind === 'joystick') { this._joystickMove(event, record); return; }
      // Pointer capture retargets events, so hit-test using the iframe's own
      // document and viewport coordinates instead of event.target.
      const hit = this.document?.elementFromPoint?.(event.clientX, event.clientY);
      const button = this._button(hit), binding = this._binding(button);
      const meta = this._meta(record, 'move');
      if (binding) this._press(record.source, binding.player, binding.action, meta);
      else this._release(record.source, meta);
      record.button = button;
    }

    _end(event, phase) {
      if (!this.pointers.has(event.pointerId)) return;
      event.preventDefault();
      this._finishPointer(event.pointerId, phase);
    }

    _finishPointer(pointerId, phase) {
      const record = this.pointers.get(pointerId);
      if (!record) return;
      this.pointers.delete(pointerId);
      this._release(record.source, this._meta(record, phase));
      if (record.kind === 'joystick') {
        this._release(record.jumpSource, this._meta(record, phase));
        this._resetJoystick(record.joystick);
      }
      this._releaseCapture(record);
    }

    _releaseCapture(record) {
      if (!record.captured) return;
      try {
        if (!this.element.hasPointerCapture || this.element.hasPointerCapture(record.pointerId)) this.element.releasePointerCapture?.(record.pointerId);
      } catch (_) { /* The browser may already have released a cancelled pointer. */ }
    }

    /** Root calls this on pause, menus, blur, visibility/orientation changes. */
    clear() {
      const pointers = [...this.pointers.values()];
      this.pointers.clear();
      this.padKeys.clear();
      for (const source of [...this.sources.keys()]) this._release(source, { origin: 'system', phase: 'clear' });
      for (const record of pointers) {
        if (record.kind === 'joystick') this._resetJoystick(record.joystick);
        this._releaseCapture(record);
      }
      this._syncButtons();
    }

    destroy() {
      if (this.destroyed) return;
      this.clear();this.destroyed = true;
      for (const { target, type, listener } of this.listeners) target.removeEventListener(type, listener);
      this.listeners.length = 0;
      for (const [key, value] of Object.entries(this.originalStyle)) this.element.style[key] = value;
    }
  }

  global.DojoControls = DojoControls;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DojoControls };
})(typeof window !== 'undefined' ? window : globalThis);
