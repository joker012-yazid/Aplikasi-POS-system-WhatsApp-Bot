import fs from 'fs';
import path from 'path';
import { Application } from 'express';
import listEndpoints from 'express-list-endpoints';

import { APP_NAME, COLLECTION_OUTPUT_PATH } from '../config.js';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export const generatePostmanCollection = (
  app: Application,
  outputPath: string = COLLECTION_OUTPUT_PATH,
) => {
  const endpoints = listEndpoints(app);

  const items = endpoints.flatMap((endpoint) =>
    endpoint.methods
      .filter((method) => method !== 'HEAD' && method !== 'OPTIONS')
      .map((method) => {
        const pathSegments = endpoint.path.split('/').filter(Boolean);
        const requiresAuth = !['/auth/login', '/healthz', '/public'].some((openPath) =>
          endpoint.path.startsWith(openPath),
        );
        return {
          name: `${method} ${endpoint.path}`,
          request: {
            method,
            header: requiresAuth
              ? [
                  {
                    key: 'Authorization',
                    value: 'Bearer {{token}}',
                    type: 'text',
                  },
                ]
              : [],
            url: {
              raw: `{{baseUrl}}${endpoint.path}`,
              host: ['{{baseUrl}}'],
              path: pathSegments,
            },
            ...(BODY_METHODS.has(method)
              ? {
                  body: {
                    mode: 'raw',
                    raw: JSON.stringify({}, null, 2),
                    options: { raw: { language: 'json' } },
                  },
                }
              : {}),
          },
        };
      }),
  );

  const collection = {
    info: {
      name: `${APP_NAME} Collection`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'Auto-generated Postman collection for WA-POS-CRM API routes.',
    },
    item: items,
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3000' },
      { key: 'token', value: '' },
    ],
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
};
