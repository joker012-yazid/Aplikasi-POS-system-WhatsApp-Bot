import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '../../lib/i18n/config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type LocaleLayoutProps = {
  children: ReactNode;
  params: { locale: Locale };
};

export default function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = params;
  if (!locales.includes(locale)) {
    notFound();
  }

  return (
    <section data-locale={locale} className="min-h-screen bg-slate-50">
      {children}
    </section>
  );
}
