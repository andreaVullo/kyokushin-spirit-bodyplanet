# Kyokushin Spirit — BodyPlanet Dojo

Picchiaduro 2D arcade per browser, ambientato nel dojo Fitness & Wellness BodyPlanet di Catania. Due karateka, combinazioni di pugni e calci, guardia, salti, scatti e kaiten, con musica ed effetti originali. Nessuna installazione o dipendenza esterna necessaria per giocare.

## Gioca subito

Fai doppio clic su **`Gioca.html`**. È la versione completa in un solo file: funziona offline, senza installazioni e senza server. Puoi copiarla altrove da sola; include anche immagini, logo e audio.

All’apertura compare **Caricamento del dojo…**: il titolo e i comandi diventano disponibili solo quando grafica e gioco sono pronti. Se l’attesa si prolunga, puoi continuare ad attendere oppure premere **Riprova**. La barra animata indica l’attesa, senza percentuali stimate.

1. Nella schermata del titolo premi **Invio** oppure il pulsante di avvio.
2. Scegli modalità e difficoltà; seleziona Angelo o Samuel con **← / →** oppure cliccando sul suo ritratto.
3. Premi **Invio** o **Combatti**: dopo la presentazione **VS**, inizia il kumite.

Nella selezione, **Esc** o la freccia **Titolo** riportano alla schermata iniziale. Durante il combattimento, **Esc** apre la pausa: puoi riprendere, ricominciare o tornare alla scelta del personaggio. Al termine dell’incontro, scegli **Rivincita** per rigiocare. L’audio si attiva dopo un clic, un tasto o un tocco completo dentro il gioco. Il pulsante **Audio** in alto permette di silenziarlo, riattivarlo o ritentarne l’avvio dopo un’interruzione.

**`index.html`** resta l’ingresso della versione sorgente modificabile e usa gli altri file della cartella. Puoi aprirlo direttamente oppure usare il server locale descritto sotto.

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
- **Su mobile si gioca in orizzontale.** Ruota fisicamente il telefono; se la pagina resta verticale, disattiva il blocco rotazione del dispositivo. Il gioco segue le dimensioni del browser e non applica una seconda rotazione. La partita resta aperta; tornando in verticale, il combattimento va in pausa finché non torni in orizzontale e premi **Riprendi**.
- **Schermo intero** ingrandisce il gioco; sui browser che non offrono lo schermo intero nativo, viene usata una vista espansa nella pagina.
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

I pugni piegano il braccio al gomito, sotto la manica, mantenendo polsino e avambraccio uniti. Il gyaku usa la posa originale del braccio posteriore, senza sovrapporre braccia durante le transizioni. La guardia resta quella illustrata. `renderer-punch.test.cjs` verifica articolazione, guardia, contatto, specchiatura e assenza di duplicazioni.

Il kaiten ha nuove fasi illustrate di preparazione, rotazione, calcio e atterraggio; la camminata alterna appoggi reali, anche arretrando in guardia. Nella guida **Come si gioca** trovi le dimostrazioni animate di passi, scatti e kaiten.

## Modalità e regole

- **VS CPU:** affronta il computer, con tre difficoltà: Principiante, Karateka e Kyokushin.
- **2 giocatori:** sfida locale sulla stessa tastiera.
- **Allenamento:** prova le tecniche con tempo illimitato e vita che si rigenera.

Nelle sfide vince chi conquista **due round**. Ogni round dura **60 secondi reali**: porta a zero la vita avversaria oppure conserva più vita allo scadere. Il ritmo delle azioni è accelerato del **30%**, mantenendo il conto alla rovescia in tempo reale. Le tecniche e il combattimento sono interpretati in chiave arcade.

## Musica ed effetti

La colonna sonora cambia tra **titolo, selezione, presentazione VS, combattimento e risultato**. Arrangiamenti originali con basso, melodia pentatonica, accordi, arpeggi e percussioni accompagnano ogni fase. Menu, pugni, calci, parate, kaiten, scatti, passi, salti, atterraggi e vittorie hanno effetti dedicati.

