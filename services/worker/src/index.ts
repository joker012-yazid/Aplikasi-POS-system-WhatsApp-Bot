import { Worker, Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://redis:6379');
const queueName = process.env.WORKER_QUEUE ?? 'wa-pos-jobs';

const queue = new Queue(queueName, { connection });
const events = new QueueEvents(queueName, { connection });

const worker = new Worker(
  queueName,
  async (job) => {
    logger.info({ id: job.id, name: job.name }, 'processing job');
  },
  { connection }
);

worker.on('completed', (job) => {
  logger.info({ id: job.id }, 'job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ id: job?.id, err }, 'job failed');
});

events.on('waiting', ({ jobId }) => {
  logger.debug({ jobId }, 'job waiting');
});

queue.add('bootstrap', { ok: true }, { removeOnComplete: true }).catch((error) => {
  logger.error({ err: error }, 'failed to enqueue bootstrap job');
});

process.on('SIGTERM', async () => {
  logger.info('worker stopping');
  await worker.close();
  await events.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
});
