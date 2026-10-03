# Kyokushin Spirit — Bodyplanet Dojo

Picchiaduro 2D arcade per browser, con Angelo Pierino e Samuel Villani, ambientato nel dojo Bodyplanet di Catania.

- Tastiera e comandi touch simultanei.
- Su mobile, **Apri in orizzontale** adatta il gioco allo schermo; ruotare il telefono conserva la partita.
- Pugni, calci Kyokushin, parate, dash e kaiten.
- Musica ed effetti originali, attivati dal primo gesto.
- Due personaggi, VS CPU, allenamento e sfida a due con tastiera condivisa.

## Comandi

- **Joystick:** trascina per muoverti, spingi verso l’alto per saltare. Per scattare, esegui due spinte rapide nella stessa direzione, tornando al centro tra le due.
- **Quattro cerchi:** scegli il banco **PUGNI** (Tsuki, Shita, Kagi, Mae), **CALCI** (Mae, Mawashi, Gedan, Ushiro) o **SPECIALI** (Kaiten, Braccia, Ginocchio, Ushiro). Tieni premute le parate per mantenerle attive.
- **Tastiera:** P1 usa **A/D** per muoversi e **W** per saltare; P2 usa le frecce. **Shita: H / 7**, **Kagi: N / 8**, **Ushiro: U / 4**. **Esc** apre la pausa; gli altri comandi sono nella guida del gioco.

Combo verificate a distanza ravvicinata: **J → H → N → U**, **J → J → H → N → L → O** e **H → N → K → U**. Il kaiten finale richiede **45 Spirit**; puoi inserire in anticipo fino a tre attacchi successivi.

## Gioco e incorporamento

Apri `Gioca.html` oppure la home del sito GitHub Pages. Il gioco è completo in un solo file e funziona anche offline.

La versione portatile incorpora sei script, incluso `orientation.js`. Nei sorgenti di sviluppo, `orientation.test.cjs` e `main-orientation.test.cjs` verificano layout, rotazioni e richieste native con risposte tardive.

Per incorporarlo, aggiungi `?embed=1` all’indirizzo di `Gioca.html`. `Incorpora.html` contiene il generatore di iframe con anteprima e copia del codice.

Il pulsante **Apri in orizzontale** richiede schermo intero e blocco dell’orientamento dopo il tocco. Se il browser non li consente, l’interfaccia ruota nella stessa pagina, senza riavviare la partita. Puoi anche ruotare fisicamente il telefono. Nessun account richiesto per giocare.
