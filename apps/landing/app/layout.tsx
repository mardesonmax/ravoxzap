import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'RavoxZap - API WhatsApp para devs e agências',
  description: 'Gateway/API multiusuário de WhatsApp via QR Code, com instâncias mensais, webhooks, filas e dashboard.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
