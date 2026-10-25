# Servizio della classifica Arcade

Questo servizio riceve i risultati anonimi dal browser e li archivia nelle Issues GitHub del gioco. Il giocatore usa solo il nome scelto. Nessuna credenziale GitHub arriva al browser e nessun progresso della partita viene salvato.

**Il servizio non è ancora pubblicato.** Il pacchetto contiene il server eseguibile e i test; occorre collegare un hosting HTTPS e configurare la credenziale. GitHub Pages e il componente HTML di Flazio non eseguono processi Node.

## Requisiti e avvio

Node.js 22 o successivo, senza pacchetti aggiuntivi. Conservare `server/leaderboard-server.cjs` insieme a `scripts/leaderboard.js`, usato per validare i record. Servono un endpoint HTTPS e una cartella scrivibile persistente per l’indice dei record.

Configurare nell’ambiente del servizio:

| Variabile | Valore |
| --- | --- |
| `GITHUB_TOKEN` | Token fine-grained dell’account che archivia i risultati, limitato al solo repository con **Issues: read and write**. Nessun permesso Contents richiesto. |
| `ALLOWED_ORIGINS` | Origini del gioco separate da virgola; per il gioco GitHub Pages: `https://andreavullo.github.io`. Conta l’origine dell’iframe, non quella della pagina Flazio esterna. |
| `LEADERBOARD_STORE` | Percorso assoluto su disco persistente, per esempio `/var/lib/dojo/records-index.json`. Il processo deve poter creare e aggiornare il file. |
| `HOST` | `127.0.0.1` dietro un reverse proxy sullo stesso server; `0.0.0.0` solo se richiesto dalla rete privata dell’hosting. |
| `PORT` | Porta assegnata dall’hosting; valore predefinito `8787`. |
| `TRUST_PROXY` | Lasciare `0`. Usare `1` soltanto con un reverse proxy fidato che **sostituisce** `X-Forwarded-For`, impedendo al client di fornirlo. |

Il repository predefinito è `andreaVullo/kyokushin-spirit-bodyplanet`. `GITHUB_OWNER` e `GITHUB_REPOSITORY_NAME` sono facoltative per un altro archivio, che deve essere configurato anche nel client.

Il token va inserito nel gestore dei segreti dell’hosting o in `server/.env`, escluso da Git. Non scriverlo in un file pubblico, nel codice Flazio, nei log o in una richiesta del browser. `.env.example` contiene solo i nomi delle variabili.

Avvio con variabili configurate dall’hosting:

```sh
node server/leaderboard-server.cjs
```

Per una configurazione locale in `server/.env`:

```sh
node --env-file=server/.env server/leaderboard-server.cjs
```

Esporre il processo dietro HTTPS e mantenere persistente il percorso dell’indice. L’indice contiene identificativo, numero della Issue e impronta del risultato; non contiene il token né dati per riprendere partite. Il percorso predefinito è `server/data/records-index.json`, escluso da Git, se la variabile non è impostata.

## Collegare il gioco

1. Verificare `GET /health`: risponde con `{"ready":true}` quando token, origini e indice sono inizializzati. Questo controllo non crea Issues e non prova la validità del token su GitHub.
2. Inserire l’URL HTTPS di `POST /records` in `scripts/leaderboard-config.js`; caricare questo file prima di `scripts/leaderboard.js`.
3. Pubblicare il gioco aggiornato. Il pulsante **Salva in classifica** invia il record soltanto dopo la scelta del giocatore.

Non è stato inserito un endpoint dimostrativo attivo. Con URL vuoto il gioco dichiara che il servizio non è collegato. L’URL HTTP è accettato dal client solo per localhost, utile per lo sviluppo; in produzione serve HTTPS.

## Richieste e limiti

`POST /records` riceve un oggetto JSON di massimo **4096 byte**. Schema, nome, grado, punteggio e fine della sfida vengono ricontrollati sul server. La risposta confermata è:

```json
{"id":"identificativo-della-sfida","issueNumber":1,"url":"https://github.com/andreaVullo/kyokushin-spirit-bodyplanet/issues/1","duplicate":false}
```

Il numero è soltanto un esempio del formato, non un record creato. Una richiesta ripetuta con lo stesso risultato restituisce `duplicate:true`; lo stesso id con dati cambiati viene rifiutato. Richieste contemporanee per lo stesso id condividono un solo invio GitHub. L’indice persiste fino a 20.000 identificativi; in sua assenza il servizio cerca il record anche nelle ultime 500 Issues.

Sono consentiti al massimo **5 tentativi ogni 10 minuti per indirizzo** e **30 al minuto in totale** per processo. Questi limiti sono in memoria: per più repliche o volumi elevati occorre un limitatore condiviso. Senza `TRUST_PROXY`, il servizio usa l’indirizzo della connessione; dietro un proxy tutti i visitatori possono quindi condividere lo stesso limite. Configurare il proxy prima di aprire il servizio al pubblico.

Sono ammesse solo le origini configurate, tramite CORS con elenco esplicito, senza cookie o credenziali del browser. CORS riduce gli usi da altre pagine, ma non autentica un client: il nome è libero e i punteggi sono dichiarati dal browser. I limiti prevengono abusi comuni, non costituiscono un sistema anti-cheat.

Gli errori espongono soltanto codici: `invalid-record`, `origin`, `rate-limit`, `conflict`, `not-configured` o `upstream`. La risposta GitHub e il token non vengono restituiti al client. Non sono previsti invii automatici in caso di errore; il giocatore può riprovare la stessa sfida senza farla contare due volte.

## Verifica

```sh
node --test tests/leaderboard.test.cjs tests/leaderboard-server.test.cjs
```

I test simulano GitHub: nessun record viene pubblicato e non serve un token. Coprono invio anonimo, schema, dimensioni, origini, rate limit, richieste simultanee, riavvio con indice, recovery dall’archivio ed errori senza segreti.

La pubblicazione effettiva si verifica con un risultato reale scelto dal giocatore, dopo aver collegato il servizio. Non creare record di test nella classifica pubblica.
