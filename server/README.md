# Servizio online della classifica Arcade

Il servizio è pubblicato su **[kyokushin-dojo-classifica.flazio1.chatgpt.site](https://kyokushin-dojo-classifica.flazio1.chatgpt.site)**. I giocatori inviano soltanto il nome scelto e il risultato finale, senza account. La scrittura avviene nel database D1; un workflow separato copia periodicamente i risultati nel repository GitHub. Non viene salvato l’avanzamento della partita.

## Sorgenti e distribuzione

`server/sites/` contiene il progetto Sites/Vinext completo, con dipendenze bloccate, migrazione D1, handler e test. Sono esclusi dipendenze installate, build, database locali, credenziali e stato degli strumenti. Questa cartella sostituisce il precedente server Node con token Issues: il servizio attuale non richiede credenziali GitHub.

Distribuzione verificata il 25 ottobre 2026:

- Progetto Sites: `appgprj_6add6f19c5b8819186886c015a2bd7f8`.
- Versione: `appgprj_6add6f19c5b8819186886c015a2bd7f8~appgver_d1cafb8c372c8191905852228a596081`.
- Commit del repository sorgente Sites: `16ce728ff1332d611ec9949bb77b18bddf9f467e`.
- `GET /health` ha confermato servizio pronto e D1 presente.
- Lettura pubblica, preflight dall’origine GitHub Pages e rifiuto di un record non valido sono stati verificati. Nessun risultato di prova è stato inserito in produzione.

Gli aggiornamenti di `server/sites/` devono essere distribuiti allo **stesso progetto Sites** usando il flusso Sites. Un normale push del gioco su GitHub aggiorna i file, ma non ridistribuisce automaticamente il servizio. Conservare `.openai/hosting.json` e la cronologia delle migrazioni; non creare un nuovo database a ogni aggiornamento. Il README dentro `sites/` descrive sviluppo e build.

## API

- `GET /health`: stato del servizio e del database, senza dati riservati.
- `GET /records`: archivio pubblico paginato; `nextCursor` nullo segnala l’ultima pagina.
- `POST /records`: JSON del risultato finale, massimo 4096 byte.

Dopo una scrittura confermata, il servizio restituisce `{id, stored:true, duplicate, githubSynced:false, archiveUrl}`. `githubSynced:false` ricorda che la copia GitHub avviene in seguito. Ripetere lo stesso record restituisce `duplicate:true`; riusare l’id con dati cambiati produce un conflitto.

Il client del gioco è collegato tramite `scripts/leaderboard-config.js`. Usa HTTPS e non invia cookie. L’origine ammessa per scrivere è `https://andreavullo.github.io`: conta l’origine dell’iframe del gioco, non quella della pagina Flazio esterna. Per cambiare hosting del gioco, aggiornare la variabile server `ALLOWED_ORIGINS` con le origini esatte. Le letture sono pubbliche.

D1 condivide i contatori tra le istanze: massimo 5 tentativi ogni 10 minuti per indirizzo e 30 al minuto in totale. L’indirizzo fornito dalla rete Cloudflare viene trasformato in un’impronta temporanea; non è aggiunto ai record. CORS e rate limit riducono gli abusi comuni, ma non autenticano il giocatore e non certificano i punteggi.

## Copia GitHub

Il workflow `.github/workflows/sync-arcade-leaderboard.yml` legge l’API pubblica e aggiorna solo `data/arcade-leaderboard.json`. È programmato ogni 15 minuti, con eventuali ritardi di GitHub Actions; è disponibile anche l’avvio manuale. Usa esclusivamente il `GITHUB_TOKEN` temporaneo di Actions con `contents: write`, senza token personali nel servizio.

`tools/sync-arcade-leaderboard.cjs` valida pagine e record prima della sostituzione atomica. Un errore conserva la copia precedente. Nessun nome o campo del risultato viene interpolato in comandi shell. Controllare le esecuzioni nella scheda Actions del repository dopo la pubblicazione del workflow.

## Test

Dalla radice del gioco, con Node.js 22.13 o successivo:

```sh
node --test tests/leaderboard.test.cjs tests/leaderboard-sync.test.cjs tests/arcade-ui.test.cjs
node --test server/sites/tests/service.test.mjs
```

I test del servizio usano SQLite reale in memoria e lo stesso SQL della migrazione D1. Le verifiche di produzione devono usare richieste di lettura o record invalidi; la prima scrittura pubblica valida deve essere un risultato reale scelto dal giocatore.
