import cron from 'node-cron';
import dotenv from 'dotenv';
import { createLogger } from './logger.js';

dotenv.config();

const logger = createLogger('scheduler');

const apiBaseUrl = (process.env.SCHEDULER_API_BASE_URL ?? 'http://api:3000/api').replace(/\/+$/, '');
const apiEmail = process.env.SCHEDULER_API_EMAIL ?? '';
const apiPassword = process.env.SCHEDULER_API_PASSWORD ?? '';
const followUpCron = process.env.SCHEDULER_FOLLOW_UP_CRON ?? '0 * * * *';
const backupCron = process.env.SCHEDULER_BACKUP_CRON ?? '0 3 * * *';

let token: string | null = null;

const login = async () => {
  if (!apiEmail || !apiPassword) {
    logger.warn('scheduler API credentials missing, skipping login');
    return;
  }

  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: apiEmail, password: apiPassword }),
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data?.token) {
    throw new Error('Login response did not include a token');
  }

  token = data.token;
  logger.info('scheduler authenticated with API');
};

const ensureToken = async () => {
  if (!token) {
    await login();
  }
  return token;
};

const runFollowUpJob = async () => {
  if (!apiEmail || !apiPassword) {
    logger.warn('Skipping follow-up job because API credentials are not configured');
    return;
  }

  try {
    const currentToken = await ensureToken();
    const response = await fetch(`${apiBaseUrl}/hooks/tickets/follow-ups/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: currentToken ? `Bearer ${currentToken}` : undefined,
      },
    });

    if (response.status === 401) {
      logger.warn('API token expired, attempting re-login');
      token = null;
      const refreshedToken = await ensureToken();
      const retry = await fetch(`${apiBaseUrl}/hooks/tickets/follow-ups/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: refreshedToken ? `Bearer ${refreshedToken}` : undefined,
        },
      });

      if (!retry.ok) {
        const body = await retry.text();
        throw new Error(`Follow-up job failed after re-login (${retry.status}): ${body}`);
      }

      const retryData = await retry.json();
      logger.info({ summary: retryData?.data ?? retryData }, 'follow-up job executed after token refresh');
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Follow-up job failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    logger.info({ summary: data?.data ?? data }, 'follow-up job executed');
  } catch (error) {
    logger.error({ err: error }, 'failed to execute follow-up job');
  }
};

const runBackupJob = async () => {
  if (!apiEmail || !apiPassword) {
    logger.warn('Skipping backup job because API credentials are not configured');
    return;
  }

  try {
    const currentToken = await ensureToken();
    const response = await fetch(`${apiBaseUrl}/settings/backup/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: currentToken ? `Bearer ${currentToken}` : undefined,
      },
    });

    if (response.status === 401) {
      logger.warn('API token expired during backup job, attempting re-login');
      token = null;
      const refreshedToken = await ensureToken();
      const retry = await fetch(`${apiBaseUrl}/settings/backup/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: refreshedToken ? `Bearer ${refreshedToken}` : undefined,
        },
      });

      if (!retry.ok) {
        const body = await retry.text();
        throw new Error(`Backup job failed after re-login (${retry.status}): ${body}`);
      }

      const retryData = await retry.json();
      logger.info({ summary: retryData?.data ?? retryData }, 'backup job executed after token refresh');
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Backup job failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    logger.info({ summary: data?.data ?? data }, 'backup job executed');
  } catch (error) {
    logger.error({ err: error }, 'failed to execute backup job');
  }
};

logger.info({ followUpCron, backupCron }, 'scheduler booted');

cron.schedule(followUpCron, () => {
  runFollowUpJob().catch((error) => {
    logger.error({ err: error }, 'uncaught error in follow-up cron');
  });
});

cron.schedule(backupCron, () => {
  runBackupJob().catch((error) => {
    logger.error({ err: error }, 'uncaught error in backup cron');
  });
});

// run once at startup
runFollowUpJob().catch((error) => {
  logger.error({ err: error }, 'initial follow-up job failed');
});

runBackupJob().catch((error) => {
  logger.error({ err: error }, 'initial backup job failed');
});

process.on('SIGTERM', () => {
  logger.info('scheduler stopping');
  process.exit(0);
});
