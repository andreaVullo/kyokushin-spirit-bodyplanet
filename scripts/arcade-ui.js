/* Arcade creator and public results. Match progress lives only in main/arcade. */
(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeKey = event => event.key === 'Escape';
  class ArcadeUI {
    constructor({ onCreate, onBack, onLeaderboard, onFinalLeaderboard, onAppearance, onRetry }) {
      this.appearance = { name: '', gender: 'male', hairstyle: 0 };
      this.ready = false;
      this.onFinalLeaderboard = onFinalLeaderboard;
      this.finalSaves = new Map();
      this.leaderboardVersion = 0;
      const links = document.createElement('div'); links.className = 'title-extra-actions';
      links.innerHTML = '<button id="arcade-title-button" type="button" disabled>ARCADE <span>DA BIANCA A 10 DAN</span></button><button id="leaderboard-title-button" type="button">CLASSIFICA <span>IL MURO DEL DOJO</span></button>';
      $('title-start-button').after(links);
      const creator = document.createElement('section');
      creator.id = 'arcade-create'; creator.className = 'arcade-create front-screen hidden';
      creator.hidden = true; creator.inert = true; creator.setAttribute('aria-label', 'Crea il tuo karateka Arcade');
      creator.innerHTML = `
        <header class="creator-heading"><button id="arcade-back" type="button" class="arcade-back" aria-label="Torna al titolo">← <span>TITOLO</span></button><div><small>ARCADE / UNA SOLA SCALATA</small><h2>IL TUO SPIRITO. IL TUO NOME.</h2></div><b aria-hidden="true">極真</b></header>
        <div class="creator-poster"><canvas id="arcade-preview" width="480" height="480" aria-label="Anteprima del karateka"></canvas><div class="creator-identity"><span>CINTURA BIANCA</span><strong id="arcade-preview-name">IL TUO KARATEKA</strong><small>IL PRIMO PASSO VERSO IL 10º DAN</small></div><p id="arcade-art-status" role="status">Preparo il tuo karateka…</p></div>
        <form id="arcade-form" class="creator-form" novalidate>
          <label class="creator-field">01 / IL TUO NOME<input id="arcade-name" name="name" autocomplete="off" spellcheck="false" maxlength="48" placeholder="Come ti chiami?" aria-describedby="arcade-name-help arcade-create-error"><small id="arcade-name-help">Da 2 a 24 caratteri. Il nome accompagnerà il risultato in classifica.</small></label>
          <fieldset><legend>02 / IL TUO KARATEKA</legend><div class="creator-genders"><button type="button" data-arcade-gender="male" aria-pressed="true">UOMO</button><button type="button" data-arcade-gender="female" aria-pressed="false">DONNA</button></div></fieldset>
          <fieldset><legend>03 / CAPIGLIATURA</legend><div id="arcade-hair-options" class="creator-hair"></div></fieldset>
          <div class="creator-journey"><span>BIANCA</span><div id="arcade-rank-trail" aria-label="Progressione delle cinture"></div><strong>10º DAN</strong></div>
          <p class="creator-rules">20 sfide. Una promozione per vittoria. Una sconfitta termina la scalata. <strong>Nome e risultato finale vengono salvati automaticamente nella classifica pubblica.</strong> Nessun account richiesto. La partita non può essere ripresa.</p>
          <p id="arcade-create-error" class="arcade-message" role="alert"></p>
          <button id="arcade-create-submit" type="submit" class="start-button" disabled>PREPARO IL KARATEKA…</button>
        </form>`;
      $('versus-screen').before(creator);
      const nameKeys = document.createElement('button'); nameKeys.id = 'arcade-name-keyboard'; nameKeys.type = 'button'; nameKeys.className = 'name-keyboard-trigger'; nameKeys.textContent = '⌨ TASTIERA A SCHERMO';
      $('arcade-name').after(nameKeys);
      this.nameKeyboard = new global.DojoNameKeyboard({
        input: $('arcade-name'), trigger: nameKeys, host: $('game-shell'), next: $('arcade-create-submit'),
        validate: name => global.DojoArcade.validateCharacter({ ...this.appearance, name }).name,
        onConfirm: name => { this.appearance.name = name; this.error(); this.renderAppearance(); }
      });
      const dialog = document.createElement('dialog'); dialog.id = 'leaderboard-dialog'; dialog.className = 'leaderboard-dialog';
      dialog.innerHTML = '<button class="close-dialog" aria-label="Chiudi la classifica">×</button><span class="eyebrow">ARCADE / CLASSIFICA COMMUNITY</span><h2>IL MURO DEL DOJO.</h2><p>Le scalate concluse, dal grado più alto al punteggio migliore.</p><p id="leaderboard-run-summary" hidden></p><p id="leaderboard-save-status" role="status" hidden></p><p id="leaderboard-status" role="status">Carico la classifica…</p><div class="leaderboard-scroll"><table id="leaderboard-table"><caption class="sr-only">Risultati Arcade</caption><thead><tr><th>#</th><th>KARATEKA</th><th>GRADO</th><th>PUNTI</th><th>VITTORIE</th></tr></thead><tbody id="leaderboard-body"></tbody></table></div><p id="leaderboard-note"></p><div class="leaderboard-actions"><button type="button" id="leaderboard-retry-save" class="secondary-button" hidden>RIPROVA IL SALVATAGGIO</button><button type="button" id="leaderboard-reload" class="secondary-button">AGGIORNA CLASSIFICA</button></div>';
      $('game-shell').append(dialog);
      dialog.addEventListener('close', () => this.dismissLeaderboard());
      dialog.addEventListener('cancel', () => this.dismissLeaderboard());
      const summary = document.createElement('div'); summary.id = 'arcade-result-summary'; summary.hidden = true;
      summary.innerHTML = '<div id="arcade-result-belt" class="arcade-belt" role="img"></div><p id="arcade-result-stats"></p>';
      $('result-text').after(summary);
      const publish = document.createElement('button'); publish.type = 'button'; publish.id = 'arcade-publish'; publish.className = 'secondary-button'; publish.textContent = 'RIPROVA IL SALVATAGGIO'; publish.hidden = true;
      const check = document.createElement('button'); check.id = 'arcade-check-result'; check.className = 'secondary-button'; check.textContent = 'VEDI CLASSIFICA'; check.hidden = true;
      const notice = document.createElement('p'); notice.id = 'arcade-publish-status'; notice.className = 'arcade-message'; notice.setAttribute('role', 'status');
      $('result-menu-button').after(publish, check, notice);
      const actions = document.createElement('div'); actions.className = 'result-actions';
      $('rematch-button').before(actions);
      actions.append($('rematch-button'), $('result-menu-button'), publish, check);
      const badge = document.createElement('div'); badge.id = 'arcade-run-badge'; badge.hidden = true; badge.setAttribute('aria-live', 'polite'); $('viewport').append(badge);
      for (let i = 0; i < 5; i++) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.arcadeHair = i;
        button.setAttribute('aria-label', 'Capigliatura ' + (i + 1)); button.setAttribute('aria-pressed', String(i === 0));
        button.innerHTML = '<canvas width="100" height="100" aria-hidden="true"></canvas><span>' + String(i + 1).padStart(2, '0') + '</span>';
        button.addEventListener('click', () => { this.appearance.hairstyle = i; this.renderAppearance(); onAppearance?.(this.appearance); });
        $('arcade-hair-options').append(button);
      }
      for (const rank of global.DojoArcade.RANKS) {
        const mark = document.createElement('i'); mark.style.setProperty('--rank-color', rank.color); mark.title = rank.label; $('arcade-rank-trail').append(mark);
      }
      $('arcade-back').addEventListener('click', onBack);
      $('leaderboard-title-button').addEventListener('click', onLeaderboard);
      $('arcade-name').addEventListener('input', () => { this.appearance.name = $('arcade-name').value; this.error(); this.renderAppearance(); });
      document.querySelectorAll('[data-arcade-gender]').forEach(button => button.addEventListener('click', () => {
        this.appearance.gender = button.dataset.arcadeGender; this.renderAppearance(); onAppearance?.(this.appearance);
      }));
      $('arcade-form').addEventListener('submit', event => {
        event.preventDefault();
        if (!this.ready) { if (this.failed) onRetry?.(); return; }
        try { onCreate(global.DojoArcade.validateCharacter(this.appearance)); }
        catch (error) { this.error(error.message || 'Controlla il nome del karateka.'); if (this.nameKeyboard.touch) this.nameKeyboard.open(); else $('arcade-name').focus(); }
      });
      $('leaderboard-reload').addEventListener('click', () => this.loadLeaderboard(true));
      $('leaderboard-retry-save').addEventListener('click', () => this.publishRecord());
      $('arcade-check-result').addEventListener('click', () => this.checkRecord());
      publish.addEventListener('click', () => this.publishRecord());
      creator.addEventListener('keydown', event => { if (escapeKey(event)) { event.stopPropagation(); onBack(); } });
    }
    error(message = '') { $('arcade-create-error').textContent = message; }
    setLoading(state, error) {
      this.ready = state === 'ready'; this.failed = state === 'error';
      $('arcade-create-submit').disabled = !this.ready && !this.failed;
      $('arcade-create-submit').textContent = this.ready ? 'ENTRA NEL TATAMI ↗' : this.failed ? 'RIPROVA IL CARICAMENTO' : 'PREPARO IL KARATEKA…';
      $('arcade-art-status').hidden = this.ready;
      $('arcade-art-status').textContent = this.failed ? 'Non riesco a caricare il karateka.' : 'Preparo il tuo karateka…';
      this.error(error || ''); if (this.ready) this.renderAppearance();
    }
    setBusy(busy, message = '') {
      $('arcade-form').setAttribute('aria-busy', String(busy));
      $('arcade-name').disabled = busy;
      $('arcade-name-keyboard').disabled = busy;
      $('arcade-form').querySelectorAll('[data-arcade-gender],[data-arcade-hair]').forEach(button => { button.disabled = busy; });
      $('arcade-create-submit').disabled = busy || !this.ready;
      $('arcade-create-submit').textContent = busy ? 'PREPARO LA SFIDA…' : 'ENTRA NEL TATAMI ↗';
      this.error(message);
    }
    renderAppearance() {
      $('arcade-preview-name').textContent = this.appearance.name.trim().toLocaleUpperCase('it') || 'IL TUO KARATEKA';
      document.querySelectorAll('[data-arcade-gender]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.arcadeGender === this.appearance.gender)));
      document.querySelectorAll('[data-arcade-hair]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.arcadeHair) === this.appearance.hairstyle)));
      if (!this.ready || !global.ArcadeArt?.drawPreview) return;
      const appearance = { ...this.appearance, hair: this.appearance.hairstyle, rank: global.DojoArcade.RANKS[0] };
      const canvas = $('arcade-preview'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
      global.ArcadeArt.drawPreview(ctx, appearance, 0, 0, canvas.width, canvas.height);
      document.querySelectorAll('[data-arcade-hair]').forEach(button => {
        const c = button.querySelector('canvas'), p = c.getContext('2d'); p.clearRect(0, 0, c.width, c.height);
        global.ArcadeArt.drawPreview(p, { ...appearance, hair: Number(button.dataset.arcadeHair), bust: true }, 0, 0, c.width, c.height);
      });
    }
    showRun(state, match) {
      $('arcade-run-badge').hidden = !state;
      if (state) $('arcade-run-badge').textContent = `ARCADE · ${state.rank.label} · SFIDA ${match?.number || state.matches + 1}/20 · ${state.score.toLocaleString('it-IT')} PT`;
    }
    showResult(state, finalRecord) {
      const previousId = this.record?.id;
      this.record = finalRecord || null;
      this.finalSaves ||= new Map();
      if (previousId !== this.record?.id) this.dismissLeaderboard();
      $('arcade-result-summary').hidden = !state;
      $('result-panel').classList.toggle('arcade-result', !!state);
      $('arcade-check-result').hidden = !finalRecord;
      $('arcade-check-result').disabled = false;
      $('leaderboard-run-summary').hidden = !finalRecord;
      if (state) {
        ArcadeUI.belt($('arcade-result-belt'), state.rank);
        $('arcade-result-stats').textContent = `${state.score.toLocaleString('it-IT')} PUNTI · ${state.wins}/20 VITTORIE`;
      }
      if (!finalRecord) { this.renderSaveState(); return; }
      $('leaderboard-run-summary').textContent = `${finalRecord.name} · ${state.rank.label} · ${state.score.toLocaleString('it-IT')} PUNTI`;
      let save = this.finalSaves.get(finalRecord.id);
      if (!save) {
        const configured = global.DojoLeaderboard.submission(finalRecord).configured;
        save = { status: configured ? 'new' : 'unavailable', opened: false };
        this.finalSaves.set(finalRecord.id, save);
      }
      this.renderSaveState();
      if (!save.opened) {
        save.opened = true;
        this.leaderboardDismissed = false;
        $('leaderboard-body').replaceChildren();
        $('leaderboard-note').textContent = '';
        $('leaderboard-status').textContent = save.status === 'new' ? 'La classifica apparirà dopo il salvataggio…' : 'Carico la classifica…';
        this.onFinalLeaderboard?.();
      }
      if (save.status === 'new') return this.publishRecord();
      if (save.status === 'saving') return save.promise;
      if ($('leaderboard-dialog').open && !this.leaderboardDismissed) return this.loadLeaderboard(true);
    }
    dismissLeaderboard() {
      this.leaderboardVersion = (this.leaderboardVersion || 0) + 1;
      this.leaderboardDismissed = true;
    }
    renderSaveState() {
      const save = this.record && this.finalSaves?.get(this.record.id);
      const saved = save?.status === 'saved', failed = save?.status === 'error';
      this.publishedId = saved ? this.record.id : null;
      const message = !save ? '' : saved ? 'RISULTATO SALVATO. OSU!' : failed ?
        (save.error || 'Salvataggio non confermato. Controlla la connessione e riprova.') : save.status === 'unavailable' ?
        'Salvataggio non disponibile al momento. Puoi consultare la classifica.' : 'Salvo automaticamente il risultato…';
      if (!failed) {
        const focused = document.activeElement;
        const nextFocus = focused === $('leaderboard-retry-save') && !focused.hidden ? $('leaderboard-dialog').querySelector('.close-dialog') :
          focused === $('arcade-publish') && !focused.hidden ? $('arcade-check-result') : null;
        if (nextFocus && !nextFocus.hidden && !nextFocus.disabled) nextFocus.focus({ preventScroll: true });
      }
      $('arcade-publish').hidden = !failed;
      $('arcade-publish').disabled = !failed;
      $('arcade-publish').textContent = 'RIPROVA IL SALVATAGGIO';
      $('leaderboard-retry-save').hidden = !failed;
      $('leaderboard-retry-save').disabled = !failed;
      $('arcade-publish-status').textContent = message;
      $('leaderboard-save-status').hidden = !save;
      $('leaderboard-save-status').textContent = message;
    }
    publishRecord() {
      if (!this.record) return Promise.resolve();
      const record = this.record, save = this.finalSaves.get(record.id);
      if (!save || save.status === 'saved' || save.status === 'unavailable') return Promise.resolve();
      if (save.status === 'saving') return save.promise;
      save.status = 'saving'; save.error = '';
      this.renderSaveState();
      // The same immutable run id is retained on retry, including an uncertain
      // connection failure after the server may already have stored the result.
      save.promise = (async () => {
        try {
          const confirmation = await global.DojoLeaderboard.submit(record);
          if (confirmation?.id !== record.id) throw new Error('La conferma del salvataggio non è valida. Riprova.');
          save.status = 'saved';
        } catch (error) {
          save.status = 'error';
          save.error = error.message || 'Salvataggio non confermato. Controlla la connessione e riprova.';
        }
        if (this.record?.id !== record.id) return;
        this.renderSaveState();
        // A closed dialog stays closed, even if a slow save completes later.
        if ($('leaderboard-dialog').open && !this.leaderboardDismissed) await this.loadLeaderboard(true);
      })();
      return save.promise;
    }
    async loadLeaderboard(force = false) {
      const version = this.leaderboardVersion = (this.leaderboardVersion || 0) + 1;
      const recordId = this.record?.id;
      this.leaderboardDismissed = false;
      const current = () => version === this.leaderboardVersion && recordId === this.record?.id && !this.leaderboardDismissed;
      const status = $('leaderboard-status');
      status.textContent = 'Carico i risultati pubblici…';
      $('leaderboard-reload').disabled = true;
      $('leaderboard-note').textContent = '';
      try {
        const records = await global.DojoLeaderboard.load({ force });
        if (!current()) return null;
        const details = global.DojoLeaderboard.details?.();
        const entries = details?.entries || records;
        const ownIndex = recordId ? entries.findIndex(record => record.id === recordId) : -1;
        // Keep the real ranking number when the current run is below the top 50.
        const visible = entries.slice(0, 50).map((record, index) => ({ record, index }));
        if (ownIndex >= 50) visible.push({ record: entries[ownIndex], index: ownIndex });
        const body = $('leaderboard-body'); body.replaceChildren();
        let ownRow;
        visible.forEach(({ record, index }) => {
          const row = document.createElement('tr');
          for (const value of [index + 1, record.name, record.rankLabel, record.score.toLocaleString('it-IT'), record.wins + '/20']) {
            const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
          }
          if (record.id === recordId) { ownRow = row; row.classList.add('own-record'); row.setAttribute('aria-label', `Il tuo risultato, posizione ${index + 1}`); }
          body.append(row);
        });
        ownRow?.scrollIntoView?.({ block: 'nearest' });
        const saved = this.publishedId === recordId && !!recordId;
        status.textContent = ownIndex >= 0 ? `Il tuo risultato è al ${ownIndex + 1}º posto su ${entries.length}.` :
          saved ? 'Risultato salvato. La classifica si sta aggiornando: premi Aggiorna tra poco.' :
          entries.length ? `${entries.length} ${entries.length === 1 ? 'risultato' : 'risultati'} in classifica.` : 'Il muro è ancora vuoto. La prima scalata può essere la tua.';
        const sourceNote = details?.archive ? 'Mostro l’ultima classifica disponibile: i risultati più recenti potrebbero non essere ancora presenti.' : 'Risultati salvati nella classifica online.';
        $('leaderboard-note').textContent = (details?.partial ? 'Mostro una parte dei risultati disponibili. ' : '') + sourceNote + ' Nessuna partita può essere ripresa dalla classifica.';
        return records;
      } catch (error) {
        if (!current()) return null;
        $('leaderboard-body').replaceChildren();
        status.textContent = (this.publishedId === recordId && recordId ? 'Il risultato è salvato. ' : '') + (error.message || 'Classifica non disponibile. Riprova tra poco.');
        return null;
      } finally { if (current()) $('leaderboard-reload').disabled = false; }
    }
    checkRecord() {
      if (!this.record) return Promise.resolve();
      this.leaderboardDismissed = false;
      if (!$('leaderboard-dialog').open) this.onFinalLeaderboard?.();
      this.renderSaveState();
      return this.loadLeaderboard(true);
    }
    static belt(element, rank) {
      element.replaceChildren(); element.style.setProperty('--belt-color', rank.color); element.setAttribute('aria-label', rank.label);
      const tail = document.createElement('span'); tail.className = 'belt-tail';
      const count = rank.dan || (rank.stripe ? 1 : 0);
      for (let i = 0; i < count; i++) { const stripe = document.createElement('i'); stripe.style.background = rank.dan ? '#f3cc67' : rank.stripe; tail.append(stripe); }
      element.append(tail);
    }
  }
  global.ArcadeUI = ArcadeUI;
})(window);
