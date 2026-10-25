import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kyokushin Dojo — Classifica Arcade',
  description: 'Servizio del dojo per pubblicare il risultato Arcade con il solo nome del karateka, senza account giocatore.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
