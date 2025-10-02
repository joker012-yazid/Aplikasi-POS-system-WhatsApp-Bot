export const locales = ['en', 'ms'] as const;
export type Locale = (typeof locales)[number];

export const messages: Record<Locale, { title: string; description: string; welcome: string }> = {
  en: {
    title: 'Dashboard',
    description: 'Monitor your WhatsApp POS in one place.',
    welcome: 'Welcome to WA-POS-CRM',
  },
  ms: {
    title: 'Papan Pemuka',
    description: 'Pantau POS WhatsApp anda dalam satu tempat.',
    welcome: 'Selamat datang ke WA-POS-CRM',
  },
};
