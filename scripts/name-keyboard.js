/* In-game name entry: no editable field is focused on touch devices. */
(function (global) {
  'use strict';
  const letters = /^[\p{L}\p{M}\p{N} .’'\-]$/u;
  class NameDraft {
    constructor(value = '') { this.chars = Array.from(value.normalize('NFC')).slice(0, 24); this.caret = this.chars.length; }
    get value() { return this.chars.join(''); }
    insert(value) {
      const chars = Array.from(value.normalize('NFC'));
      if (!chars.length || chars.some(char => !letters.test(char)) || this.chars.length + chars.length > 24) return false;
      this.chars.splice(this.caret, 0, ...chars); this.caret += chars.length; return true;
    }
    backspace() { if (this.caret) this.chars.splice(--this.caret, 1); }
    delete() { this.chars.splice(this.caret, 1); }
    move(delta) { this.caret = Math.max(0, Math.min(this.chars.length, this.caret + delta)); }
  }
  class NameKeyboard {
    constructor({ input, trigger, host, validate, onConfirm, next }) {
      Object.assign(this, { input, trigger, validate, onConfirm, next });
      this.touch = !!global.navigator?.maxTouchPoints || !!global.matchMedia?.('(any-pointer: coarse)').matches;
      this.setTouch(this.touch);
      // Covers pens/hybrid devices even when the initial media query said mouse.
      input.addEventListener('pointerdown', event => { if (event.pointerType === 'touch' || event.pointerType === 'pen') this.setTouch(true); });
      input.addEventListener('click', () => { if (this.touch) this.open(); });
      input.addEventListener('keydown', event => {
        if (this.touch && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); this.open(); }
      });
      trigger.addEventListener('click', () => this.open());
      const dialog = document.createElement('dialog'); this.dialog = dialog;
      dialog.id = 'name-keyboard'; dialog.className = 'name-keyboard';
      dialog.setAttribute('aria-labelledby', 'name-keyboard-title');
      dialog.innerHTML = `<header><div><small>ARCADE / CREA IL TUO KARATEKA</small><h2 id="name-keyboard-title">SCRIVI IL TUO NOME</h2></div><button type="button" class="close-dialog" aria-label="Annulla modifica nome">×</button></header>
        <div class="name-keyboard-display" role="textbox" aria-readonly="true" aria-label="Nome del karateka"><span class="name-before"></span><i aria-hidden="true"></i><span class="name-after"></span></div>
        <div class="name-keyboard-info"><span>Tocca le lettere, poi conferma.</span><span class="name-count"></span></div>
        <div class="name-keys"></div><p class="name-error" role="alert"></p>
        <footer><button type="button" data-key="cancel">ANNULLA</button><button type="button" data-key="confirm">CONFERMA NOME ✓</button></footer>`;
      host.append(dialog);
      const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', 'ÀÈÉÌÒÙ'];
      const keys = dialog.querySelector('.name-keys');
      for (const row of rows) {
        const line = document.createElement('div'); line.className = 'name-key-row';
        for (const char of row) line.append(this.button(char, char, true));
        if (row === 'ZXCVBNM') line.prepend(this.button('shift', '⇧', false, 'Maiuscole o minuscole'));
        if (row === 'ÀÈÉÌÒÙ') for (const char of ["'", '-', '.']) line.append(this.button(char, char));
        keys.append(line);
      }
      const numbers = document.createElement('div'); numbers.className = 'name-key-row name-numbers';
      for (const char of '1234567890') numbers.append(this.button(char, char));
      keys.append(numbers);
      const editing = document.createElement('div'); editing.className = 'name-key-row name-editing';
      for (const [key, label, accessible] of [['left', '←', 'Sposta cursore a sinistra'], ['space', 'SPAZIO', 'Spazio'], ['right', '→', 'Sposta cursore a destra'], ['backspace', '⌫', 'Cancella lettera']]) editing.append(this.button(key, label, false, accessible));
      keys.append(editing);
      dialog.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button?.dataset.key) this.press(button.dataset.key);
      });
      // A real keyboard remains usable, but no OS keyboard is summoned.
      dialog.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab' || event.key === 'Escape') return;
        const action = { Backspace: 'backspace', Delete: 'delete', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end' }[event.key];
        if (action) { event.preventDefault(); event.stopPropagation(); this.press(action); }
        else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target.closest('button')?.click(); }
        else if (event.key !== ' ' || !event.target.closest('button')) {
          if (Array.from(event.key).length === 1 && letters.test(event.key)) { event.preventDefault(); event.stopPropagation(); this.write(event.key); }
        }
      });
      dialog.addEventListener('close', () => {
        const target = this.confirmed ? next : trigger;
        if (target && !target.disabled && !target.closest('[hidden],[inert]')) target.focus({ preventScroll: true });
      });
    }
    setTouch(touch) {
      this.touch = touch; this.input.readOnly = touch; this.input.inputMode = touch ? 'none' : 'text';
      if (touch) { this.input.setAttribute('aria-haspopup', 'dialog'); this.input.placeholder = 'Tocca per scrivere il tuo nome'; }
    }
    button(key, label, letter = false, accessible) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.key = key; button.textContent = label;
      if (letter) button.dataset.letter = key;
      if (accessible) button.setAttribute('aria-label', accessible);
      return button;
    }
    open() {
      if (this.input.disabled || this.dialog.open) return;
      this.input.blur(); this.draft = new NameDraft(this.input.value); this.upper = true; this.confirmed = false;
      this.dialog.querySelector('.name-error').textContent = '';
      this.render(); this.dialog.showModal(); this.dialog.querySelector('[data-key="Q"]').focus({ preventScroll: true });
    }
    write(char) {
      this.dialog.querySelector('.name-error').textContent = this.draft.insert(char) ? '' : 'Massimo 24 caratteri.';
      this.render();
    }
    press(key) {
      if (key === 'cancel') { this.dialog.close(); return; }
      if (key === 'confirm') {
        try {
          const name = this.validate(this.draft.value);
          this.input.value = name; this.onConfirm(name); this.confirmed = true; this.dialog.close();
        } catch (error) { this.dialog.querySelector('.name-error').textContent = error.message; }
        return;
      }
      this.dialog.querySelector('.name-error').textContent = '';
      if (key === 'shift') this.upper = !this.upper;
      else if (key === 'left' || key === 'right') this.draft.move(key === 'left' ? -1 : 1);
      else if (key === 'home') this.draft.caret = 0;
      else if (key === 'end') this.draft.caret = this.draft.chars.length;
      else if (key === 'backspace' || key === 'delete') this.draft[key]();
      else { this.write(key === 'space' ? ' ' : this.upper ? key : key.toLocaleLowerCase('it')); return; }
      this.render();
    }
    render() {
      this.dialog.querySelector('.name-before').textContent = this.draft.chars.slice(0, this.draft.caret).join('');
      this.dialog.querySelector('.name-after').textContent = this.draft.chars.slice(this.draft.caret).join('');
      this.dialog.querySelector('.name-keyboard-display').setAttribute('aria-label', 'Nome del karateka: ' + (this.draft.value || 'vuoto'));
      this.dialog.querySelector('.name-count').textContent = this.draft.chars.length + ' / 24';
      this.dialog.querySelectorAll('[data-letter]').forEach(button => { button.textContent = this.upper ? button.dataset.letter : button.dataset.letter.toLocaleLowerCase('it'); });
      this.dialog.querySelector('[data-key="shift"]').setAttribute('aria-pressed', String(this.upper));
    }
  }
  global.DojoNameKeyboard = NameKeyboard;
  if (typeof module !== 'undefined') module.exports = { NameDraft, NameKeyboard };
})(typeof window !== 'undefined' ? window : globalThis);
