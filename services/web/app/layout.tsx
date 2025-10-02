import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'WA-POS-CRM Dashboard',
  description: 'Panel pentadbir untuk POS & WhatsApp Bot',
  manifest: '/manifest.json',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" data-theme="ocean" className="min-h-full" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