Tutto l’audio è sintetizzato nel browser e funziona offline. Il primo clic, tasto o tocco completo ne richiede l’attivazione; sui dispositivi mobili conta anche il rilascio del dito. In pausa la musica si abbassa; passando a un’altra scheda, l’audio si sospende. Se resta interrotto quando torni, premi **♪** per ritentarne l’avvio. La scelta di silenziare il gioco rimane attiva durante i cambi di schermata.

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
| `orientation.js` | Layout secondo il browser e avviso in verticale, senza rotazioni CSS |
| `main.js` | Comandi, interfaccia, collegamento degli effetti e avvio del gioco |
| `assets/` | Scenario, illustrazioni dei karateka e logo |
| `assets/guards.png` | Pose originali di Angelo e Samuel per guardia con le braccia e parata con il ginocchio |
| `assets/motion-angelo.png` / `assets/motion-samuel.png` | Fasi illustrate dei passi e del kaiten per ciascun karateka |
| `assets/portraits.png` | Ritratti illustrati per titolo, selezione personaggio e presentazione VS |
| `art-prompts.txt` | Istruzioni creative usate per generare i personaggi |
| `guard-art-prompts.txt` | Istruzioni creative per le quattro pose difensive, generate con ImageGen integrato |
| `motion-art-prompts.txt` | Istruzioni creative per i nuovi passi e il kaiten |
| `portrait-art-prompts.txt` | Istruzioni creative per i ritratti delle schermate iniziali |
| `background-prompts.txt` | Istruzioni creative e correzioni dello scenario |
| `research.json` | Fonti verificate, riferimenti tecnici e note di ricerca |
| `game.test.cjs` | Verifiche automatiche del motore di combattimento |
| `audio.test.cjs` | Verifiche di avvio, mute, scene musicali e gestione delle risorse audio |
| `mobile-controls.test.cjs` | Verifiche simultaneità, rilascio, interruzioni e scorrimento dei comandi touch |
| `orientation.test.cjs` | Verifiche del gate verticale, dimensioni, zoom e valori della viewport in ritardo |
| `main-orientation.test.cjs` | Verifiche delle richieste asincrone di fullscreen, incluse cancellazioni e risposte tardive |
| `main-audio.test.cjs` | Verifiche dei gesti touch, del pulsante audio e del recupero dopo interruzioni |
| `loading.test.cjs` | Verifiche del caricamento iniziale, dell’attesa delle immagini e della conferma di gioco pronto |
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

