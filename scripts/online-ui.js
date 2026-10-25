/* Online lobby presentation. Transport and simulation live outside this view. */
(function (global) {
  'use strict';
  const NAME = /^[\p{L}\p{M}\p{N} .’'\-]+$/u;
  function cleanName(value) {
    const name = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
    if (Array.from(name).length < 2 || Array.from(name).length > 24 || !NAME.test(name)) throw new Error('Scrivi un nome da 2 a 24 caratteri.');
    return name;
  }
  function cleanCode(value) {
    const code = String(value || '').trim().toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) throw new Error('Controlla il codice: 6 lettere o numeri, senza I, O, 0 e 1.');
    return code;
  }
  function inviteURL(code, href) {
    const normalized = code ? cleanCode(code) : '';
    if (global.DojoOnlineInvite) return global.DojoOnlineInvite.inviteURL(normalized, href);
    // Keep standalone lobby previews usable without the optional entry-page script.
    let source; try { source = new URL(href); } catch (_) {}
    if (!source || source.protocol !== 'https:' && !(source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname))) source = new URL('https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html');
    const url = new URL('online.html', source);
    if (normalized) url.searchParams.set('room', normalized);
    return url.href;
  }
  class OnlineUI {
    constructor(options = {}) {
      this.options = options; this.roster = options.roster || global.KyokushinRoster || {};
      this.art = options.art || global.FighterArt;
      this.profile = { name: '', fighter: Object.keys(this.roster)[0] || 'angelo', mode: 'versus' };
      this.busy = false; this.room = null; this.view = 'home'; this.previewToken = 0; this.connectionReady = false; this.connectionMessage = '';
      const host = options.host || document.getElementById('viewport');
      const panel = document.createElement('section'); this.panel = panel;
      panel.id = 'online-lobby'; panel.className = 'online-lobby front-screen hidden'; panel.hidden = true; panel.inert = true;
      panel.setAttribute('aria-label', 'Dojo online');
      panel.innerHTML = `
        <header class="online-heading"><button type="button" id="online-back" aria-label="Torna al titolo">← <span>TITOLO</span></button><div><small>BODYPLANET / DOJO ONLINE</small><h2>UN TATAMI. DUE KARATEKA.</h2></div><b aria-hidden="true">極真</b></header>
        <div class="online-scroll" tabindex="0" aria-label="Opzioni online: scorri per vedere tutte le scelte">
          <section class="online-profile" aria-label="Il tuo karateka">
            <label class="online-field" for="online-name">01 / IL TUO NOME</label><input id="online-name" autocomplete="off" spellcheck="false" maxlength="48" placeholder="Come ti chiami?" aria-describedby="online-error"><button type="button" class="name-keyboard-trigger" id="online-name-keys">⌨ SCRIVI IL NOME</button>
            <div class="online-preview"><canvas id="online-profile-art" width="360" height="360" aria-label="Il tuo karateka"></canvas><div><small>IL TUO KARATEKA</small><strong id="online-profile-fighter"></strong><span id="online-profile-belt"></span></div></div>
          </section>
          <section class="online-home-actions" aria-label="Scegli come giocare online">
            <fieldset class="online-mode"><legend>02 / LA TUA SFIDA</legend><div><button type="button" data-online-mode="versus" aria-pressed="true">1 VS 1</button><button type="button" data-online-mode="training" aria-pressed="false">ALLENAMENTO</button></div><p id="online-mode-help">Una sfida al meglio di tre round.</p></fieldset>
            <button type="button" class="online-action online-search" id="online-search">CERCA AVVERSARIO <span>Trova un karateka pronto a giocare</span></button>
            <button type="button" class="online-action" id="online-create">CREA STANZA PRIVATA <span>Invita un amico con il codice stanza</span></button>
            <div class="online-join"><label class="online-field" for="online-code">HAI GIÀ UN CODICE?</label><div><input id="online-code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AB23XY" aria-label="Codice stanza"><button type="button" id="online-code-keys" aria-label="Scrivi il codice con la tastiera a schermo">⌨</button><button type="button" id="online-join">ENTRA ↗</button></div></div>
            <small class="online-account-note">Basta un nome. Nessun account richiesto.</small>
          </section>
          <section class="online-room" aria-label="Stanza online" hidden>
            <div class="online-room-heading"><div><small id="online-room-mode">1 VS 1</small><strong id="online-room-code"></strong></div><div><button type="button" id="online-copy-code">COPIA CODICE</button><button type="button" id="online-copy-link">CONDIVIDI INVITO ↗</button></div></div>
            <div class="online-players"></div>
            <p class="online-room-help">Scegli il tuo karateka e premi Pronto. Si parte quando siete pronti entrambi.</p>
          </section>
          <section class="online-roster" aria-label="Scegli il tuo karateka"><div class="online-roster-heading"><span>03 / SCEGLI IL TUO KARATEKA</span><small id="online-roster-note">Puoi scegliere solo il tuo personaggio.</small></div><div class="online-fighters" role="group" aria-label="Karateka disponibili"></div></section>
        </div>
        <footer class="online-footer"><div><small class="online-scroll-hint">Scorri per scegliere il karateka ↕</small><p id="online-status" role="status" aria-live="polite">Il dojo ti aspetta.</p><p id="online-error" role="alert"></p></div><button type="button" id="online-ready" class="online-primary" hidden>SONO PRONTO ✓</button><button type="button" id="online-leave" hidden>ESCI DALLA STANZA</button></footer>`;
      host.append(panel);
      this.$ = selector => panel.querySelector(selector);
      const keyboard = options.nameKeyboard || global.DojoNameKeyboard;
      if (keyboard) {
        const keyboardHost = document.getElementById('game-shell') || host;
        this.nameKeys = new keyboard({ input: this.$('#online-name'), trigger: this.$('#online-name-keys'), host: keyboardHost, next: this.$('#online-search'),
          id: 'online-name-keyboard', context: 'ONLINE / IL TUO NOME', title: 'COME TI CHIAMI?', validate: cleanName,
          onConfirm: name => { this.profile.name = name; this.setError(''); } });
        this.codeKeys = new keyboard({ input: this.$('#online-code'), trigger: this.$('#online-code-keys'), host: keyboardHost, next: this.$('#online-join'),
          id: 'online-code-keyboard', context: 'ONLINE / ENTRA NELLA STANZA', title: 'CODICE STANZA', inputLabel: 'Codice stanza', confirmLabel: 'CONFERMA CODICE ✓', maxLength: 6, code: true, validate: cleanCode,
          onConfirm: () => this.setError('') });
      }
      for (const [id, fighter] of Object.entries(this.roster)) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.onlineFighter = id;
        button.setAttribute('aria-label', 'Scegli ' + fighter.name + ', ' + fighter.belt);
        const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 190; canvas.dataset.onlinePortrait = id; canvas.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong'); name.textContent = fighter.name;
        button.append(canvas, name); button.addEventListener('click', () => this.selectFighter(id)); this.$('.online-fighters').append(button);
      }
      this.$('#online-name').addEventListener('input', () => { this.profile.name = this.$('#online-name').value; this.setError(''); });
      this.$('#online-code').addEventListener('input', () => { this.$('#online-code').value = this.$('#online-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); this.setError(''); });
      panel.querySelectorAll('[data-online-mode]').forEach(button => button.addEventListener('click', () => { this.profile.mode = button.dataset.onlineMode; this.renderProfile(); }));
      this.$('#online-create').addEventListener('click', () => this.submit('onCreate'));
      this.$('#online-search').addEventListener('click', () => this.submit('onMatchmake'));
      this.$('#online-join').addEventListener('click', () => this.submit('onJoin'));
      this.$('#online-back').addEventListener('click', () => this.invoke(this.room || this.view === 'searching' ? 'onLeave' : 'onBack'));
      this.$('#online-leave').addEventListener('click', () => this.invoke('onLeave'));
      this.$('#online-ready').addEventListener('click', () => this.invoke('onReady', !this.localPlayer()?.ready));
      this.$('#online-copy-code').addEventListener('click', () => this.copy(false));
      this.$('#online-copy-link').addEventListener('click', () => this.copy(true));
      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.invoke(this.room || this.view === 'searching' ? 'onLeave' : 'onBack'); }
      });
      const titleActions = document.querySelector('.title-extra-actions');
      if (titleActions && !document.getElementById('online-title-button')) {
        const entry = document.createElement('button'); entry.id = 'online-title-button'; entry.type = 'button'; entry.innerHTML = 'ONLINE <span>1 VS 1 · STANZE PRIVATE</span>';
        entry.addEventListener('click', () => options.onOpen ? options.onOpen() : this.showHome()); titleActions.append(entry);
      }
      this.createResultActions(); this.renderProfile();
    }
    localPlayer() {
      if (!this.room) return null;
      const slot = this.room.selfSlot ?? (this.room.role === 'guest' ? 1 : 0);
      return this.room.players?.find(player => player.slot === slot) || null;
    }
    show() { this.panel.hidden = false; this.panel.inert = false; this.panel.classList.remove('hidden'); this.panel.setAttribute('aria-hidden', 'false'); }
    hide() {
      this.panel.hidden = true; this.panel.inert = true; this.panel.classList.add('hidden'); this.panel.setAttribute('aria-hidden', 'true');
      for (const keyboard of [this.nameKeys, this.codeKeys]) if (keyboard?.dialog.open) keyboard.dialog.close();
    }
    showHome(values = {}) {
      this.room = null; this.view = 'home'; this.connectionReady = false; this.connectionMessage = ''; Object.assign(this.profile, values);
      if (!this.roster[this.profile.fighter]) this.profile.fighter = Object.keys(this.roster)[0];
      if (!['versus', 'training'].includes(this.profile.mode)) this.profile.mode = 'versus';
      this.$('#online-name').value = this.profile.name || '';
      if (values.code !== undefined) this.$('#online-code').value = String(values.code).toUpperCase().slice(0, 6);
      this.panel.classList.remove('in-room', 'is-searching');
      this.$('.online-home-actions').hidden = false; this.$('.online-profile').hidden = false; this.$('.online-room').hidden = true;
      this.$('#online-ready').hidden = true; this.$('#online-leave').hidden = true;
      this.$('#online-back span').textContent = 'TITOLO'; this.$('#online-back').setAttribute('aria-label', 'Torna al titolo'); this.setBusy(false); this.setError(''); this.setStatus('Scegli il karateka e come entrare nel tatami.');
      this.show(); this.renderProfile(); this.renderPreviews();
    }
    showSearching(message = 'Cerco un karateka pronto a giocare…') {
      this.view = 'searching'; this.panel.classList.add('is-searching'); this.show(); this.setBusy(true);
      this.$('#online-leave').hidden = false; this.$('#online-leave').disabled = false; this.$('#online-leave').textContent = 'ANNULLA RICERCA';
      this.$('#online-back').disabled = false; this.setStatus(message);
    }
    showRoom(room) {
      if (!room) return this.showHome();
      this.room = room; this.view = 'room'; const local = this.localPlayer();
      if (local) { this.profile.name = local.name || this.profile.name; if (this.roster[local.fighter]) this.profile.fighter = local.fighter; }
      this.profile.mode = room.mode === 'training' ? 'training' : 'versus';
      this.panel.classList.add('in-room'); this.panel.classList.remove('is-searching');
      this.$('.online-home-actions').hidden = true; this.$('.online-profile').hidden = true; this.$('.online-room').hidden = false;
      this.$('#online-ready').hidden = false; this.$('#online-leave').hidden = false; this.$('#online-leave').textContent = 'ESCI DALLA STANZA';
      this.$('#online-back span').textContent = 'ESCI'; this.$('#online-back').setAttribute('aria-label', 'Esci dalla stanza');
      this.$('#online-room-code').textContent = room.code || '—'; this.$('#online-room-mode').textContent = (this.profile.mode === 'training' ? 'ALLENAMENTO' : '1 VS 1') + ' / CODICE STANZA';
      const players = this.$('.online-players'); players.replaceChildren();
      for (const slot of [0, 1]) {
        const player = room.players?.find(item => item.slot === slot);
        const card = document.createElement('article'); card.className = 'online-player'; card.classList.toggle('is-ready', !!player?.ready);
        const tag = document.createElement('small'); tag.textContent = player ? (player === local ? 'TU' : 'AVVERSARIO') + ' · ' + (player.ready ? 'PRONTO ✓' : 'SCEGLIE IL KARATEKA') : 'IN ATTESA';
        const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 310; canvas.setAttribute('aria-hidden', 'true'); if (player && this.roster[player.fighter]) canvas.dataset.onlinePortrait = player.fighter; canvas.dataset.facing = slot === 0 ? '1' : '-1';
        const name = document.createElement('strong'); name.textContent = player?.name || 'IL TATAMI TI ASPETTA';
        const fighter = document.createElement('span'); fighter.textContent = this.roster[player?.fighter]?.name || 'Condividi il codice con un amico';
        card.append(tag, canvas, name, fighter); players.append(card);
      }
      this.$('#online-ready').textContent = local?.ready ? 'NON SONO PRONTO' : 'SONO PRONTO ✓'; this.$('#online-ready').setAttribute('aria-pressed', String(!!local?.ready));
      this.setBusy(this.busy); this.setError(''); this.show(); this.renderProfile(); this.renderPreviews();
      this.setStatus(this.connectionMessage || ((room.players?.length || 0) < 2 ? 'Stanza aperta. Invita il secondo karateka.' : room.players.every(player => player.ready) ? 'Entrambi pronti. Preparo la sfida…' : local?.ready ? 'Sei pronto. Aspetto l’altro karateka.' : 'Il secondo karateka è qui. Premi Pronto quando vuoi.'));
    }
    setBusy(busy, message) {
      this.busy = !!busy; this.panel.setAttribute('aria-busy', String(this.busy));
      this.panel.querySelectorAll('button,input').forEach(element => {
        element.disabled = this.busy && !['online-leave', 'online-back', 'online-copy-code', 'online-copy-link'].includes(element.id);
      });
      this.$('#online-ready').disabled = this.busy || !this.connectionReady;
      if (message !== undefined) this.setStatus(message);
    }
    setConnection(connected, message = '') {
      this.connectionReady = !!connected; this.connectionMessage = connected ? '' : message;
      this.$('#online-ready').disabled = this.busy || !this.connectionReady;
      if (message) this.setStatus(message);
    }
    setStatus(message = '') { this.$('#online-status').textContent = message; }
    setError(message = '') { this.$('#online-error').textContent = message; }
    profileValue() { return { name: cleanName(this.$('#online-name').value), fighter: this.profile.fighter, mode: this.profile.mode }; }
    async submit(action) {
      if (this.busy) return;
      let value;
      try { value = this.profileValue(); if (action === 'onJoin') value.code = cleanCode(this.$('#online-code').value); }
      catch (error) { this.setError(error.message); if (action === 'onJoin' && /codice/.test(error.message)) this.codeKeys?.open(); else this.nameKeys?.open(); return; }
      Object.assign(this.profile, value); await this.invoke(action, value);
    }
    async invoke(action, payload) {
      this.setError('');
      try { return await this.options[action]?.(payload); }
      catch (_) { this.setBusy(false); this.setError('Non riesco a completare la richiesta. Riprova tra un momento.'); }
    }
    selectFighter(id) {
      if (this.busy || !this.roster[id] || this.profile.fighter === id) return;
      this.profile.fighter = id; this.renderProfile(); this.renderPreviews();
      if (this.room) this.invoke('onUpdate', { fighter: id, name: this.profile.name });
    }
    renderProfile() {
      const fighter = this.roster[this.profile.fighter];
      this.$('#online-profile-fighter').textContent = fighter?.name || '';
      this.$('#online-profile-belt').textContent = fighter?.belt || '';
      this.$('#online-profile-art').dataset.onlinePortrait = this.profile.fighter;
      this.panel.querySelectorAll('[data-online-fighter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.onlineFighter === this.profile.fighter)));
      this.panel.querySelectorAll('[data-online-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.onlineMode === this.profile.mode)));
      this.$('#online-mode-help').textContent = this.profile.mode === 'training' ? 'Allenatevi insieme, senza limite di tempo.' : 'Una sfida al meglio di tre round.';
    }
    async renderPreviews() {
      const token = ++this.previewToken, art = this.art || global.FighterArt; if (!art) return;
      try { await art.load?.(); } catch (_) { return; }
      if (token !== this.previewToken) return;
      this.panel.querySelectorAll('canvas[data-online-portrait]').forEach(canvas => {
        const context = canvas.getContext('2d'); if (!context) return; context.clearRect(0, 0, canvas.width, canvas.height);
        art.drawSelectionPortrait?.(context, canvas.dataset.onlinePortrait, 0, 0, canvas.width, canvas.height, { facing: Number(canvas.dataset.facing) || 1, full: true, bust: false });
      });
    }
    async copy(link) {
      const room = this.room, code = room?.code;
      if (!code) return;
      const current = () => this.room === room && this.room.code === code;
      const value = link ? inviteURL(code, this.options.inviteBase || global.location.href) : code;
      if (link && typeof global.navigator?.share === 'function') {
        try {
          await global.navigator.share({ title: 'Kyokushin Spirit · Sfida online', text: 'Ti aspetto nel dojo. Codice stanza: ' + code, url: value });
          if (current()) this.setStatus('Invito condiviso. Aspetto il secondo karateka.');
          return;
        } catch (error) { if (!current() || error?.name === 'AbortError') return; }
      }
      try { await global.navigator.clipboard.writeText(value); if (current()) this.setStatus(link ? 'Invito copiato. Condividilo con un amico.' : 'Codice copiato. Condividilo con il secondo karateka.'); }
      catch (_) { if (current()) this.setStatus('Codice stanza: ' + code + '. Puoi comunicarlo direttamente al tuo amico.'); }
    }
    createResultActions() {
      const result = document.getElementById('result-panel'); if (!result) return;
      const actions = document.createElement('div'); this.resultActions = actions; actions.id = 'online-result-actions'; actions.hidden = true;
      actions.innerHTML = '<p role="status" aria-live="polite"></p><button type="button" class="primary-button" data-online-result="rematch">CHIEDI RIVINCITA ↗</button><button type="button" class="secondary-button" data-online-result="room">TORNA IN STANZA</button><button type="button" class="secondary-button" data-online-result="leave">ESCI DAL DOJO ONLINE</button>';
      actions.querySelector('[data-online-result="rematch"]').addEventListener('click', () => this.invoke('onRematch'));
      actions.querySelector('[data-online-result="room"]').addEventListener('click', () => this.invoke('onReturnToRoom'));
      actions.querySelector('[data-online-result="leave"]').addEventListener('click', () => this.invoke('onLeave'));
      result.append(actions);
    }
    showResult({ message = '', rematchRequested = false, opponentReady = false } = {}) {
      if (!this.resultActions) return;
      this.resultActions.hidden = false; this.resultActions.closest('#result-panel').classList.add('online-result');
      this.resultActions.querySelector('p').textContent = message || (rematchRequested ? 'Rivincita richiesta. Aspetto il secondo karateka.' : opponentReady ? 'L’altro karateka vuole la rivincita.' : 'Una nuova sfida? Restate nella stessa stanza.');
      const rematch = this.resultActions.querySelector('[data-online-result="rematch"]'); rematch.disabled = rematchRequested; rematch.textContent = rematchRequested ? 'IN ATTESA DELLA RIVINCITA…' : opponentReady ? 'ACCETTA LA RIVINCITA ↗' : 'CHIEDI RIVINCITA ↗';
    }
    hideResult() { if (this.resultActions) { this.resultActions.hidden = true; this.resultActions.closest('#result-panel').classList.remove('online-result'); } }
  }
  OnlineUI.create = options => new OnlineUI(options);
  global.DojoOnlineUI = OnlineUI;
  if (typeof module !== 'undefined') module.exports = { OnlineUI, cleanName, cleanCode, inviteURL };
})(typeof window !== 'undefined' ? window : globalThis);
