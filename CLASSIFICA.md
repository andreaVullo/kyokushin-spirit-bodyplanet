# Classifica Arcade: solo nome, senza account

Il giocatore sceglie il nome del karateka e può pubblicare il risultato finale senza avere un account GitHub. Un piccolo servizio del dojo riceve il record e lo conserva nelle Issues pubbliche di `andreaVullo/kyokushin-spirit-bodyplanet`. La credenziale GitHub è esclusivamente sul server.

**Stato della configurazione:** il codice è pronto, ma il servizio di invio non è ancora pubblicato. L’endpoint in `scripts/leaderboard-config.js` è vuoto. Finché non viene collegato un servizio HTTPS, il gioco segnala che la pubblicazione non è attiva e non dichiara salvato un risultato. La lettura dei record pubblici GitHub è indipendente dal servizio e funziona online; il repository ha già le Issues abilitate.

## Pubblicare un risultato

1. Concludi la sfida Arcade: sconfitta, abbandono o raggiungimento del 10° Dan.
2. Premi **Salva in classifica**. Nome, aspetto del personaggio, grado, punti, vittorie e durata vengono inviati al servizio del dojo.
3. La conferma compare dopo che il servizio ha archiviato il record su GitHub. **Verifica in classifica** permette di ricontrollarne la presenza.

Nome e risultato sono pubblici. La pubblicazione è facoltativa; la partita funziona anche offline. Non vengono richiesti account, email o password al giocatore. La Issue GitHub è creata dall’account del servizio: quell’account non identifica il giocatore.

## Risultati e avanzamento

La partita in corso rimane soltanto in memoria. Non viene scritta in localStorage, sessionStorage, IndexedDB o in un file su GitHub. Chiudere o ricaricare il gioco perde la sfida. I record pubblicati non contengono le informazioni necessarie a ripristinare un incontro e non sono importabili come salvataggi.

La classifica ordina prima per grado raggiunto, poi per punti, vittorie e durata minore. Il passaggio completo è bianca → 10 Kyu fino a 1 Kyu → 1 Dan fino a 10 Dan. La pagina mostra al massimo 50 risultati. Lo stesso identificativo di sfida viene contato una sola volta; i nomi non sono riservati e possono essere usati da più persone.

È una classifica amatoriale: il browser calcola i risultati. Formato e limiti numerici vengono controllati anche dal server, ma non certificano che la partita sia stata giocata senza modifiche. Un sistema anti-cheat richiederebbe verifica o simulazione degli incontri lato server.

## Gestione del repository

- Il titolo di un record inizia con `[ARCADE RECORD]`; il corpo contiene il blocco dati contrassegnato `kyokushin-arcade-record-v1`.
- Le altre Issues e le pull request non entrano in classifica. Anche i record non validi vengono ignorati.
- Chiudere una Issue conserva il risultato. Per escluderlo, il proprietario può aggiungere l'etichetta `arcade-rejected` oppure eliminarlo usando gli strumenti GitHub.
- La lettura considera al massimo le 500 Issues più recenti, aperte o chiuse. Se il limite viene raggiunto, `DojoLeaderboard.details().partial` lo segnala all'interfaccia. Con volumi maggiori occorre un archivio indicizzato sul server, prima di presentare la classifica come completa.
- La risposta viene tenuta in memoria per 60 secondi; **Aggiorna** forza una nuova lettura. Errori di rete o limiti API non inventano risultati e non interrompono il gioco.
- Il server conserva un indice degli identificativi già pubblicati, per evitare duplicazioni anche dopo un riavvio. Contiene solo riferimenti ai risultati, nessun avanzamento ripristinabile.

## Attivazione

Seguire [server/README.md](server/README.md). Servono un hosting Node con HTTPS, una cartella persistente per l’indice e un token GitHub limitato al repository del gioco con permesso **Issues: read and write**. Il token deve stare nell’ambiente del server. GitHub Pages può ospitare il gioco ma non questo servizio.

Configurare soltanto l’URL pubblico in `scripts/leaderboard-config.js`, caricato prima di `scripts/leaderboard.js`. Non inserire token nel file, nel codice Flazio o nel repository.

```js
window.KYOKUSHIN_LEADERBOARD_ENDPOINT = 'https://servizio-del-dojo.example/records';
```

## API locale

Caricare configurazione e `scripts/leaderboard.js` prima dell’interfaccia del gioco:

```js
const rows = await DojoLeaderboard.load({ force: true }); // massimo 50 risultati
const metadata = DojoLeaderboard.details();             // partial, source, fetchedAt
const result = await DojoLeaderboard.submit(run.finalRecord());
// result: { id, issueNumber, url, duplicate }
```

`submit` va chiamato solo alla pressione di **Salva in classifica**. Restituisce conferma solo dopo la risposta del servizio; senza endpoint restituisce l’errore `not-configured`. Per verificare successivamente, cercare l’id in `metadata.entries` dopo un aggiornamento riuscito, anche se il record è fuori dai primi 50 visibili. Inserire i nomi nell’interfaccia tramite `textContent`.

Le prove sono in `tests/leaderboard.test.cjs` e `tests/leaderboard-server.test.cjs`: schema, progressione, Unicode, autori e dati estranei, deduplicazione, paginazione, timeout, invio anonimo, CORS, limiti di payload/richieste, indice persistente ed errori senza segreti. I test usano risposte GitHub simulate e non pubblicano record di prova.

Riferimenti: [API Issues GitHub](https://docs.github.com/en/rest/issues/issues), [limiti delle richieste pubbliche](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
