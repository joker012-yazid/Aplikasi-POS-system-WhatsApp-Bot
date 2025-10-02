'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '../../../components/ui/button';

type MetricsSnapshot = {
  salesTotal: number;
  newTickets: number;
  completedTickets: number;
};

type DashboardMetricsResponse = {
  data: {
    currency: string;
    today: MetricsSnapshot;
    last7Days: MetricsSnapshot;
    last30Days: MetricsSnapshot;
    generatedAt: string;
  };
};

type ThemePreset = 'ocean' | 'forest' | 'sunset' | 'orchid';
type ThemeMode = 'light' | 'dark';

type InstallState = 'idle' | 'prompted' | 'installed';

type QuickAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  shortcut: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

const TOKEN_STORAGE_KEY = 'wa-pos-admin-token';
const THEME_STORAGE_KEY = 'wa-pos-theme';
const THEME_PRESET_KEY = 'wa-pos-theme-preset';

const PRESET_LABELS: Record<ThemePreset, string> = {
  ocean: 'Ocean (Biru)',
  forest: 'Rimba (Hijau)',
  sunset: 'Senja (Amber)',
  orchid: 'Orkid (Magenta)',
};

const TIMEFRAMES = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'last7Days', label: '7 Hari' },
  { key: 'last30Days', label: '30 Hari' },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]['key'];

const buildQuickActions = (locale: string): QuickAction[] => [
  {
    id: 'pos',
    title: 'Buka POS',
    description: 'Lancarkan kaunter jualan mesra sentuh dan resit QR.',
    href: `/${locale}/admin/pos`,
    shortcut: 'Alt+1',
  },
  {
    id: 'tickets',
    title: 'Cipta Tiket',
    description: 'Daftarkan tiket kerja baharu untuk pelanggan.',
    href: `/${locale}/admin/tickets`,
    shortcut: 'Alt+2',
  },
  {
    id: 'campaign',
    title: 'Buat Kempen',
    description: 'Susun mesej pemasaran dengan kawalan throttle & opt-out.',
    href: `/${locale}/admin/settings#campaigns`,
    shortcut: 'Alt+3',
  },
];

