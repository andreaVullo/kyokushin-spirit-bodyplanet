# Kyokushin Spirit — BodyPlanet Dojo

Picchiaduro 2D arcade per browser, ambientato nel dojo Fitness & Wellness BodyPlanet di Catania. Due karateka, combinazioni di pugni e calci, guardia, salti, scatti e kaiten, con musica ed effetti originali. Nessuna installazione o dipendenza esterna necessaria per giocare.

## Gioca subito

Fai doppio clic su **`Gioca.html`**. È la versione completa in un solo file: funziona offline, senza installazioni e senza server. Puoi copiarla altrove da sola; include anche immagini, logo e audio.

All’apertura compare **Caricamento del dojo…**: il titolo e i comandi diventano disponibili solo quando grafica e gioco sono pronti. Se l’attesa si prolunga, puoi continuare ad attendere oppure premere **Riprova**. La barra animata indica l’attesa, senza percentuali stimate.

1. Nella schermata del titolo premi **Invio** oppure il pulsante di avvio.
2. Scegli modalità e difficoltà; seleziona Angelo o Samuel con **← / →** oppure cliccando sul suo ritratto.
3. Premi **Invio** o **Combatti**: dopo la presentazione **VS**, inizia il kumite.

Nella selezione, **Esc** o la freccia **Titolo** riportano alla schermata iniziale. Durante il combattimento, **Esc** apre la pausa: puoi riprendere, ricominciare o tornare alla scelta del personaggio. Al termine dell’incontro, scegli **Rivincita** per rigiocare. L’audio si attiva dopo un clic, un tasto o un tocco completo dentro il gioco. Il pulsante **Audio** in alto permette di silenziarlo, riattivarlo o ritentarne l’avvio dopo un’interruzione.

**`index.html` nella cartella principale** è l’ingresso della versione sorgente modificabile e usa gli altri file del progetto: avvialo con il server locale descritto sotto. **`github-pages/index.html` è invece un piccolo reindirizzamento a `Gioca.html`**: non sostituirlo con l’index dei sorgenti quando aggiorni il repository pubblico.

