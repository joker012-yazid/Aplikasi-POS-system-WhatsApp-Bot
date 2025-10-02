import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().optional(),
});

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

router.get(
  '/',
  requireAuth,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { q } = req.query as z.infer<typeof searchSchema>;
    const where: Prisma.CustomerWhereInput = {
      deleted_at: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const customers = await prisma.customer.findMany({
      where,
      include: {
        devices: { where: { deleted_at: null } },
        tickets: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    res.json({ data: customers });
  }),
);

router.post(
  '/',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(customerSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof customerSchema>;
    const customer = await prisma.customer.create({ data: payload });
    res.status(201).json({ data: customer });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await prisma.customer.findFirst({
      where: { id, deleted_at: null },
      include: {
        devices: { where: { deleted_at: null } },
        tickets: { where: { deleted_at: null }, orderBy: { created_at: 'desc' } },
        invoices: { where: { deleted_at: null } },
      },
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found');
    }

    res.json({ data: customer });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(customerSchema.partial()),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body as Partial<z.infer<typeof customerSchema>>;
    const existing = await prisma.customer.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existing) {
      throw new AppError(404, 'Customer not found');
    }

    const updated = await prisma.customer.update({
      where: { id },
      data,
    });

    res.json({ data: updated });
  }),
);

export default router;
