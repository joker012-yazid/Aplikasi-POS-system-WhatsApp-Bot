import { Router } from 'express';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const deviceSchema = z.object({
  customerId: z.string().uuid().optional(),
  label: z.string().min(1),
  platform: z.string().optional(),
  phoneNumber: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  accessories: z.string().optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const devices = await prisma.device.findMany({
      where: { deleted_at: null },
      include: { customer: true },
      orderBy: { updated_at: 'desc' },
      take: 100,
    });
    res.json({ data: devices });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, deleted_at: null },
      include: { customer: true, tickets: true },
    });

    if (!device) {
      throw new AppError(404, 'Device not found');
    }

    res.json({ data: device });
  }),
);

router.post(
  '/',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(deviceSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof deviceSchema>;

    const device = await prisma.device.create({
      data: {
        customer_id: payload.customerId,
        label: payload.label,
        platform: payload.platform,
        phone_number: payload.phoneNumber,
        status: payload.status,
        category: payload.category,
        brand: payload.brand,
        model: payload.model,
        serial: payload.serial,
        accessories: payload.accessories,
      },
    });

    res.status(201).json({ data: device });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(deviceSchema.partial()),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as Partial<z.infer<typeof deviceSchema>>;

    const existing = await prisma.device.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existing) {
      throw new AppError(404, 'Device not found');
    }

    const updated = await prisma.device.update({
      where: { id },
        data: {
          customer_id: payload.customerId ?? existing.customer_id,
          label: payload.label ?? existing.label,
          platform: payload.platform ?? existing.platform,
          phone_number: payload.phoneNumber ?? existing.phone_number,
          status: payload.status ?? existing.status,
          category: payload.category ?? existing.category,
          brand: payload.brand ?? existing.brand,
          model: payload.model ?? existing.model,
          serial: payload.serial ?? existing.serial,
          accessories: payload.accessories ?? existing.accessories,
        },
      });

    res.json({ data: updated });
  }),
);

export default router;
