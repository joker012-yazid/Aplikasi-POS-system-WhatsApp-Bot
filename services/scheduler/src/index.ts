import cron from 'node-cron';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

logger.info('scheduler booted');

cron.schedule('*/5 * * * * *', () => {
  logger.debug('scheduler heartbeat');
});

process.on('SIGTERM', () => {
  logger.info('scheduler stopping');
  process.exit(0);
});
