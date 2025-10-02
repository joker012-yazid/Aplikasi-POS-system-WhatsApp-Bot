import dotenv from 'dotenv';

dotenv.config();

export const deviceLabel = process.env.WA_DEVICE_LABEL ?? 'WA-POS-CRM Bot';
export const httpPort = process.env.PORT ? Number(process.env.PORT) : 4000;
export const apiBaseUrl = process.env.WA_API_BASE_URL ?? 'http://api:3000';
export const apiEmail = process.env.WA_API_EMAIL ?? '';
export const apiPassword = process.env.WA_API_PASSWORD ?? '';

export const fallbackMessage = 'Tunggu sebentar, teknisyen akan hubungi.';
