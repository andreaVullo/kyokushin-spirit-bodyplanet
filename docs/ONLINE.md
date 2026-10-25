# Dojo online

Il gioco offre incontri 1 contro 1, allenamento con un'altra persona, stanze private con codice di sei caratteri e ricerca di un avversario. I partecipanti scelgono un nome e uno dei dieci karateka del roster; non serve un account. L'host determina la modalità della stanza, anche quando l'ospite entra tramite codice o invito.

## Architettura e hosting

Il gioco e gli sprite restano sul sito statico GitHub Pages. Le API delle stanze utilizzano il servizio Sites già impiegato per la classifica:

`https://kyokushin-dojo-classifica.flazio1.chatgpt.site`

`scripts/online-config.js` configura questo indirizzo. `scripts/online-client.js` gestisce la stanza e la connessione WebRTC; `scripts/online-session.js` coordina preparazione, caricamento, incontro e rivincita. Il servizio salva in D1 solo partecipanti, disponibilità e messaggi necessari a stabilire la connessione. Input e stato della partita viaggiano nel DataChannel WebRTC e non passano dal database. Il browser dell'host esegue la simulazione del combattimento; quello dell'ospite invia i propri comandi e riceve gli aggiornamenti.

GitHub Pages è un servizio statico e da solo non può eseguire il matchmaking o ricevere connessioni server persistenti. Il codice del servizio è archiviato in `server/sites`; la copia operativa del progetto Sites si mantiene separata e viene pubblicata con il workflow ufficiale Sites. Non è necessario attivare un nuovo servizio per stanze e signaling.

## Connessione e reti mobili

Il servizio fornisce il server STUN pubblico `stun:stun.cloudflare.com:3478`. Una connessione diretta WebRTC può non riuscire quando NAT o firewall impediscono il collegamento fra i browser, anche su alcune reti mobili. La disponibilità della stanza non prova che la connessione di gioco sia già stabilita.

Questa versione non attiva un relay TURN a pagamento. Per estendere la copertura di rete, il backend può ricevere `TURN_ICE_SERVERS_JSON` nelle variabili runtime del servizio. Il valore è un array di server RTC con `urls`, `username` e `credential`: usare credenziali temporanee emesse dal proprio servizio TURN. La configurazione viene restituita soltanto ai partecipanti autenticati. Non inserire segreti amministrativi del provider, credenziali permanenti, token di pubblicazione o valori di produzione nel repository o nel JavaScript statico. Nessuna connessione viene degradata a un relay dei frame tramite D1.

Riferimenti: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/), [WebSocket e coordinamento fra connessioni](https://developers.cloudflare.com/workers/examples/websockets/).

## API delle stanze

Tutte le richieste richiedono un'origine presente in `ALLOWED_ORIGINS`, senza wildcard. Le richieste JSON usano `Content-Type: application/json`. Dopo creazione o ingresso, il token personale viene inviato con `Authorization: Bearer …`, anche per leggere la stanza. Il browser conserva il token soltanto in memoria; il database conserva soltanto il relativo hash.

| Richiesta | Operazione |
| --- | --- |
| `POST /online/rooms` | Crea una stanza privata. |
| `POST /online/match` | Aggancia atomicamente una stanza pubblica compatibile o attende un avversario. |
| `POST /online/rooms/:code/join` | Entra in una stanza con un solo posto libero. |
| `GET /online/rooms/:code?after=N` | Legge la stanza e i messaggi dell'avversario successivi a `N`. |
| `POST /online/rooms/:code` | Esegue `update`, `signal`, `heartbeat` oppure `leave`. |

Il profilo iniziale contiene `name`, `fighter`, `mode` (`versus` o `training`) e `protocol: 1`. Le risposte di creazione e ingresso contengono `code`, `token`, `role`, `room`, `iceServers` ed `expiresAt`. L'host occupa lo slot `0`, l'ospite lo slot `1`. La stanza espone `status`, `revision` e `players`; gli stati sono `waiting`, `paired` e `closed`. I messaggi contengono `seq`, `from`, `type` e `payload`. Gli errori restituiscono `{ error, code }` senza dettagli interni.

Il signaling accetta SDP `offer` dall'host e `answer` dall'ospite, candidati ICE e piccoli messaggi di controllo. Payload, frequenza e numero di messaggi sono limitati. Non esiste una lista pubblica delle stanze. Il matchmaking e l'assegnazione del secondo posto sono atomici: due richieste simultanee non possono assegnare un terzo partecipante o associare lo stesso giocatore a due incontri.

I partecipanti inviano heartbeat ogni cinque secondi; una presenza non aggiornata da oltre sessanta secondi rende inutilizzabile la stanza. La scadenza registrata è di trenta minuti, rinnovata dagli heartbeat. L'uscita di un partecipante chiude la stanza. La pulizia rimuove anche i messaggi associati e non modifica i risultati Arcade.

## Verifiche automatiche

Dal repository del gioco, con Node.js compatibile con `node:sqlite`:

```sh
node --test tests/*.test.cjs
node --test server/sites/tests/online.test.mjs server/sites/tests/service.test.mjs
```

I test del backend applicano le vere migrazioni a un database SQLite temporaneo. Verificano concorrenza del matchmaking, terzo ingresso, autenticazione, isolamento dei messaggi, ordine dei cursori, CORS, scadenze, limiti, pulizia e conservazione della classifica. La verifica del servizio pubblicato usa partecipanti chiamati `QA Online …` e chiude sempre le stanze al termine; i token restano in memoria e non vengono stampati.

## Anteprima locale

Usare il checkout operativo del servizio con le dipendenze dello starter Sites installate. Creare o aggiornare soltanto il file locale ignorato `.dev.vars` con:

```dotenv
ALLOWED_ORIGINS="http://127.0.0.1:8765,http://localhost:8765"
```

Generare il Worker locale con `npm run build`. Il database dell'anteprima è separato da quello pubblicato. Applicare ciascuna migrazione ancora mancante, nell'ordine `0000`, `0001`, `0002`, usando il percorso reale del file:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_plain_harrier.sql
npm run dev -- --port 8789 --hostname 127.0.0.1
```

Non ripetere migrazioni già applicate. Servire il gioco sulla porta `8765` e aprire `http://127.0.0.1:8765/Gioca.html?onlinePreview=1`; soltanto su `localhost` o `127.0.0.1` questa opzione seleziona il servizio locale sulla porta `8789`. Aprire due schede per provare i due ruoli. Per una verifica completa della connessione reale servono anche dispositivi su reti differenti: due schede sulla stessa macchina non verificano l'attraversamento delle reti mobili.

Le nuove tabelle sono dichiarate nella migrazione strutturale `0002_plain_harrier.sql`. Le migrazioni già pubblicate e i relativi metadati non vanno riscritti; ogni cambiamento successivo richiede una nuova migrazione.
