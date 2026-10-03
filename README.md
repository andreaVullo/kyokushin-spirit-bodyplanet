# Kyokushin Spirit — Bodyplanet Dojo

Picchiaduro 2D arcade per browser, con Angelo Pierino e Samuel Villani, ambientato nel dojo Bodyplanet di Catania.

- Tastiera e comandi touch simultanei.
- Su mobile, ruota fisicamente il telefono in orizzontale; la partita resta aperta e il gioco non applica una seconda rotazione.
- Pugni, calci Kyokushin, parate, dash e kaiten.
- Musica ed effetti originali, attivati dopo un clic, un tasto o un tocco completo nel gioco.
- Due personaggi, VS CPU, allenamento e sfida a due con tastiera condivisa.

## Comandi

- **Joystick:** trascina per muoverti, spingi verso l’alto per saltare. Per scattare, esegui due spinte rapide nella stessa direzione, tornando al centro tra le due.
- **Quattro cerchi con icone:** un unico tasto **↻** cambia gruppo a ogni tocco: pugni → calci → speciale/difese → pugni. I tre puntini indicano il gruppo attivo. Il primo gruppo contiene Tsuki, Shita, Kagi e Mae; il secondo Mae, Mawashi, Gedan e Ushiro; il terzo Kaiten, Braccia, Ginocchio e Ushiro. Tieni premute le icone delle parate per mantenerle attive.
- **Tastiera:** P1 usa **A/D** per muoversi e **W** per saltare; P2 usa le frecce. **Shita: H / 7**, **Kagi: N / 8**, **Ushiro: U / 4**. **Esc** apre la pausa; gli altri comandi sono nella guida del gioco.

I quattro pugni hanno animazioni continue di caricamento, contatto e ritorno in guardia, con spalla e gomito collegati.

Combo verificate a distanza ravvicinata: **J → H → N → U**, **J → J → H → N → L → O** e **H → N → K → U**. Il kaiten finale richiede **45 Spirit**; puoi inserire in anticipo fino a tre attacchi successivi.

## Gioco e incorporamento

Apri `Gioca.html` oppure la home del sito GitHub Pages. Il gioco è completo in un solo file e funziona anche offline. All’avvio compare **Caricamento del dojo…**; titolo e comandi diventano disponibili quando grafica e gioco sono pronti. Se l’attesa supera 25 secondi, compare **Riprova**. La barra animata segnala l’attesa senza percentuali stimate.

La versione portatile incorpora gli script del gioco, incluso `orientation.js`, e la schermata iniziale di caricamento. Nei sorgenti di sviluppo, `orientation.test.cjs` e `main-orientation.test.cjs` verificano il layout durante la rotazione del telefono, il gate verticale e le richieste fullscreen con risposte tardive.

Il launcher Flazio mostra il loading appena premi **Entra nel dojo**, tenendo nascosto il gioco fino alla conferma di avvio completo. **Torna al sito** resta disponibile durante l’attesa. **Riprova** sostituisce il tentativo precedente: rimane una sola partita aperta. Il gioco scambia soltanto lo stato di caricamento con il launcher, senza dati personali; il launcher verifica dominio e iframe mittente.

| Test nei sorgenti di sviluppo | Contenuto |
| --- | --- |
| `loading.test.cjs` | Caricamento iniziale, immagini e conferma di gioco pronto |
| `launcher-loading.test.cjs` | Loading Flazio, messaggi validati, attesa lunga, tentativi e chiusura |

Per incorporarlo, aggiungi `?embed=1` all’indirizzo di `Gioca.html`. `Incorpora.html` contiene il generatore di iframe con anteprima e copia del codice.

Su telefono, ruota fisicamente il dispositivo in orizzontale. Se la pagina resta verticale, disattiva il blocco rotazione del telefono. Il gioco segue il viewport senza rotazioni CSS. **Schermo intero** richiede il fullscreen quando il browser lo offre; altrimenti apre una vista espansa nella stessa pagina. La partita resta aperta durante i cambi di orientamento.

Per attivare l’audio, tocca e rilascia un comando dentro il gioco. Il pulsante **♪** controlla musica ed effetti e ne ritenta l’attivazione se il browser li ha interrotti. Nessun account richiesto per giocare.
