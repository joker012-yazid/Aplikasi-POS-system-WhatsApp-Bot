import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 30,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: ({ request }) =>
        ['document', 'script', 'style', 'font'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'assets-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24,
        },
      },
    },
  ],
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
