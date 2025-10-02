import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const APP_NAME = process.env.APP_NAME ?? 'WA-POS-CRM API';
export const PORT = Number(process.env.PORT ?? 3000);
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
export const TOKEN_EXPIRY = process.env.JWT_EXPIRY ?? '12h';
export const COLLECTION_OUTPUT_PATH =
  process.env.POSTMAN_COLLECTION_PATH ??
  path.join(process.cwd(), 'collections', 'wa-pos-crm.postman_collection.json');
export const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@example.com';
export const DEFAULT_ADMIN_PASSWORD =
  process.env.DEFAULT_ADMIN_PASSWORD ?? 'ChangeMe123!';
export const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME ?? 'Default Admin';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
