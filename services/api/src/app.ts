import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'api' });
  });

  app.get('/', (_req, res) => {
    res.json({ message: 'WA-POS-CRM API' });
  });

  registerRoutes(app);

  app.use(errorHandler);

  return app;
};
