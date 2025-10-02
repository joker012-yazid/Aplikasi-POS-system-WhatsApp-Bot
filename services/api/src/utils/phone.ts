const LEADING_PLUS = /^\+/;
const DIGITS_ONLY = /\d+/g;

const stripFormatting = (value: string) => value.replace(/[\s()-]/g, '');

export const normalizePhoneNumber = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = stripFormatting(value.trim());
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed;
  if (!LEADING_PLUS.test(normalized)) {
    if (normalized.startsWith('00')) {
      normalized = `+${normalized.slice(2)}`;
    } else if (normalized.startsWith('0')) {
      normalized = `+60${normalized.slice(1)}`;
    } else {
      normalized = `+${normalized}`;
    }
  }

  const digits = normalized.match(DIGITS_ONLY)?.join('') ?? '';
  const prefixed = `+${digits}`;

  if (prefixed.length < 10 || prefixed.length > 16) {
    return null;
  }

  return prefixed;
};

export const isValidWhatsAppNumber = (value: string | null | undefined): boolean => {
  const normalized = normalizePhoneNumber(value);
  return Boolean(normalized);
};

