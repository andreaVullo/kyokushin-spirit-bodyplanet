# Kyokushin Spirit — BodyPlanet Dojo

Picchiaduro 2D arcade per browser, ambientato nel dojo Fitness & Wellness BodyPlanet di Catania. Nove karateka (dieci scelte, con due versioni di Marco Tabacco), un creatore di personaggi per la scalata Arcade dalla cintura bianca al 10° Dan, combinazioni di pugni e calci, guardia, salti, scatti e kaiten. Nessuna installazione o dipendenza esterna necessaria per giocare; la classifica pubblica richiede una connessione Internet.

## Gioca subito

Fai doppio clic su **`Gioca.html`**. Funziona offline, senza installazioni e senza server. Mantieni accanto al file le cartelle **`scripts/`** e **`assets/`**: contengono il roster ampliato e le animazioni. Per trasferire il gioco copia tutta la cartella, non soltanto il file HTML.

All’apertura compare **Caricamento del dojo…**: il titolo e i comandi diventano disponibili solo quando grafica e gioco sono pronti. Se l’attesa si prolunga, puoi continuare ad attendere oppure premere **Riprova**. La barra animata indica l’attesa, senza percentuali stimate.

1. Nella schermata del titolo premi **Invio** oppure il pulsante di avvio.
2. Scegli modalità e difficoltà; seleziona il tuo karateka con **← / →** oppure cliccando sul ritratto. Premi **↑ / ↓** o **Avversario** per scegliere anche CPU, secondo giocatore o partner di allenamento.
3. Premi **Invio** o **Combatti**: dopo la presentazione **VS**, inizia il kumite.

Per la nuova scalata premi **Arcade** dal titolo o dalla scelta della modalità: scegli nome, uomo o donna e una delle cinque capigliature, quindi **Entra nel tatami**. **Classifica**, sul titolo, apre il muro dei risultati pubblici del dojo.

Nella selezione, **Esc** o la freccia **Titolo** riportano alla schermata iniziale. Durante il combattimento, **Esc** apre la pausa. Nelle modalità classiche puoi riprendere, ricominciare o tornare alla scelta del personaggio; al termine dell’incontro, **Rivincita** permette di rigiocare. In Arcade puoi riprendere o terminare la scalata: non si ricomincia lo stesso incontro per conservare l’avanzamento. L’audio si attiva dopo un clic, un tasto o un tocco completo dentro il gioco. Il pulsante **Audio** in alto permette di silenziarlo, riattivarlo o ritentarne l’avvio dopo un’interruzione.

**`index.html`** reindirizza a `Gioca.html`, conservando i parametri per incorporamento e touch. La cartella può essere pubblicata su GitHub Pages senza compilazione. Le immagini vengono caricate dal sito stesso e funzionano anche offline.

