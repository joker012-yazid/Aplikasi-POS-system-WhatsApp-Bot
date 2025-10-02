import pino from 'pino';

import { sanitizeValue } from './sanitize-log.js';

export const createLogger = (name?: string) =>
  pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    hooks: {
      logMethod(args, method) {
        const sanitized = args.map((arg) => sanitizeValue(arg));
        method.apply(this, sanitized);
      },
    },
  });