const formatCurrency = (amount: number, currency: string) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('ms-MY', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch (error) {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

export default function AdminDashboardPage() {
  const params = useParams<{ locale?: string }>();
  const router = useRouter();
  const locale = typeof params?.locale === 'string' && params.locale ? params.locale : 'en';

  const quickActions = useMemo(() => buildQuickActions(locale), [locale]);
  const quickActionMap = useMemo(() => {
    const map = new Map<string, string>();
    quickActions.forEach((action) => {
      const key = action.shortcut.split('+').pop()?.toLowerCase();
      if (key) {
        map.set(key, action.href);
      }
    });
    return map;
  }, [quickActions]);

  const [token, setToken] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetricsResponse['data'] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [preset, setPreset] = useState<ThemePreset>('ocean');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [isStandalone, setIsStandalone] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      setToken(storedToken);
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    const storedPreset = window.localStorage.getItem(THEME_PRESET_KEY) as ThemePreset | null;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

    setTheme(storedTheme === 'dark' ? 'dark' : storedTheme === 'light' ? 'light' : prefersDark ? 'dark' : 'light');
    setPreset(storedPreset && PRESET_LABELS[storedPreset] ? storedPreset : 'ocean');

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches || Boolean(window.navigator.standalone);
    setIsStandalone(standalone);
    if (standalone) {
      setInstallState('installed');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', preset);

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(THEME_PRESET_KEY, preset);
  }, [theme, preset]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallState('prompted');
    };

    const handleInstalled = () => {
      setInstallState('installed');
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall as EventListener);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall as EventListener);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  const fetchMetrics = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      if (!token) {
        setMetrics(null);
        setErrorMessage('Masukkan token pentadbir untuk memuat metrik.');
        return;
      }

      if (options?.signal?.aborted) {
        return;
      }

      setIsFetching(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/dashboard/metrics', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: options?.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Token tidak sah atau telah tamat. Sila sahkan semula.');
          }
          throw new Error(`Gagal memuat metrik (kod ${response.status}).`);
        }

        const payload = (await response.json()) as DashboardMetricsResponse;
        setMetrics(payload.data);
        setLastUpdatedAt(payload.data.generatedAt);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setMetrics(null);
        setErrorMessage(error instanceof Error ? error.message : 'Tidak dapat memuat metrik.');
      } finally {
        if (!options?.signal?.aborted) {
          setIsFetching(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setMetrics(null);
      setErrorMessage('Masukkan token pentadbir untuk memuat metrik.');
      return;
    }

    const controller = new AbortController();
    void fetchMetrics({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [fetchMetrics, token]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 't') {
        event.preventDefault();
        toggleTheme();
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        void fetchMetrics();
        return;
      }

      const destination = quickActionMap.get(key);
      if (destination) {
        event.preventDefault();
        router.push(destination);
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [fetchMetrics, quickActionMap, router, toggleTheme]);

  const handleTokenChange = (value: string) => {
    setToken(value);
    if (typeof window !== 'undefined') {
      if (value) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallState(choice.outcome === 'accepted' ? 'installed' : 'idle');
      setInstallPrompt(null);
    } catch (error) {
      setInstallState('idle');
      setInstallPrompt(null);
    }
  };

  const renderMetric = (timeframe: TimeframeKey) => {
    if (!metrics) {
      return (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      );
    }

    const snapshot = metrics[timeframe];
    return (
      <dl className="space-y-3" aria-live="polite">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Jualan</dt>
          <dd className="text-lg font-semibold text-foreground">
            {formatCurrency(snapshot?.salesTotal ?? 0, metrics.currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Tiket Baharu</dt>
          <dd className="text-lg font-semibold text-foreground">{snapshot?.newTickets ?? 0}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Selesai</dt>
          <dd className="text-lg font-semibold text-foreground">{snapshot?.completedTickets ?? 0}</dd>
        </div>
      </dl>
    );
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Dashboard</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Ringkasan Operasi WA-POS-CRM
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Pantau prestasi jualan, tiket kerja dan kempen dalam satu tempat. Gunakan pintasan papan kekunci Alt+1-3
                untuk akses pantas ke modul utama.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" role="status" aria-live="polite">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground">
                {isFetching ? 'Memuat metrik…' : 'Metrik dikemas kini'}
              </span>
              <span>Dikemas kini: {formatDateTime(lastUpdatedAt)}</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:flex-col">
            <div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card/80 p-4 shadow-sm sm:w-auto">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Tema</p>
                  <p className="text-xs text-muted-foreground">Alt+T untuk tukar cerah/gelap</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme === 'dark'}
                  aria-keyshortcuts="Alt+T"
                  onClick={toggleTheme}
                  className="flex h-9 w-16 items-center rounded-full border border-border bg-muted p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-background text-xs font-semibold transition-transform ${
                      theme === 'dark' ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  >
                    {theme === 'dark' ? '🌙' : '☀️'}
                  </span>
                </button>
              </div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="theme-preset">
                Preset warna
              </label>
              <select
                id="theme-preset"
                value={preset}
                onChange={(event) => setPreset(event.target.value as ThemePreset)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {Object.entries(PRESET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card/80 p-4 shadow-sm sm:w-64">
              <div>
                <p className="text-sm font-semibold text-foreground">Pemasangan PWA</p>
                <p className="text-xs text-muted-foreground">
                  Pasang aplikasi untuk mod luar talian dan pintasan skrin utama.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={installState === 'installed' || isStandalone || !installPrompt}
                onClick={handleInstallClick}
              >
                {installState === 'installed' || isStandalone
                  ? 'Sudah Dipasang'
                  : installPrompt
                    ? 'Pasang Aplikasi'
                    : 'Menunggu Sokongan'}
              </Button>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Status: {installState === 'installed' || isStandalone ? 'Terpasang' : installState === 'prompted' ? 'Sedia dipasang' : 'Tidak dipasang'}
              </p>
            </div>
          </div>
        </header>

        <section aria-labelledby="metrics-heading" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="metrics-heading" className="text-xl font-semibold text-foreground">
                Kad Metrik
              </h2>
              <p className="text-sm text-muted-foreground">
                Jejak prestasi jualan, tiket dan penyelesaian mengikut tempoh masa utama.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void fetchMetrics()} disabled={isFetching} aria-keyshortcuts="Alt+R">
                {isFetching ? 'Menyegar semula…' : 'Segar Semula (Alt+R)'}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {TIMEFRAMES.map((timeframe) => (
              <article
                key={timeframe.key}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card/70 p-6 shadow-sm transition-transform focus-within:ring-2 focus-within:ring-ring"
                tabIndex={0}
                aria-labelledby={`metric-${timeframe.key}`}
              >
                <div className="flex items-center justify-between">
                  <h3 id={`metric-${timeframe.key}`} className="text-lg font-semibold text-foreground">
                    {timeframe.label}
                  </h3>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ringkas</span>
                </div>
                <div className="mt-6">{renderMetric(timeframe.key)}</div>
              </article>
            ))}
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="actions-heading" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="actions-heading" className="text-xl font-semibold text-foreground">
                Quick Actions
              </h2>
              <p className="text-sm text-muted-foreground">
                Gunakan pintasan Alt+1 hingga Alt+3 untuk membuka modul berkaitan dengan segera.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">Akses papan kekunci</span>
              <span>Alt+1 POS</span>
              <span>Alt+2 Tiket</span>
              <span>Alt+3 Kempen</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action) => (
              <article key={action.id} className="flex flex-col justify-between rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <Button asChild variant="secondary" size="md">
                    <Link href={action.href} aria-keyshortcuts={action.shortcut} className="flex items-center gap-2">
                      Pergi
                      <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground">
                        {action.shortcut}
                      </span>
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="token-heading" className="space-y-4">
          <div className="flex flex-col gap-2">
            <h2 id="token-heading" className="text-xl font-semibold text-foreground">
              Kebenaran API
            </h2>
            <p className="text-sm text-muted-foreground">
              Masukkan token pentadbir untuk benarkan dashboard membaca statistik API. Token disimpan secara setempat
              (localStorage) dan boleh dikosongkan pada bila-bila masa.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
            <label className="text-sm font-medium text-foreground" htmlFor="admin-token">
              Token Pentadbir
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="admin-token"
                name="admin-token"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(event) => handleTokenChange(event.target.value)}
                autoComplete="off"
                className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-describedby="token-help"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowToken((current) => !current)}
                aria-pressed={showToken}
              >
                {showToken ? 'Sembunyi' : 'Tunjuk'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void fetchMetrics()} disabled={isFetching}>
                Uji Token
              </Button>
            </div>
            <p id="token-help" className="text-xs text-muted-foreground">
              Token ini diperlukan untuk panggilan API yang dilindungi. Pastikan token mempunyai akses admin atau cashier.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