Per eseguire il gioco con un server locale, dalla cartella del progetto:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Poi apri [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Nuovi karateka

Oltre ad Angelo Pierino e Samuel Villani sono disponibili Marco Tabacco, Gabriele Carbonaro, Leonardo Cappellani, Gabriele Randazzo, Matteo Spata, Oscar Gueli e Andrea Vullo. Marco Tabacco ha due versioni selezionabili, **collage** e **foto di gruppo**. I colori e le strisce delle cinture seguono i riferimenti forniti.

Tutti possono combattere su entrambi i lati nelle modalità VS CPU, 2 giocatori e Allenamento, anche contro lo stesso personaggio. Entrano inoltre nel gruppo degli avversari della scalata Arcade, dove il giocatore usa il karateka creato. Ogni nuovo riferimento include pugni, calci, kaiten, passi, scatto, salto, parate, reazioni, caduta, KO, ripresa e vittoria. Il volto aggiornato di Gabriele Carbonaro è usato in tutte le sue sequenze.

I 40 PNG sono conservati senza ricompressione dentro piccoli file JavaScript separati in `assets/karateka/`: questo permette di ritagliare correttamente le sagome anche aprendo il gioco da disco. Si caricano inizialmente solo i ritratti; le altre mosse si caricano per i due combattenti scelti, prima della presentazione VS. In caso di errore si può premere **Riprova**. Le animazioni degli incontri precedenti vengono liberate dalla memoria.

`scripts/karateka-atlas.js` contiene i rettangoli reali, gli appoggi e le scale. Tre fogli difesa hanno due pose che si toccano: per il ritorno in guardia e la vittoria vengono usate pose integre dello stesso personaggio. Le immagini restano inalterate e il renderer esclude i frammenti dei fotogrammi vicini. Il contatto dei nove attacchi coincide con le finestre del motore; danni e regole restano quelli originali.

Verifica automatica del motore e del renderer:

```sh
node --test tests/*.test.cjs
```

La pagina `tests/render-preview.html`, con server locale, carica tutti i 40 fogli e mostra 144 pose nelle due direzioni per il controllo visivo. `assets/karateka/checksums.json` documenta l’impronta SHA-256 dei PNG sorgenti. Per misurare nuovamente i PNG, usa `python3 tools/measure-karateka.py CARTELLA_SPRITE coordinate.json` (richiede Pillow e NumPy); poi `python3 tools/import-karateka.py CARTELLA_SPRITE coordinate.json` rigenera gli involucri senza alterare le immagini.

## Comandi

### Telefono e tablet

I comandi touch compaiono automaticamente sui dispositivi touch. Il pulsante del controller nella barra dell’arena permette di mostrarli o nasconderli anche sul computer. La tastiera resta attiva: è possibile usarla insieme al touch.

- **Pollice sinistro:** trascina il joystick per muoverti e spingilo verso l’alto per saltare. Due spinte rapide nella stessa direzione, tornando al centro tra i due movimenti, eseguono il dash.
- **Pollice destro:** quattro pulsanti circolari mostrano solo icone delle tecniche. Il singolo tasto **↻** passa ciclicamente fra tre gruppi: pugni → calci → speciale/difese → pugni. I tre puntini indicano il gruppo attivo. **Ushiro** si trova nel secondo e nel terzo gruppo; tieni premuta l’icona delle braccia o del ginocchio nel terzo gruppo per parare.
- Si possono tenere premuti più comandi contemporaneamente, per esempio movimento e attacco. È possibile scorrere il dito tra i pulsanti per collegare le tecniche.
- **Su mobile si gioca in orizzontale.** Con il launcher Flazio V7, **Entra nel dojo** adatta subito la stessa partita allo spazio visibile. Il telefono può restare verticale con il blocco rotazione attivo. Quando il browser diventa orizzontale, il gioco rimuove la rotazione aggiunta: non occorre cambiare le impostazioni del dispositivo.
- **Aprendo `Gioca.html` direttamente o in un iframe generico**, premi **Gioca in orizzontale** o **Schermo intero** per adattare il gioco anche con la rotazione bloccata. Il fullscreen nativo è facoltativo: se il browser lo rifiuta, resta disponibile la vista adattata. In un iframe generico lo spazio resta quello concesso dalla pagina ospitante; il launcher Flazio gestisce invece l’intera area visibile del sito. Le barre del browser possono restare visibili.
- Pausa, cambio app, cambio orientamento e rilascio/interruzione del tocco azzerano i comandi: nessuna direzione rimane bloccata.
- **Arcade**, **VS CPU** e **Allenamento** sono giocabili interamente su touch. La modalità **2 giocatori** richiede una tastiera per il secondo giocatore.

Per attivare musica ed effetti, tocca e rilascia un comando dentro il gioco. Il pulsante **♪** nella barra dell’arena controlla entrambi: se l’audio è stato interrotto dal browser, premilo per ritentarne l’attivazione.

| Banco touch | Quattro tecniche |
| --- | --- |
| PUGNI | Tsuki · Shita · Kagi · Mae |
| CALCI | Mae · Mawashi · Gedan · Ushiro |
| SPECIALI | Kaiten · Braccia · Ginocchio · Ushiro |

### Tastiera

| Azione | Giocatore 1 | Giocatore 2 |
| --- | --- | --- |
| Movimento | A / D | ← / → |
| Scatto nella direzione scelta | A A / D D, due pressioni rapide | ← ← / → →, due pressioni rapide |
| Salto | W | ↑ |
| Guardia con le braccia | Spazio oppure direzione opposta all’avversario | Shift oppure freccia opposta all’avversario |
| Parata dei calci con il ginocchio | F | 0, anche sul tastierino numerico |
| Tsuki, pugno al corpo | J | 1 |
| Shita tsuki, montante al corpo | H | 7 |
| Kagi tsuki, gancio al corpo | N | 8 |
| Mae geri, calcio frontale | K | 2 |
| Mawashi geri, calcio circolare alto | L | 3 |
| Ushiro geri, calcio all’indietro | U | 4 |
| Gedan mawashi geri, calcio basso | I | 5 |
| Kaiten, calcio con capovolgimento | O | 6 |
| Pausa | Esc | Esc |

**Scegli la guardia in base al colpo.** La guardia con le braccia protegge corpo e testa, ma lascia passare i calci bassi. Si attiva anche arretrando: **A** se l’avversario è a destra, **D** se è a sinistra; il giocatore 2 usa la freccia corrispondente. Tieni **F** per sollevare il ginocchio e parare tutti i calci in arrivo da davanti (gedan, mae, mawashi, ushiro e kaiten), a ogni altezza. I pugni superano questa guardia. Il giocatore 2 usa **0**. L’abbassamento è stato rimosso: **S** e **↓** non eseguono azioni, nemmeno in combinazione con la guardia.

**Entra ed esci dalla distanza.** Premi due volte la stessa direzione entro un quarto di secondo per uno scatto in avanti o all’indietro, in base alla posizione dell’avversario. Rilascia il tasto tra le due pressioni. Da vicino il dash attraversa l’avversario e permette di passare alle sue spalle. Durante lo scatto resti vulnerabile: la guardia si interrompe e un colpo avversario ferma lo spostamento. Puoi inserire un attacco durante lo scatto per farlo partire appena il movimento si conclude. Su touch, esegui due spinte rapide del joystick nella stessa direzione, tornando al centro tra le due.

**Collega le tecniche.** Premi nuovamente **J** dopo il primo pugno per il **gyaku tsuki**. Puoi anticipare fino a tre attacchi successivi mentre il colpo in corso si conclude. Prova queste combinazioni a distanza ravvicinata, verificate nel motore:

- **J → H → N → U:** diretto, montante, gancio e ushiro geri.
- **J → J → H → N → L → O:** sei colpi con mawashi e kaiten finale.
- **H → N → K → U:** montante, gancio, mae geri e ushiro geri.

Il **kaiten costa 45 punti Spirit**: la barra parte da 45, aumenta colpendo e si rigenera gradualmente. Mantieni la distanza e aggiungi i comandi durante la sequenza: la coda contiene al massimo tre attacchi futuri. Sono disponibili anche pulsanti touch.

I pugni usano nuove sequenze illustrate a corpo intero per ciascun karateka: preparazione, estensione, contatto e ritorno. Queste sostituiscono l’animazione che ritagliava e ruotava singole parti delle braccia. Il gyaku mantiene il pugno posteriore: il fotogramma intermedio che cambiava braccio è escluso dalla sequenza. Anche gedan, mae, mawashi e ushiro hanno fasi distinte di caricamento del ginocchio, contatto e richiamo, senza schiacciare orizzontalmente il corpo. I fotogrammi di contatto seguono le finestre dei colpi nel motore.

Il kaiten ha nuove fasi illustrate di preparazione, rotazione, calcio e atterraggio; la camminata alterna appoggi reali, anche arretrando in guardia. Nella guida **Come si gioca** trovi le dimostrazioni animate di passi, scatti e kaiten.

## Modalità e regole

- **Arcade:** crea il tuo karateka e affronta una scalata di venti vittorie, dalla cintura bianca al 10° Dan. Ogni incontro vinto vale una promozione; una sconfitta conclude la sfida.
- **VS CPU:** affronta il computer, con tre difficoltà: Principiante, Karateka e Kyokushin.
- **2 giocatori:** sfida locale sulla stessa tastiera.
- **Allenamento:** prova le tecniche con tempo illimitato e vita che si rigenera.

Nelle sfide vince chi conquista **due round**. Ogni round dura **60 secondi reali**: porta a zero la vita avversaria oppure conserva più vita allo scadere. Il ritmo delle azioni è accelerato del **30%**, mantenendo il conto alla rovescia in tempo reale. Le tecniche e il combattimento sono interpretati in chiave arcade.

### Arcade: il tuo karateka, dalla bianca al 10° Dan

Il creatore permette di scegliere **uomo o donna**, **cinque capigliature per ciascuno** e un nome da 2 a 24 caratteri. Sono ammessi lettere, numeri, spazi, punti, apostrofi e trattini. La scelta estetica non cambia danni o regole del combattimento. L’anteprima parte dalla cintura bianca; la cintura del personaggio cambia con le promozioni.

La partenza è **bianca, senza grado (mukyu)**, prima del 10 Kyu. Questo ordine segue le indicazioni introduttive del [Kyokushinkaikan Honbu Daikanyama Dojo](https://branch.kyokushinkaikan.org/daikanyamadojo/english-information).

| Gradi | Cintura |
| --- | --- |
| 10 Kyu → 9 Kyu | Arancione → arancione con striscia blu |
| 8 Kyu → 7 Kyu | Blu → blu con striscia gialla |
| 6 Kyu → 5 Kyu | Gialla → gialla con striscia verde |
| 4 Kyu → 3 Kyu | Verde → verde con striscia marrone |
| 2 Kyu → 1 Kyu | Marrone → marrone con striscia nera |
| 1 Dan → 10 Dan | Nera, con una tacca dorata per Dan, fino a dieci |

Colori, strisce e tacche seguono la sequenza pubblicata dalla [Kyokushin World Federation](https://kyokushinworldfederation.org/kyokushin/). La promozione a ogni vittoria è una regola del videogioco: rappresenta un percorso Arcade, non un esame o un grado reale.

Dopo una vittoria scegli **Prossima sfida** per continuare oppure **Termina scalata** per chiudere con il risultato raggiunto. Gli avversari sono scelti dal roster del dojo e la difficoltà cresce durante il percorso. I punti premiano vittorie, vita rimasta, rapidità, colpi, parate e combinazioni; il completamento al 10° Dan assegna un bonus finale. Una sconfitta conserva nel risultato l’ultimo grado conquistato. **Nuova scalata** riparte dalla bianca.

**Il progresso non è salvabile.** La sfida vive soltanto nella memoria della pagina: ricaricare, chiudere il gioco o chiudere il pannello Flazio perde l’avanzamento. Il cambio di orientamento mantiene invece la stessa partita aperta. Solo dopo sconfitta, abbandono o completamento si può pubblicare un risultato finale; la classifica non permette di riprendere la sfida.

### Classifica pubblica e archivio GitHub

Dal risultato finale, **Salva in classifica** invia il nome scelto e il risultato al servizio del dojo. **Al giocatore non serve un account:** basta il nome del karateka. Nome e dati del risultato diventano pubblici. Il gioco conferma soltanto dopo la scrittura nel database online; **Verifica in classifica** ne ricontrolla la presenza.

Il risultato è visibile subito nella classifica online. **La copia su GitHub è periodica**, tramite il workflow `sync-arcade-leaderboard.yml`, programmato ogni 15 minuti; GitHub può ritardarne l’esecuzione. Il file pubblico è [data/arcade-leaderboard.json](data/arcade-leaderboard.json). La conferma di salvataggio non dichiara già completata questa copia.

La classifica mostra i primi 50, ordinati per grado, punteggio e durata. Se il servizio non risponde, prova a leggere la copia GitHub e avverte che potrebbe essere meno recente. Un problema di rete non impedisce di giocare. È una classifica amatoriale: i risultati sono calcolati dal browser e controllati nel formato, non certificati contro modifiche del gioco.

Il [servizio pubblico del dojo](https://kyokushin-dojo-classifica.flazio1.chatgpt.site) è attivo su Sites, con database D1. L’endpoint è configurato in `scripts/leaderboard-config.js`; il sorgente completo è in `server/sites/`. Nessun token GitHub serve nel browser o nel servizio: la copia nel repository usa soltanto la credenziale temporanea di GitHub Actions. Dettagli e manutenzione: [CLASSIFICA.md](CLASSIFICA.md) e [server/README.md](server/README.md).

## Musica ed effetti

La colonna sonora cambia tra **titolo, selezione, presentazione VS, combattimento e risultato**. Arrangiamenti originali con basso, melodia pentatonica, accordi, arpeggi e percussioni accompagnano ogni fase. Menu, pugni, calci, parate, kaiten, scatti, passi, salti, atterraggi e vittorie hanno effetti dedicati.

Tutto l’audio è sintetizzato nel browser e funziona offline. Il primo clic, tasto o tocco completo ne richiede l’attivazione; sui dispositivi mobili conta anche il rilascio del dito. In pausa la musica si abbassa; passando a un’altra scheda, l’audio si sospende. Se resta interrotto quando torni, premi **♪** per ritentarne l’avvio. La scelta di silenziare il gioco rimane attiva durante i cambi di schermata.

Su iPhone e iPad, lo stesso gesto avvia anche un elemento audio con un secondo di silenzio generato in memoria: serve ad aprire il canale multimediale nei browser in cui Web Audio resta sul canale della suoneria. Non richiede download o microfono e non duplica la colonna sonora. **ATTIVA AUDIO** resta disponibile finché l’avvio dei due sistemi non riesce; un nuovo tocco ritenta le richieste bloccate. Se il tempo del sintetizzatore si ferma pur risultando attivo, il gioco rileva il blocco e ricrea il contesto al gesto successivo. Silenziamento, cambio scheda e chiusura fermano anche l’elemento ausiliario.

Lo stato **AUDIO ON** conferma l’avvio segnalato dalle API, non il volume o l’effettiva uscita dagli altoparlanti del dispositivo. Le verifiche automatiche coprono rifiuti di riproduzione, richieste pendenti, interruzioni e recupero; non sostituiscono una prova su iPhone fisico.

## Personaggi e scenario

Le associazioni tra nomi, fotografie e gradi seguono le indicazioni dell’utente:

- **Sensei Angelo Pierino — III Dan:** seconda fotografia, testa rasata e barba; cintura nera con tre strisce.
- **Senpai Samuel Villani — 1 Kyu:** prima fotografia, capelli scuri e barba; cintura marrone con una striscia nera.

Lo scenario riprende la palestra fornita come riferimento: tatami rosso, insegna BodyPlanet, palle fitness, attrezzi sospesi e **specchio sulla parete sinistra**. Le illustrazioni originali sono state generate per questo progetto con **ImageGen integrato**; il logo è quello fornito dall’utente. Audio sintetizzato nel browser. Progetto originale ispirato ai picchiaduro arcade, senza affiliazione con Street Fighter o MUGEN.

## File del progetto

| File o cartella | Contenuto |
| --- | --- |
| `Gioca.html` | Pagina di gioco; richiede le cartelle `scripts/` e `assets/` accanto |
| `index.html` | Reindirizzamento a `Gioca.html`, conservando parametri e ancora |
| `scripts/` | Motore, roster, animazioni, controlli, layout e gestione della vista |
| `scripts/arcade.js` / `scripts/arcade-ui.js` | Scalata, promozioni, creazione del karateka e interfaccia dei risultati |
| `scripts/arcade-art.js` / `scripts/arcade-atlas.js` | Animazioni del personaggio personalizzato, capigliature, cinture ed effetti dei colpi |
| `scripts/leaderboard.js` / `scripts/leaderboard-config.js` / `CLASSIFICA.md` | Lettura dei record pubblici GitHub, invio anonimo e configurazione dell’endpoint |
| `server/sites/` / `server/README.md` | Sorgente del servizio Sites/D1 online: invio anonimo e lettura della classifica |
| `.github/workflows/sync-arcade-leaderboard.yml` / `tools/sync-arcade-leaderboard.cjs` / `data/arcade-leaderboard.json` | Copia periodica e validata dei risultati pubblici su GitHub |
| `scripts/flazio-launcher.js` | Launcher Flazio V7; la stessa sorgente è incorporata nei due frammenti da incollare |
| `assets/karateka/` | Tutti i fogli dei nuovi karateka, caricati dal gioco quando servono |
| `assets/arcade/` | Fogli uomo/donna, teste, pose aggiuntive ed effetti visivi, con involucri JavaScript per l’uso offline |
| `tests/flazio-host.html` | Pagina locale di prova con un contenitore adaptive largo 1200 px e trasformato |
| `tests/flazio-component-host.html` | Prova del componente HTML annidato in un piccolo iframe Flazio; `?nonative=1` verifica il fallback senza fullscreen nativo |
| `tests/flazio-launcher.test.cjs` | Rotazione del contenitore, iframe persistente, fullscreen, messaggi, caricamento e ripristino del sito |
| `tests/display-controller.test.cjs` / `tests/orientation-regression.test.cjs` / `tests/rotated-controls.test.cjs` | Gestione della vista, formati verticali/orizzontali e comandi dopo la rotazione |
| `tests/roster-game.test.cjs` / `tests/karateka-renderer.test.cjs` | Roster e animazioni dei karateka |
| `tests/arcade.test.cjs` / `tests/arcade-ui.test.cjs` / `tests/leaderboard*.test.cjs` / `server/sites/tests/` | Progressione, interfaccia, classifica anonima, archivio GitHub e database SQLite |
| `tests/render-preview.html` | Anteprima delle pose del roster nelle due direzioni |
| `Incorpora.html` | Generatore dell’iframe generico con anteprima e copia del codice |
| `INCORPORA.txt` | Istruzioni di pubblicazione e di inserimento nel sito |
| `flazio-componente-gioca.html` | Card Gioca originale del sito con il launcher V7 caricato da GitHub Pages |
| `iframe-flazio-html.html` | Frammento HTML completo da incollare nella modalità HTML di Flazio |
| `iframe-flazio.html` | Solo JavaScript da incollare nella modalità Script di Flazio, senza aggiungere tag HTML |

Per verificare il progetto esegui `node --test tests/*.test.cjs`. Questa cartella è il pacchetto da pubblicare: conserva i percorsi relativi di `scripts/` e `assets/`. Non distribuire `Gioca.html` da solo.

## Inserire il gioco in un sito web

La pagina del dojo è [Gioca del dojo](https://kyokushinkaicataniadojo.it/play). L’indirizzo del gioco usato dai frammenti è [GitHub Pages](https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html?embed=1&hostdisplay=1), nel repository [kyokushin-spirit-bodyplanet](https://github.com/andreaVullo/kyokushin-spirit-bodyplanet). Le modifiche locali diventano disponibili sul sito soltanto dopo avere pubblicato il pacchetto aggiornato e sostituito il frammento Flazio.

### Pubblicare l’aggiornamento completo

1. Aggiorna **`Gioca.html` e le cartelle intere `scripts/` e `assets/`** sullo stesso hosting HTTPS, mantenendo nomi e percorsi. Servono anche per i nuovi karateka, la modalità Arcade, le capigliature, le cinture e gli effetti dei colpi. Conserva `index.html` come reindirizzamento al gioco.
2. Apri il collegamento pubblico a `Gioca.html` e controlla caricamento, selezione dei karateka, creazione Arcade e avvio dell’incontro. Controlla la lettura della classifica online senza inviare risultati di prova come record reali. `localhost` e `127.0.0.1` funzionano soltanto sul computer di sviluppo.
3. Su Flazio sostituisci il precedente frammento con **una sola** delle due varianti V7 qui sotto, nella modalità corrispondente. Non tenere attivo anche il vecchio launcher.
4. Per la pubblicazione dei punteggi senza account, ospita il servizio descritto in **`server/README.md`**, configura il token solo sul server e inserisci l’URL HTTPS pubblico in **`scripts/leaderboard-config.js`**. Pubblicare soltanto il gioco su GitHub Pages non attiva il servizio di scrittura.

### Flazio adaptive — launcher V7

La versione è **`onsite-dialog-v7`**. I due frammenti generici contengono tutto il codice del launcher. **`flazio-componente-gioca.html`** conserva invece la card Gioca del sito e carica il launcher da GitHub Pages: va incollato nella modalità HTML dopo avere pubblicato i file aggiornati.

- **Modalità HTML, consigliata:** apri il componente Codice/Script di Flazio, seleziona **HTML** e incolla l’intero contenuto di **`iframe-flazio-html.html`**, compresi pulsante e tag `<script>`.
- **Modalità Script:** seleziona **Script** e incolla l’intero contenuto di **`iframe-flazio.html`**. Il file contiene **solo JavaScript**, nonostante l’estensione `.html`: non aggiungere tag `<script>`, `<iframe>` o un documento HTML.

**Entra nel dojo** apre il gioco sopra la pagina `/play` e richiede subito la vista orizzontale. Non occorre sbloccare la rotazione del telefono. Il launcher misura l’area visibile disponibile dopo avere riservato spazio ai comandi e alle aree sicure: se questa area è verticale, ruota soltanto l’iframe di 90° e ne scambia le dimensioni; quando diventa orizzontale, rimuove la trasformazione. Anche nei formati quasi quadrati la decisione segue lo spazio realmente utilizzabile. La decisione non dipende dall’orientamento hardware dichiarato dal dispositivo. Il gioco interno riceve la conferma del contenitore ed evita di ruotare di nuovo la propria interfaccia.

Se Flazio esegue il componente HTML in un iframe dello stesso dominio, il launcher apre il pannello nella pagina principale. La partita resta fuori dal componente adaptive e continua quando Flazio ricrea i propri elementi. Per tutta la sessione il launcher mantiene `width=device-width, initial-scale=1, viewport-fit=cover` e neutralizza zoom e trasformazioni della pagina, anche se il sito li riscrive durante una rotazione. Considera le aree sicure del telefono e mantiene **Chiudi** accessibile. Le dimensioni obsolete della viewport visiva vengono scartate; posizione e spazio visibile seguono barre del browser e tastiera senza uscire dai bordi.

Il fullscreen nativo viene richiesto quando disponibile, ma un rifiuto non impedisce la vista orizzontale. Il launcher non forza il blocco dell’orientamento di sistema. Le barre del browser possono restare visibili. Il pulsante della vista e quello interno al gioco permettono di uscire dall’adattamento e riattivarlo.

Durante l’avvio compare **Caricamento del dojo…**; il gioco diventa interattivo dopo la conferma di avvio. Dopo 25 secondi compare **Riprova**. Non ci sono ricaricamenti automatici: un nuovo tentativo sostituisce solo il precedente iframe e i suoi eventuali messaggi tardivi vengono ignorati.

**Chiudi ×** termina partita e audio e ripristina viewport, stili e zoom più recenti della pagina adaptive, insieme alla posizione di scorrimento. Una nuova apertura riparte dal titolo. I messaggi tra gioco e launcher vengono controllati sia per origine sia per finestra mittente; gli identificativi delle richieste evitano che conferme obsolete prevalgano su comandi successivi.

Per provare il contenitore senza pubblicare, avvia il server locale e apri **`tests/flazio-host.html`** oppure **`tests/flazio-component-host.html`**. La seconda pagina riproduce un componente HTML di 320 × 180 pixel dentro una pagina adaptive. Aggiungi **`?nonative=1`** a uno dei due indirizzi per simulare un browser senza fullscreen nativo e verificare l’adattamento CSS. Il pulsante **Ricalcola adaptive fra 3 secondi** permette di avviare il gioco prima che la pagina riscriva zoom, trasformazione e viewport. Le prove automatiche e nel browser non sostituiscono una verifica su un telefono fisico.

### Iframe generico

Apri **`Incorpora.html`** per inserire l’indirizzo pubblico del gioco, provarlo e copiare un iframe responsive. Le istruzioni essenziali sono anche in **`INCORPORA.txt`**. Su Flazio adaptive usa i frammenti V7: il codice generico non controlla zoom, viewport o ricostruzione della pagina ospitante.

`embed=1` attiva la vista compatta con audio, aiuto, pausa e schermo intero; `touch=1` mostra esplicitamente i comandi touch anche sul computer. `standalone=1`, in una pagina principale, aggiunge il collegamento **Torna al sito**. Riserva `hostdisplay=1` al launcher previsto dal progetto.

Il comando **Schermo intero** può adattare il gioco in orizzontale senza obbligare a sbloccare la rotazione. Se il browser nega il fullscreen, un iframe generico conserva lo spazio assegnato dal sito: per gestire tutto lo schermo di una pagina Flazio serve il launcher V7. L’hosting deve permettere gli iframe; l’audio richiede comunque un gesto dell’utente.

Per ogni aggiornamento distribuisci nuovamente il pacchetto completo, comprese `scripts/` e `assets/`. Se cambia `scripts/flazio-launcher.js`, aggiorna anche le copie incorporate in entrambi i frammenti e sostituisci quello incollato su Flazio.

## Fonti

- [Kyokushinkai Catania Dojo — sito ufficiale](https://www.kyokushinkaicataniadojo.it/): sede presso Fitness & Wellness BodyPlanet, Via Antonio Merlino 33/D, Catania. Il sito consultato dal vivo indica Sensei Angelo Pierino, WKB III Dan; alcuni risultati indicizzati conservano il precedente II Dan.
- [Kyokushinkai Catania Dojo — Instagram](https://www.instagram.com/kyokushinkaicataniadojo/): profilo pubblico del dojo e collegamento alla palestra.
- [Fitness & Wellness BodyPlanet — Instagram](https://www.instagram.com/fitnesswellness_bodyplanet/): nome della palestra e indirizzo.
- [IFK Norge — syllabus Kyokushin](https://www.ifknorge.org/wp-content/uploads/2024/03/syllabus_hoyopp.pdf): terminologia di pugni, calci e combinazioni, incluso dō mawashi kaiten geri.
- [International Kyokushinkai Karate — syllabus tecnico](https://www.ikkf.ws/technical-sylabus.html): riscontro dei nomi delle tecniche.

Ricerca effettuata il **3 ottobre 2026**. Il grado di Samuel e l’ordine dei riferimenti fotografici provengono dalle indicazioni dell’utente.

