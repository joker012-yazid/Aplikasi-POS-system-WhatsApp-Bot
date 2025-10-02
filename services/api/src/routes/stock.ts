import { Router } from 'express';
import { InventoryMoveType, Prisma } from '@prisma/client';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().optional(),
});

const inventorySchema = z.object({
  productId: z.string().uuid(),
  type: z.nativeEnum(InventoryMoveType),
  quantity: z.number().int(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

router.get(
  '/products',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      where: { deleted_at: null },
      orderBy: { name: 'asc' },
    });
    res.json({ data: products });
  }),
);

router.post(
  '/products',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof productSchema>;

    const existing = await prisma.product.findFirst({
      where: { sku: payload.sku, deleted_at: null },
    });

    if (existing) {
      throw new AppError(409, 'Product with this SKU already exists');
    }

    const product = await prisma.product.create({
      data: {
        sku: payload.sku,
        name: payload.name,
        description: payload.description,
        price: payload.price !== undefined ? new Prisma.Decimal(payload.price) : undefined,
        currency: payload.currency,
      },
    });

    res.status(201).json({ data: product });
  }),
);

router.get(
  '/inventory-moves',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const moves = await prisma.inventoryMove.findMany({
      where: { deleted_at: null },
      include: { product: true },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    res.json({ data: moves });
  }),
);

router.post(
  '/inventory-moves',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(inventorySchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof inventorySchema>;

    const product = await prisma.product.findFirst({
      where: { id: payload.productId, deleted_at: null },
    });

    if (!product) {
      throw new AppError(404, 'Product not found');
    }

    const move = await prisma.inventoryMove.create({
      data: {
        product_id: payload.productId,
        type: payload.type,
        quantity: payload.quantity,
        reference: payload.reference,
        notes: payload.notes,
      },
    });

    res.status(201).json({ data: move });
  }),
);

export default router;
