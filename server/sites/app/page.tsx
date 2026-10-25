import { env } from 'cloudflare:workers';
import { status } from '@/lib/service.mjs';

export const dynamic = 'force-dynamic';

export default function Home() {
  const state = status(env);
  return <main className="service-page">
    <header className="service-header"><span className="brand-mark" aria-hidden="true">極真</span><a href="https://andreavullo.github.io/kyokushin-spirit-bodyplanet/Gioca.html">TORNA AL DOJO ↗</a></header>
    <section className="service-hero">
      <p className="eyebrow">BODYPLANET DOJO / ARCADE</p>
      <h1>IL TUO NOME.<br/><span>IL TUO RISULTATO.</span></h1>
      <p className="intro">La classifica delle scalate, dalla cintura bianca al decimo Dan. Si conserva il risultato finale, senza account del giocatore e senza salvataggi della partita.</p>
      <div className={'service-state ' + (state.ready ? 'ready' : '')} role="status"><i/>{state.ready ? 'SERVIZIO COLLEGATO' : 'SERVIZIO PREPARATO · ATTIVAZIONE IN CORSO'}</div>
    </section>
    <section className="service-cards" aria-label="Stato del servizio">
      <article><span>01</span><h2>Il nome basta.</h2><p>Il giocatore sceglie il proprio karateka e invia il risultato dal gioco. Non servono account, email o password.</p></article>
      <article><span>02</span><h2>Il record resta.</h2><p>Nome, grado e punteggio restano nella classifica online; una copia viene sincronizzata su GitHub. La sfida conclusa non può essere ripresa dalla classifica.</p></article>
      <article><span>03</span><h2>Un passo alla volta.</h2><p>{state.ready ? 'I risultati vengono salvati subito. La copia su GitHub viene aggiornata periodicamente e può arrivare dopo.' : 'L’archivio è predisposto. La ricezione dei risultati si attiva appena viene collegato il database.'}</p></article>
    </section>
    <footer><strong>OSU.</strong><p>Nome e risultato saranno pubblici. La classifica è amatoriale: i punteggi sono calcolati dal gioco.</p><a href="/health">STATO DEL SERVIZIO</a></footer>
  </main>;
}
