import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {
  i18n: {
    locales: ['en', 'ms'],
    defaultLocale: 'en',
    localeDetection: true,
  },
  experimental: {
    appDir: true,
  },
};

export default withPWA(nextConfig);
