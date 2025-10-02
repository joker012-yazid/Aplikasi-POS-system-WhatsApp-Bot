import { createApp } from './app.js';
import { PORT } from './config.js';
import { ensureDefaultAdmin } from './services/auth-service.js';
import { prisma } from './lib/prisma.js';
import { startCampaignDispatcher } from './services/campaign-dispatcher.js';
import { generatePostmanCollection } from './utils/postman.js';

const app = createApp();

let stopDispatcher: (() => void) | null = null;

const bootstrap = async () => {
  await ensureDefaultAdmin();
  generatePostmanCollection(app);

  stopDispatcher = startCampaignDispatcher();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API server listening on port ${PORT}`);
  });
};

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API server', error);
  process.exit(1);
});

const shutdown = async () => {
  if (stopDispatcher) {
    stopDispatcher();
    stopDispatcher = null;
  }
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
