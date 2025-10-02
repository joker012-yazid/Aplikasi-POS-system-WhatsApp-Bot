import pino from 'pino';

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d[\d\s-]{5,}\d)/g;

const maskString = (value: string): string => {
  const maskedEmail = value.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
  return maskedEmail.replace(PHONE_REGEX, '[REDACTED_PHONE]');
};

const sanitize = (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
  if (typeof value === 'string') {
    return maskString(value);
  }
  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: maskString(value.message), stack: value.stack };
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item, seen));
    }
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitize(entry, seen);
    }
    return result;
  }
  return value;
};

export const createLogger = (name?: string) =>
  pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((arg) => sanitize(arg)));
      },
    },
  });
