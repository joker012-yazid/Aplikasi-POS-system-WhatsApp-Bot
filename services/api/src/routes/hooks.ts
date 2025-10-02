import { Router } from 'express';

import { authorize, requireAuth } from '../middleware/auth.js';
import { processReadyFollowUps } from '../services/ticket-hooks.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post(
  '/tickets/follow-ups/run',
  requireAuth,
  authorize(['admin', 'tech']),
  asyncHandler(async (_req, res) => {
    const summary = await processReadyFollowUps();
    res.json({ data: summary });
  }),
);

export default router;
