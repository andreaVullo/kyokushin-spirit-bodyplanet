# Classifica Arcade: solo nome, senza account

Il giocatore sceglie il nome del karateka e può pubblicare il risultato finale senza account, email o password. Il [servizio del dojo](https://kyokushin-dojo-classifica.flazio1.chatgpt.site) conserva il risultato in un database D1 e lo rende subito leggibile. Un workflow nel repository del gioco ne copia periodicamente l’archivio su GitHub.

**Il servizio è attivo.** `scripts/leaderboard-config.js` contiene l’endpoint HTTPS `/records`. Il codice del servizio distribuito è versionato in `server/sites/`. Non sono necessari token GitHub nel browser, nel codice Flazio o nel servizio.

## Pubblicare un risultato

1. Concludi la sfida Arcade: sconfitta, abbandono o raggiungimento del 10° Dan.
2. Premi **Salva in classifica**. Nome, aspetto del personaggio, grado, punti, vittorie e durata vengono inviati al servizio del dojo.
3. La conferma compare dopo la scrittura nel database. **Verifica in classifica** permette di ricontrollarne la presenza.

Nome e risultato sono pubblici. La pubblicazione è facoltativa; la partita funziona anche offline. I nomi non sono riservati e possono essere scelti da più persone. Un reinvio dello stesso risultato non crea duplicati.

**Il salvataggio online è immediato; la copia su GitHub è differita.** Il workflow `sync-arcade-leaderboard.yml` è programmato ogni 15 minuti e può subire ritardi. La conferma online non dichiara già completata la copia. Il file pubblico è [data/arcade-leaderboard.json](data/arcade-leaderboard.json), inizialmente vuoto e senza risultati dimostrativi.

## Risultati e avanzamento

La partita in corso rimane soltanto in memoria. Non viene scritta in localStorage, sessionStorage, IndexedDB, D1 o GitHub. Chiudere o ricaricare il gioco perde la sfida. I record finali non contengono lo stato necessario a ripristinare un incontro e non sono importabili come salvataggi.

La classifica ordina prima per grado raggiunto, poi per punti, vittorie e durata minore. Il percorso è bianca → 10 Kyu fino a 1 Kyu → 1 Dan fino a 10 Dan. La pagina mostra al massimo 50 risultati. Il client controlla fino a 20.000 record per individuare anche una propria sfida fuori dai primi 50; se resta altro materiale, segnala che la lettura è parziale.

È una classifica amatoriale: il browser calcola i risultati. Formato e limiti numerici vengono controllati anche dal servizio, ma non certificano che la partita sia stata giocata senza modifiche. Un sistema anti-cheat richiederebbe verifica degli incontri lato server.

## Lettura e archivio

- Il gioco legge `GET /records` con pagine di massimo 1.000 record. Se la lettura fallisce, prova la copia GitHub e avverte che può essere meno recente.
- La risposta viene tenuta in memoria per 60 secondi; **Aggiorna** forza una nuova lettura. Errori di rete non inventano risultati e non interrompono il gioco.
- `tools/sync-arcade-leaderboard.cjs` segue tutte le pagine, fino al limite di sicurezza di 50.000 record, riconvalida i dati e aggiorna atomicamente il file GitHub soltanto dopo una lettura completa e valida. Errori o superamento del limite lasciano intatto l’archivio precedente.
- Il workflow può anche essere eseguito manualmente dalla scheda Actions. Usa il `GITHUB_TOKEN` temporaneo con il solo permesso `contents: write`; non servono token personali o segreti nel servizio.
- Nei repository pubblici GitHub può disattivare i workflow programmati dopo 60 giorni senza attività. Controllare lo stato di **Archive Arcade leaderboard** se la copia smette di aggiornarsi.
- Non esiste un endpoint pubblico per modificare o cancellare i risultati. Una rimozione richiede manutenzione autorizzata nel database del servizio; modificare soltanto la copia GitHub non rimuove il record originale.

Le copie dell’archivio restano nella cronologia Git del repository. Vedi [server/README.md](server/README.md) per origini ammesse, limiti, sorgenti e aggiornamenti.

## API del gioco

Caricare configurazione e `scripts/leaderboard.js` prima dell’interfaccia:

```js
const rows = await DojoLeaderboard.load({ force: true }); // primi 50 risultati
const metadata = DojoLeaderboard.details();             // entries, partial, archive
const result = await DojoLeaderboard.submit(run.finalRecord());
// { id, stored: true, duplicate, githubSynced: false, archiveUrl }
```

`submit` va chiamato soltanto alla pressione di **Salva in classifica**. Restituisce conferma dopo la risposta validata del servizio; senza endpoint restituisce `not-configured`. Per verificare, cercare l’id in `metadata.entries` dopo un aggiornamento riuscito. `metadata.archive` indica il ripiego sulla copia GitHub; trovare il record lì conferma anche la sincronizzazione. Inserire i nomi nell’interfaccia tramite `textContent`.

## Verifica

```sh
node --test tests/leaderboard.test.cjs tests/leaderboard-sync.test.cjs tests/arcade-ui.test.cjs
node --test server/sites/tests/service.test.mjs
```

I test coprono schema, Unicode, progressione, invio anonimo, deduplicazione, paginazione, sincronizzazione, origini, dimensioni, limiti condivisi, concorrenza e messaggi corretti sull’archivio differito. Il servizio è provato con SQLite reale in memoria e la migrazione distribuita. Le prove non inseriscono risultati dimostrativi nella classifica pubblica.

Riferimenti: [eventi e pianificazioni GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [credenziale temporanea del workflow](https://docs.github.com/en/actions/concepts/security/github_token).
