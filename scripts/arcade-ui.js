/* Arcade creator and public results. Match progress lives only in main/arcade. */
(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeKey = event => event.key === 'Escape';
  class ArcadeUI {
    constructor({ onCreate, onBack, onLeaderboard, onAppearance, onRetry }) {
      this.appearance = { name: '', gender: 'male', hairstyle: 0 };
      this.ready = false;
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
          <p class="creator-rules">20 sfide. Una promozione per vittoria. Una sconfitta termina la scalata. <strong>Nessun salvataggio della partita.</strong></p>
          <p id="arcade-create-error" class="arcade-message" role="alert"></p>
          <button id="arcade-create-submit" type="submit" class="start-button" disabled>PREPARO IL KARATEKA…</button>
        </form>`;
      $('versus-screen').before(creator);
      const dialog = document.createElement('dialog'); dialog.id = 'leaderboard-dialog'; dialog.className = 'leaderboard-dialog';
      dialog.innerHTML = '<button class="close-dialog" aria-label="Chiudi la classifica">×</button><span class="eyebrow">ARCADE / CLASSIFICA COMMUNITY</span><h2>IL MURO DEL DOJO.</h2><p>Le scalate concluse, dal grado più alto al punteggio migliore.</p><p id="leaderboard-status" role="status">Carico la classifica…</p><div class="leaderboard-scroll"><table id="leaderboard-table"><caption class="sr-only">Risultati Arcade</caption><thead><tr><th>#</th><th>KARATEKA</th><th>GRADO</th><th>PUNTI</th><th>VITTORIE</th></tr></thead><tbody id="leaderboard-body"></tbody></table></div><p id="leaderboard-note"></p><button type="button" id="leaderboard-reload" class="secondary-button">AGGIORNA CLASSIFICA</button>';
      $('game-shell').append(dialog);
      const summary = document.createElement('div'); summary.id = 'arcade-result-summary'; summary.hidden = true;
      summary.innerHTML = '<div id="arcade-result-belt" class="arcade-belt" role="img"></div><p id="arcade-result-stats"></p>';
      $('result-text').after(summary);
      const publish = document.createElement('button'); publish.type = 'button'; publish.id = 'arcade-publish'; publish.className = 'secondary-button'; publish.textContent = 'SALVA IN CLASSIFICA ↗'; publish.hidden = true;
      const check = document.createElement('button'); check.id = 'arcade-check-result'; check.className = 'secondary-button'; check.textContent = 'VERIFICA IN CLASSIFICA'; check.hidden = true;
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
        catch (error) { this.error(error.message || 'Controlla il nome del karateka.'); $('arcade-name').focus(); }
      });
      $('leaderboard-reload').addEventListener('click', () => this.loadLeaderboard(true));
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
      this.record = finalRecord || null;
      this.publicationVersion = (this.publicationVersion || 0) + 1;
      this.publishedId = null;
      $('arcade-result-summary').hidden = !state;
      $('result-panel').classList.toggle('arcade-result', !!state);
      $('arcade-publish').hidden = !finalRecord; $('arcade-check-result').hidden = !finalRecord;
      $('arcade-publish').disabled = false;
      $('arcade-publish').textContent = 'SALVA IN CLASSIFICA ↗';
      $('arcade-check-result').disabled = false;
      $('arcade-publish-status').textContent = '';
      if (!state) return;
      ArcadeUI.belt($('arcade-result-belt'), state.rank);
      $('arcade-result-stats').textContent = `${state.score.toLocaleString('it-IT')} PUNTI · ${state.wins}/20 VITTORIE`;
      if (finalRecord) {
        const submission = global.DojoLeaderboard.submission(finalRecord);
        $('arcade-publish').disabled = !submission.configured;
        $('arcade-publish-status').textContent = submission.configured ? 'Salva il tuo nome e il risultato nella classifica pubblica. Nessun account richiesto.' : 'La classifica è consultabile. L’invio dei risultati deve ancora essere attivato.';
      }
    }
    async publishRecord() {
      if (!this.record || $('arcade-publish').disabled) return;
      const record = this.record;
      this.publicationVersion = (this.publicationVersion || 0) + 1;
      $('arcade-publish').disabled = true;
      $('arcade-check-result').disabled = true;
      $('arcade-publish').textContent = 'SALVO IL RISULTATO…';
      $('arcade-publish-status').textContent = 'Invio il risultato alla classifica…';
      try {
        await global.DojoLeaderboard.submit(record);
        if (this.record !== record) return;
        this.publishedId = record.id;
        $('arcade-publish').textContent = 'RISULTATO SALVATO ✓';
        $('arcade-publish-status').textContent = 'RISULTATO PUBBLICATO. OSU! La partita non viene salvata.';
      } catch (error) {
        if (this.record !== record) return;
        $('arcade-publish').disabled = false;
        $('arcade-publish').textContent = 'RIPROVA IL SALVATAGGIO';
        $('arcade-publish-status').textContent = error.message || 'Non riesco a salvare il risultato. Riprova.';
      } finally { if (this.record === record) $('arcade-check-result').disabled = false; }
    }
    async loadLeaderboard(force = false) {
      const status = $('leaderboard-status'); status.textContent = 'Carico i risultati pubblici…'; $('leaderboard-reload').disabled = true;
      try {
        const records = await global.DojoLeaderboard.load({ force });
        const body = $('leaderboard-body'); body.replaceChildren();
        records.forEach((record, i) => {
          const row = document.createElement('tr');
          for (const value of [i + 1, record.name, record.rankLabel, record.score.toLocaleString('it-IT'), record.wins + '/20']) {
            const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
          }
          if (record.id === this.record?.id) row.classList.add('own-record'); body.append(row);
        });
        status.textContent = records.length ? `${records.length} risultati in classifica.` : 'Il muro è ancora vuoto. La prima scalata può essere la tua.';
        const details = global.DojoLeaderboard.details?.();
        $('leaderboard-note').textContent = details?.partial ? 'Sono mostrati i risultati disponibili nelle ultime 500 segnalazioni GitHub.' : 'Risultati pubblicati dalla community su GitHub. Nessuna partita può essere ripresa dalla classifica.';
        return records;
      } catch (error) { status.textContent = error.message || 'Classifica non disponibile. Riprova tra poco.'; return null; }
      finally { $('leaderboard-reload').disabled = false; }
    }
    async checkRecord() {
      if (!this.record || $('arcade-check-result').disabled) return;
      const record = this.record, version = this.publicationVersion; $('arcade-check-result').disabled = true;
      $('arcade-publish-status').textContent = 'Verifico la pubblicazione…';
      try {
        const records = await global.DojoLeaderboard.load({ force: true });
        if (this.record !== record || this.publicationVersion !== version) return;
        const entries = global.DojoLeaderboard.details?.()?.entries || records;
        $('arcade-publish-status').textContent = entries.some(r => r.id === record.id) ? 'RISULTATO PUBBLICATO. OSU!' : this.publishedId === record.id ? 'Risultato salvato. La classifica si sta aggiornando.' : 'Risultato non ancora trovato. Salvalo in classifica e riprova tra poco.';
      } catch (error) { if (this.record === record && this.publicationVersion === version) $('arcade-publish-status').textContent = error.message || 'Verifica non disponibile.'; }
      finally { if (this.record === record && this.publicationVersion === version) $('arcade-check-result').disabled = false; }
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
