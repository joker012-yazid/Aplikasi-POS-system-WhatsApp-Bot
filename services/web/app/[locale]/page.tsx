import Link from 'next/link';
import { messages, type Locale } from '../../lib/i18n/config';
import { Button } from '../../components/ui/button';

type PageProps = {
  params: { locale: Locale };
};

export default function LocaleDashboard({ params }: PageProps) {
  const dictionary = messages[params.locale];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-slate-500">WA-POS-CRM</p>
      <h1 className="text-4xl font-bold text-slate-900">{dictionary.welcome}</h1>
      <p className="max-w-xl text-slate-600">{dictionary.description}</p>
      <div className="flex gap-3">
        <Button variant="default" asChild>
          <Link href="/api/docs">API Docs</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/bot/login">Login Bot</Link>
        </Button>
      </div>
    </main>
  );
}