Su macOS puoi anche fare doppio clic su **`launch.command`**: avvia il gioco all’indirizzo [http://127.0.0.1:8765](http://127.0.0.1:8765) e apre il browser. Richiede Python 3; per fermare il server premi **Ctrl+C** nella finestra del Terminale. Se la porta è occupata, il programma avvisa senza interrompere altri processi.

In alternativa, dalla cartella del progetto:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Poi apri [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Comandi

### Telefono e tablet

I comandi touch compaiono automaticamente sui dispositivi touch. Il pulsante del controller nella barra dell’arena permette di mostrarli o nasconderli anche sul computer. La tastiera resta attiva: è possibile usarla insieme al touch.

- **Pollice sinistro:** trascina il joystick per muoverti e spingilo verso l’alto per saltare. Due spinte rapide nella stessa direzione, tornando al centro tra i due movimenti, eseguono il dash.
- **Pollice destro:** quattro pulsanti circolari mostrano solo icone delle tecniche. Il singolo tasto **↻** passa ciclicamente fra tre gruppi: pugni → calci → speciale/difese → pugni. I tre puntini indicano il gruppo attivo. **Ushiro** si trova nel secondo e nel terzo gruppo; tieni premuta l’icona delle braccia o del ginocchio nel terzo gruppo per parare.
- Si possono tenere premuti più comandi contemporaneamente, per esempio movimento e attacco. È possibile scorrere il dito tra i pulsanti per collegare le tecniche.
- **Su mobile si gioca in orizzontale.** Sul sito del dojo, dopo **Entra nel dojo**, ruota il telefono oppure premi **Gioca in orizzontale**. Il contenitore adatta la stessa partita anche con la rotazione bloccata; rimuove l’adattamento quando il browser è già orizzontale, evitando la doppia rotazione.
- **Aprendo `Gioca.html` direttamente o in un iframe generico**, ruota fisicamente il telefono. In verticale compare l’avviso e il combattimento va in pausa: torna in orizzontale e premi **Riprendi**. Il comando **Schermo intero** richiede il fullscreen nativo se disponibile, altrimenti usa la vista espansa nella pagina. Le barre del browser possono restare visibili anche sul sito del dojo.
- Pausa, cambio app, cambio orientamento e rilascio/interruzione del tocco azzerano i comandi: nessuna direzione rimane bloccata.
- **VS CPU** e **Allenamento** sono giocabili interamente su touch. La modalità **2 giocatori** richiede una tastiera per il secondo giocatore.

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

I pugni usano nuove sequenze illustrate a corpo intero per ciascun karateka: preparazione, estensione, contatto e ritorno. Queste sostituiscono l’animazione che ritagliava e ruotava singole parti delle braccia. Il gyaku mantiene il pugno posteriore: il fotogramma intermedio che cambiava braccio è escluso dalla sequenza. Anche gedan, mae, mawashi e ushiro hanno fasi distinte di caricamento del ginocchio, contatto e richiamo, senza schiacciare orizzontalmente il corpo. I fotogrammi di contatto seguono le finestre dei colpi nel motore; `renderer-punch.test.cjs` verifica sequenze, tempi, specchiatura e assenza del vecchio montaggio delle braccia.

Il kaiten ha nuove fasi illustrate di preparazione, rotazione, calcio e atterraggio; la camminata alterna appoggi reali, anche arretrando in guardia. Nella guida **Come si gioca** trovi le dimostrazioni animate di passi, scatti e kaiten.

## Modalità e regole

- **VS CPU:** affronta il computer, con tre difficoltà: Principiante, Karateka e Kyokushin.
- **2 giocatori:** sfida locale sulla stessa tastiera.
- **Allenamento:** prova le tecniche con tempo illimitato e vita che si rigenera.

Nelle sfide vince chi conquista **due round**. Ogni round dura **60 secondi reali**: porta a zero la vita avversaria oppure conserva più vita allo scadere. Il ritmo delle azioni è accelerato del **30%**, mantenendo il conto alla rovescia in tempo reale. Le tecniche e il combattimento sono interpretati in chiave arcade.

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

| File | Contenuto |
| --- | --- |
| `Gioca.html` | Gioco completo in un solo file, pronto per il doppio clic e l’uso offline |
| `build_portable.py` | Ricostruisce `Gioca.html` dai sorgenti usando solo Python 3 |
| `build_web_package.py` | Ricostruisce il gioco e lo ZIP con generatore iframe e istruzioni |
| `index.html` | Interfaccia, selezione dei personaggi, guida e crediti |
| `styles.css` | Aspetto grafico e adattamento dello schermo |
| `game.js` | Regole, collisioni, combinazioni e avversario CPU |
| `renderer.js` | Disegno del dojo, personaggi, animazioni ed effetti |
| `audio.js` | Colonna sonora originale, effetti, volume e gestione dell’audio |
| `mobile-controls.js` | Joystick multitouch, quattro pulsanti con banchi di tecniche e tastiera |
| `orientation.js` | Layout e avviso verticale in base alla viewport del gioco; la rotazione dell’iframe Flazio è gestita dal launcher esterno |
| `main.js` | Comandi, interfaccia, collegamento degli effetti e avvio del gioco |
| `assets/` | Scenario, illustrazioni dei karateka e logo |
| `assets/attacks-angelo.png` / `assets/attacks-samuel.png` | Sequenze a corpo intero per tsuki, gyaku, shita e kagi |
| `assets/guards.png` | Pose originali di Angelo e Samuel per guardia con le braccia e parata con il ginocchio |
| `assets/motion-angelo.png` / `assets/motion-samuel.png` | Fasi illustrate dei passi e del kaiten per ciascun karateka |
| `assets/portraits.png` | Ritratti illustrati per titolo, selezione personaggio e presentazione VS |
| `art-prompts.txt` | Istruzioni creative usate per generare i personaggi |
| `attack-art-prompts.txt` | Istruzioni creative per le nuove sequenze dei pugni |
| `guard-art-prompts.txt` | Istruzioni creative per le quattro pose difensive, generate con ImageGen integrato |
| `motion-art-prompts.txt` | Istruzioni creative per i nuovi passi e il kaiten |
| `portrait-art-prompts.txt` | Istruzioni creative per i ritratti delle schermate iniziali |
| `background-prompts.txt` | Istruzioni creative e correzioni dello scenario |
| `research.json` | Fonti verificate, riferimenti tecnici e note di ricerca |
| `game.test.cjs` | Verifiche automatiche del motore di combattimento |
| `audio.test.cjs` | Avvio e mute, risorse audio, canale multimediale iOS, interruzioni e recupero del tempo audio bloccato |
| `renderer-punch.test.cjs` | Sequenze illustrate di pugni e calci, contatto, specchiatura e assenza del precedente montaggio delle braccia |
| `mobile-controls.test.cjs` | Verifiche simultaneità, rilascio, interruzioni e scorrimento dei comandi touch |
| `orientation.test.cjs` | Verifiche del gate verticale, dimensioni, zoom e valori della viewport in ritardo |
| `main-orientation.test.cjs` | Verifiche delle richieste asincrone di fullscreen, incluse cancellazioni e risposte tardive |
| `main-audio.test.cjs` | Verifiche dei gesti touch, del pulsante audio e del recupero dopo interruzioni |
| `loading.test.cjs` | Verifiche del caricamento iniziale, dell’attesa delle immagini e della conferma di gioco pronto |
| `landscape-launcher.test.cjs` / `adaptive-launcher.test.cjs` | Launcher sul sito, viewport mobile, rotazione singola, istanza persistente e ripristino alla chiusura |
| `launcher-loading.test.cjs` | Verifiche del loading Flazio, dei messaggi validati, dell’attesa lunga, dei tentativi e della chiusura |
| `Incorpora.html` | Generatore di iframe responsive con anteprima giocabile e copia del codice |
| `INCORPORA.txt` | Istruzioni e codice di esempio per il proprio hosting |
| `iframe-flazio-html.html` | Frammento consigliato per il componente Flazio in modalità HTML, verificato sulla pagina pubblica |
| `iframe-flazio.html` | Variante alternativa per il componente Flazio in modalità Script |
| `launch.command` | Avvio facoltativo su macOS con server locale |

Dopo aver modificato i sorgenti, aggiorna la versione portatile dalla cartella del progetto:

```sh
python3 build_portable.py
```

Il file generato incorpora il foglio di stile, gli script del gioco e ogni immagine necessaria una sola volta. Non modificare `Gioca.html` manualmente: la ricostruzione ne sostituisce il contenuto.

## Inserire il gioco in un sito web

La pagina di gioco è [Gioca del dojo](https://kyokushinkaicataniadojo.it/play). Il file completo è ospitato su [GitHub Pages](https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html?embed=1), nel repository [kyokushin-spirit-bodyplanet](https://github.com/andreaVullo/kyokushin-spirit-bodyplanet).

### Flazio adaptive

Usa **`iframe-flazio-html.html`**, launcher **`onsite-dialog-v5`**: apri il componente Codice/Script, seleziona la modalità **HTML** e incolla tutto il frammento. **`iframe-flazio.html`** contiene la variante per la sola modalità **Script**. Non scambiare i due frammenti tra le modalità.

**Entra nel dojo** mostra subito **Caricamento del dojo…** in un pannello sopra il sito, mantenendo l’indirizzo `/play`. Il gioco diventa visibile e interattivo dopo la conferma che grafica e avvio sono completi. Dopo 25 secondi compare **Riprova**, senza ricaricamenti automatici. Un nuovo tentativo sostituisce il precedente: resta una sola istanza. Il pannello è indipendente dal componente adaptive e conserva la stessa partita quando Flazio ricrea i propri elementi durante un cambio di orientamento.

Mentre il gioco è aperto su un dispositivo touch, il launcher usa temporaneamente `width=device-width, initial-scale=1, viewport-fit=cover` sulla pagina ospitante, neutralizza lo zoom del documento e applica uno sfondo scuro alla pagina. Misura nuovamente lo spazio dopo l’aggiornamento della viewport. Questo evita che la larghezza fissa del sito adaptive riduca o sposti il pannello e che le aree laterali dell’iPhone mostrino lo sfondo bianco del sito. Il gioco mantiene le proprie proporzioni nell’area disponibile.

Se il telefono è già orizzontale, l’invito **Apri a schermo intero** compare al centro dell’area visibile sopra il sito. **Non ora** lo nasconde fino al successivo passaggio verticale → orizzontale. Non viene avviata una partita prima del tocco.

Dopo l’ingresso, **Gioca in orizzontale** mantiene il comportamento introdotto dal launcher V4: se la pagina è verticale, ruota una sola volta il solo iframe, scambiandone larghezza e altezza. Quando il telefono/browser diventa realmente orizzontale, rimuove la trasformazione. Il gioco interno usa le dimensioni dell’iframe e non applica un’altra rotazione. L’adattamento mantiene la stessa sessione e non apre una pagina GitHub. Il fullscreen nativo dipende dal browser: le sue barre possono restare visibili.

**Torna al sito** chiude partita e audio e ripristina viewport, zoom, sfondo e scorrimento della pagina sottostante. Una nuova apertura riparte dal titolo. Se il documento ospitante non è accessibile, il componente mostra un messaggio senza aprire un sito esterno.

Il parametro `hostdisplay=1` abilita il protocollo di visualizzazione solo con gli host riconosciuti dal gioco. I messaggi di caricamento, richiesta di adattamento e stato della vista sono controllati per origine e finestra mittente; non contengono dati personali. `landscape-launcher.test.cjs`, `adaptive-launcher.test.cjs` e `launcher-loading.test.cjs` coprono apertura, caricamento, dimensioni, rotazione e pulizia. Le prove nel browser non certificano da sole il comportamento su un iPhone fisico.

### Iframe generico e pubblicazione

Apri **`Incorpora.html`** per provare un iframe, inserire l’indirizzo pubblico del gioco e copiare il codice. Le istruzioni essenziali sono anche in **`INCORPORA.txt`**. L’iframe generico non include la gestione della pagina adaptive e della rotazione del launcher Flazio: sul telefono richiede una viewport orizzontale del browser.

1. Usa il [file pubblico su GitHub Pages](https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html?embed=1), oppure carica **`Gioca.html`** sul tuo hosting HTTPS. Il file è completo e non richiede gli altri sorgenti.
2. Inserisci l’URL pubblico nel generatore. `embed=1` attiva la vista compatta con audio, aiuto, pausa e schermo intero; `touch=1` mostra esplicitamente i comandi touch anche sul computer. `standalone=1`, in una pagina principale, aggiunge il collegamento **Torna al sito**.
3. Copia il codice nel blocco HTML/embed del sito. L’hosting deve consentire l’incorporamento in iframe. `127.0.0.1` e `localhost` sono utilizzabili solo sul computer di sviluppo.

Il gioco non usa cookie e, una volta caricato, non richiede risorse esterne. Il permesso fullscreen è incluso nell’iframe; l’avvio dell’audio richiede comunque un gesto dell’utente.

Dopo una modifica, ricostruisci il file portatile e aggiorna quello pubblicato. La cartella **`github-pages/`** contiene il materiale per il repository pubblico: il suo `index.html` è un reindirizzamento, diverso dall’index dei sorgenti. Non sostituirlo durante la copia. Il pacchetto **`Kyokushin-Spirit-Mobile-Web.zip`** contiene **`Gioca.html`**, **`Incorpora.html`**, **`INCORPORA.txt`**, **`iframe-flazio-html.html`** e **`iframe-flazio.html`**; per aggiornarlo esegui `python3 build_web_package.py`.

## Fonti

- [Kyokushinkai Catania Dojo — sito ufficiale](https://www.kyokushinkaicataniadojo.it/): sede presso Fitness & Wellness BodyPlanet, Via Antonio Merlino 33/D, Catania. Il sito consultato dal vivo indica Sensei Angelo Pierino, WKB III Dan; alcuni risultati indicizzati conservano il precedente II Dan.
- [Kyokushinkai Catania Dojo — Instagram](https://www.instagram.com/kyokushinkaicataniadojo/): profilo pubblico del dojo e collegamento alla palestra.
- [Fitness & Wellness BodyPlanet — Instagram](https://www.instagram.com/fitnesswellness_bodyplanet/): nome della palestra e indirizzo.
- [IFK Norge — syllabus Kyokushin](https://www.ifknorge.org/wp-content/uploads/2024/03/syllabus_hoyopp.pdf): terminologia di pugni, calci e combinazioni, incluso dō mawashi kaiten geri.
- [International Kyokushinkai Karate — syllabus tecnico](https://www.ikkf.ws/technical-sylabus.html): riscontro dei nomi delle tecniche.

Ricerca effettuata il **3 ottobre 2026**. Il grado di Samuel e l’ordine dei riferimenti fotografici provengono dalle indicazioni dell’utente.

