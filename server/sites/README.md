# Kyokushin Dojo — Servizio classifica

Servizio Sites/Vinext su Cloudflare Workers e D1. Accetta soltanto risultati finali Arcade con un nome scelto: nessun account giocatore, nessuna credenziale GitHub sul servizio e nessun avanzamento ripristinabile.

## Percorsi

- `GET /health`: stato del servizio e del collegamento D1.
- `POST /records`: riceve un risultato finale validato, massimo 4096 byte. Risponde soltanto dopo la scrittura duratura in D1 con `{id, stored:true, duplicate, githubSynced:false, archiveUrl}`.
- `GET /records`: snapshot pubblico JSON, pagine di massimo 1000 record ordinate per ricezione e id. `nextCursor` è nullo all’ultima pagina; altrimenti passarlo come `?after=...`. Il cursore include anche l’id, così record con uguale timestamp non vengono saltati.

Il servizio contiene soltanto finalRecord: nome, aspetto, grado, punti, vittorie, durata ed esito. Non contiene stato del combattimento, impostazioni per riprendere una partita o account dei giocatori. La classifica è amatoriale e non certifica l’assenza di modifiche al browser.

## GitHub

La copia GitHub viene aggiornata dal workflow `sync-arcade-leaderboard.yml` nel repository del gioco. Il workflow legge tutte le pagine dello snapshot, convalida ogni record e committa esclusivamente `data/arcade-leaderboard.json`. Usa il `GITHUB_TOKEN` temporaneo del workflow con `contents: write`; questo servizio non riceve token.

Il risultato è disponibile subito in D1. La copia GitHub è differita e dipende dall’esecuzione di GitHub Actions, che può ritardare. Una conferma di salvataggio non dichiara già completata la sincronizzazione GitHub. Il gioco legge primariamente l’API online, con archivio GitHub come ripiego.

## Limiti e protezioni

- Scrittura consentita solo dall’origine del gioco (`https://andreavullo.github.io` per impostazione predefinita). `ALLOWED_ORIGINS` può configurare un elenco separato da virgole.
- Formato JSON, controllo di tutti i campi, nome normalizzato e limiti di punteggio/progressione.
- Cinque tentativi ogni dieci minuti per indirizzo e trenta al minuto complessivi, usando contatori atomici D1 condivisi fra istanze. Le chiavi degli indirizzi sono impronte temporanee; gli indirizzi non entrano nei risultati.
- Identificativo univoco e impronta del risultato: un reinvio identico non crea duplicati, dati cambiati con lo stesso id vengono rifiutati.
- Le letture sono pubbliche e non permettono modifiche o cancellazioni. Non esiste un endpoint di amministrazione pubblica.
- L’origine non autentica un programma esterno; i limiti riducono gli abusi comuni ma non sostituiscono un sistema anti-cheat.

## Sviluppo e pubblicazione

La cartella usa lo starter Sites con integrazione `sites()` preservata. La configurazione `.openai/hosting.json` dichiara `d1: "DB"`; le migrazioni sono in `drizzle/` e vengono applicate da Sites prima della pubblicazione.

```sh
node --test tests/service.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

I test usano SQLite reale in memoria e lo stesso SQL della migrazione: verificano salvataggio, reinvii simultanei, schema, origini, dimensione, limiti D1, paginazione di 1001 record ed errori. Non vengono aggiunti risultati di prova in produzione.

Le credenziali temporanee per sincronizzare i sorgenti Sites devono restare in memoria ed essere passate al workflow tramite stdin, mai salvate in questa cartella. Nessun segreto è necessario per archiviare i record in D1.

Project ID: `appgprj_6add6f19c5b8819186886c015a2bd7f8`.
URL pubblico attivo: `https://kyokushin-dojo-classifica.flazio1.chatgpt.site`. Distribuzione e collegamento al database verificati il 25 ottobre 2026; vedere `../README.md` per la versione distribuita.
