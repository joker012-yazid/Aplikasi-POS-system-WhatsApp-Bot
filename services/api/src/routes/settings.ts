import { Router } from 'express';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const settingSchema = z.object({
  value: z.any(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = await prisma.setting.findMany({
      where: { deleted_at: null },
      orderBy: { key: 'asc' },
    });
    res.json({ data: settings });
  }),
);

router.get(
  '/:key',
  requireAuth,
  asyncHandler(async (req, res) => {
    const setting = await prisma.setting.findFirst({
      where: { key: req.params.key, deleted_at: null },
    });

    if (!setting) {
      throw new AppError(404, 'Setting not found');
    }

    res.json({ data: setting });
  }),
);

router.put(
  '/:key',
  requireAuth,
  authorize(['admin']),
  validateBody(settingSchema),
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const payload = req.body as z.infer<typeof settingSchema>;

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: payload.value },
      create: { key, value: payload.value },
    });

    res.json({ data: setting });
  }),
);

export default router;
