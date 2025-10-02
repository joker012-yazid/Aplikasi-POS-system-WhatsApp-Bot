import { Application, Router } from 'express';

import aiRouter from './ai.js';
import authRouter from './auth.js';
import botRouter from './bot.js';
import campaignsRouter from './campaigns.js';
import customersRouter from './customers.js';
import dashboardRouter from './dashboard.js';
import devicesRouter from './devices.js';
import hooksRouter from './hooks.js';
import posRouter from './pos.js';
import repairsRouter from './repairs.js';
import settingsRouter from './settings.js';
import stockRouter from './stock.js';
import ticketsRouter from './tickets.js';
import publicRouter from './public.js';
import { authRateLimiter, sensitiveRateLimiter } from '../middleware/rate-limit.js';

export const registerRoutes = (app: Application) => {
  const apiRouter = Router();

  apiRouter.use('/ai', aiRouter);
  apiRouter.use('/auth', authRateLimiter, authRouter);
  apiRouter.use('/bot', botRouter);
  apiRouter.use('/public', publicRouter);
  apiRouter.use('/customers', customersRouter);
  apiRouter.use('/devices', devicesRouter);
  apiRouter.use('/dashboard', dashboardRouter);
  apiRouter.use('/hooks', hooksRouter);
  apiRouter.use('/tickets', ticketsRouter);
  apiRouter.use('/repairs', repairsRouter);
  apiRouter.use('/stock', stockRouter);
  apiRouter.use('/pos', sensitiveRateLimiter, posRouter);
  apiRouter.use('/campaigns', sensitiveRateLimiter, campaignsRouter);
  apiRouter.use('/settings', sensitiveRateLimiter, settingsRouter);

  app.use('/api', apiRouter);
};
