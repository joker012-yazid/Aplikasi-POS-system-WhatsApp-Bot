import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'WA-POS-CRM Dashboard',
  description: 'Placeholder dashboard for WA-POS-CRM',
  manifest: '/manifest.json',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="min-h-full bg-slate-50">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
