import { Router } from 'express';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const campaignSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  scheduled_at: z.string().datetime().optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
    res.json({ data: campaigns });
  }),
);

router.post(
  '/',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(campaignSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof campaignSchema>;
    const campaign = await prisma.campaign.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        status: payload.status,
        scheduled_at: payload.scheduled_at ? new Date(payload.scheduled_at) : undefined,
      },
    });

    res.status(201).json({ data: campaign });
  }),
);

export default router;