Il gioco è disponibile nella pagina [Gioca del dojo](https://kyokushinkaicataniadojo.it/play): l’ingresso e l’apertura a tutta finestra sono stati verificati sul sito pubblico. Il file completo è ospitato su GitHub Pages: [apri il gioco direttamente](https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html?embed=1). La versione pubblicata è nel repository [kyokushin-spirit-bodyplanet](https://github.com/andreaVullo/kyokushin-spirit-bodyplanet).

Per Flazio, usa **`iframe-flazio-html.html`**: apri il componente Codice/Script, passa alla modalità **HTML** e incolla tutto il frammento. È la configurazione verificata nella pagina pubblica `/play`; sostituisce il precedente wrapper Script rimasto in cache. **`iframe-flazio.html`** resta disponibile come alternativa da usare soltanto in modalità **Script**.

Su telefono, tablet e desktop, il componente apre il gioco sopra il sito, mantenendo l’indirizzo `/play`. La finestra è indipendente dal componente adaptive di Flazio. Se il telefono è già orizzontale, compare al centro dello schermo **Apri a schermo intero**, sopra il layout del sito. L’invito segue l’area effettivamente visibile anche con viewport fisso e zoom; **Non ora** lo nasconde fino al prossimo passaggio verticale → orizzontale. Non viene avviata una partita prima del tocco.

**Entra nel dojo** apre subito **Caricamento del dojo…** in un pannello a tutta finestra su `/play`. Il gioco resta nascosto e non interattivo fino alla conferma che grafica e avvio sono completi. Dopo 25 secondi compare **Riprova**; nessun ricaricamento è automatico. Ogni tentativo sostituisce il precedente, mantenendo una sola istanza. **Torna al sito** chiude la partita. Se il documento del sito non è accessibile, viene mostrato un messaggio nel componente; non viene aperta una pagina esterna.

Apri **`Incorpora.html`**: contiene una vera anteprima del gioco in iframe, un campo per il suo indirizzo pubblico e il pulsante per copiare il codice responsive. Le istruzioni essenziali sono anche in **`INCORPORA.txt`**.

Il pacchetto **`Kyokushin-Spirit-Mobile-Web.zip`** contiene **`Gioca.html`**, **`Incorpora.html`**, **`INCORPORA.txt`**, **`iframe-flazio-html.html`** e **`iframe-flazio.html`**. Per aggiornarlo dopo altre modifiche, esegui `python3 build_web_package.py`.

1. Usa il [file già pubblico su GitHub Pages](https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html?embed=1), oppure carica **`Gioca.html`** sul tuo hosting: è completo e non richiede gli altri file.
2. Inserisci il suo URL HTTPS pubblico nel generatore. Il parametro **`embed=1`** attiva la vista dedicata al gioco, con audio, aiuto, pausa e schermo intero integrati.
3. Copia il codice generato nel blocco HTML/embed del sito. Il file può essere ospitato sullo stesso dominio o su un altro dominio che consenta l’incorporamento in iframe.

Per un’installazione sullo stesso sito, puoi usare il percorso `/Gioca.html?embed=1` se hai caricato il file nella sua cartella principale. L’indirizzo `127.0.0.1` serve solo all’anteprima sul computer: i visitatori devono ricevere l’URL pubblico del file. Dopo modifiche locali, ricostruisci il gioco e aggiorna anche il file pubblicato nel repository.

Su telefono, ruota fisicamente il dispositivo in orizzontale e disattiva il blocco rotazione se la pagina rimane verticale. Il pulsante **Schermo intero** richiede il fullscreen quando il browser lo offre; altrimenti il gioco occupa una vista espansa nella stessa pagina. Non viene applicata alcuna rotazione CSS al gioco e la sessione resta aperta. **Torna al sito** chiude la finestra del gioco e libera l’audio; una nuova apertura riparte dal titolo.

Il gioco non usa cookie e, una volta caricato, non richiede risorse esterne. Scambia con il launcher soltanto messaggi sullo stato di caricamento (in corso, pronto o errore), senza dati personali. Il launcher verifica che i messaggi provengano dal proprio iframe sul dominio GitHub Pages prima di mostrare il gioco. Il permesso fullscreen è incluso nel codice; l’audio viene comunque avviato solo dopo un gesto dell’utente. Il parametro facoltativo **`touch=1`** mostra i comandi touch anche su desktop; usa una finestra più larga che alta per provarli.

## Fonti

- [Kyokushinkai Catania Dojo — sito ufficiale](https://www.kyokushinkaicataniadojo.it/): sede presso Fitness & Wellness BodyPlanet, Via Antonio Merlino 33/D, Catania. Il sito consultato dal vivo indica Sensei Angelo Pierino, WKB III Dan; alcuni risultati indicizzati conservano il precedente II Dan.
- [Kyokushinkai Catania Dojo — Instagram](https://www.instagram.com/kyokushinkaicataniadojo/): profilo pubblico del dojo e collegamento alla palestra.
- [Fitness & Wellness BodyPlanet — Instagram](https://www.instagram.com/fitnesswellness_bodyplanet/): nome della palestra e indirizzo.
- [IFK Norge — syllabus Kyokushin](https://www.ifknorge.org/wp-content/uploads/2024/03/syllabus_hoyopp.pdf): terminologia di pugni, calci e combinazioni, incluso dō mawashi kaiten geri.
- [International Kyokushinkai Karate — syllabus tecnico](https://www.ikkf.ws/technical-sylabus.html): riscontro dei nomi delle tecniche.

Ricerca effettuata il **3 ottobre 2026**. Il grado di Samuel e l’ordine dei riferimenti fotografici provengono dalle indicazioni dell’utente.

## Flazio adaptive e rotazione mobile

Il launcher riconosce telefoni e tablet dalle capacità touch, indipendentemente dalla larghezza e dall’orientamento del sito adaptive. I pulsanti aprono una sola partita in una finestra sopra il sito, senza navigare a GitHub Pages. Il gioco resta ospitato su GitHub e viene caricato dentro l’iframe.

La finestra usa il livello modale del browser ed è esterna al corpo della pagina Flazio. Le sue dimensioni seguono l’area visibile e compensano la scala applicata dal viewport fisso del sito. Il cambio orientamento ridimensiona la stessa partita. In verticale il gioco si mette in pausa e attende la rotazione fisica. **Torna al sito** chiude partita e audio e ripristina la pagina sottostante.

`landscape-launcher.test.cjs`, `adaptive-launcher.test.cjs` e `launcher-loading.test.cjs` verificano apertura sul sito, dimensioni, istanze duplicate, messaggi di caricamento e pulizia. `standalone-entry.test.cjs` continua a coprire l’ingresso diretto facoltativo nel gioco. Le prove responsive nel browser non sostituiscono una verifica su iPhone fisico.

Aggiornamento 4 ottobre 2026 — Pulsante interno su Flazio: dopo Entra nel dojo, Gioca in orizzontale adatta la stessa partita anche se il browser non consente fullscreen o rotazione automatica. Il contenitore ruota il solo iframe quando la pagina è verticale; quando il telefono è già orizzontale rimuove questa trasformazione. Il gioco interno non applica altre rotazioni. Le barre del browser possono restare visibili. Il protocollo display è abilitato da hostdisplay=1 e verifica origine e iframe mittente.
