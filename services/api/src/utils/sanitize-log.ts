const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d[\d\s-]{5,}\d)/g;

const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'mobile',
  'whatsapp',
  'authorization',
  'token',
  'password',
  'recipient',
  'to',
  'from',
  'jid',
]);

const maskString = (value: string): string => {
  const maskedEmail = value.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
  return maskedEmail.replace(PHONE_REGEX, (match) => {
    const digits = match.replace(/[^0-9]/g, '');
    if (digits.length < 6) {
      return '[REDACTED_PHONE]';
    }
    const prefix = match.slice(0, 2);
    const suffix = match.slice(-2);
    return `${prefix}***${suffix}`;
  });
};

const sanitizeObject = (
  input: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = Array.isArray(input) ? [] : {};

  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
      continue;
    }
    result[key] = sanitizeValue(value, seen);
  }

  return result;
};

export const sanitizeValue = (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
  if (typeof value === 'string') {
    return maskString(value);
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskString(value.message),
      stack: value.stack,
    };
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen));
    }

    return sanitizeObject(value as Record<string, unknown>, seen);
  }

  return value;
};
