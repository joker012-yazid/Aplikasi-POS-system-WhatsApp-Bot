import { Router } from 'express';
import { InventoryMoveType, Prisma, ProductType } from '@prisma/client';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';
import {
  calculateBundleStock,
  getStockForProducts,
} from '../services/inventory-service.js';

const router = Router();

const moneySchema = z.number().nonnegative().nullable().optional();

const variantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: moneySchema,
  wholesale_price: moneySchema,
  min_stock: z.number().int().nonnegative().default(0),
  is_active: z.boolean().optional(),
});

const bundleItemSchema = z.object({
  componentId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const productCreateSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: moneySchema,
  wholesale_price: moneySchema,
  currency: z.string().optional(),
  min_stock: z.number().int().nonnegative().default(0),
  is_active: z.boolean().optional(),
  type: z.nativeEnum(ProductType).default(ProductType.SIMPLE),
  variants: z.array(variantSchema).optional(),
  bundle_items: z.array(bundleItemSchema).optional(),
});

const productUpdateSchema = productCreateSchema.extend({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.nativeEnum(ProductType).optional(),
});

const inventorySchema = z.object({
  productId: z.string().uuid(),
  type: z.nativeEnum(InventoryMoveType),
  quantity: z.number().int(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const productInclude = {
  variants: {
    where: { deleted_at: null },
    orderBy: { name: 'asc' },
  },
  bundleItems: {
    include: {
      component: true,
    },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

const toDecimal = (value?: number | null) => {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  return new Prisma.Decimal(value);
};

const toNumber = (value?: Prisma.Decimal | null) => {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
};

const buildProductResponse = (
  product: ProductWithRelations,
  stock: Map<string, number>,
) => {
  const variants = product.variants.map((variant) => {
    const qty = stock.get(variant.id) ?? 0;
    const isLow = variant.min_stock > 0 && qty <= variant.min_stock;
    return {
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      description: variant.description,
      price: toNumber(variant.price),
      wholesale_price: toNumber(variant.wholesale_price),
      min_stock: variant.min_stock,
      currency: variant.currency,
      is_active: variant.is_active,
      stock_on_hand: qty,
      low_stock: isLow,
    };
  });

  const bundleComponents = product.bundleItems
    .filter((item) => !item.component.deleted_at)
    .map((item) => ({
      id: item.id,
      componentId: item.component_id,
      quantity: item.quantity,
      component: {
        id: item.component.id,
        sku: item.component.sku,
        name: item.component.name,
        stock_on_hand: stock.get(item.component.id) ?? 0,
        min_stock: item.component.min_stock,
      },
    }));

  const bundleStock = calculateBundleStock(
    bundleComponents.map((item) => ({
      componentId: item.componentId,
      quantity: item.quantity,
    })),
    stock,
  );

  const quantity =
    product.type === ProductType.BUNDLE
      ? bundleStock
      : stock.get(product.id) ?? 0;
  const isLow = product.min_stock > 0 && quantity <= product.min_stock;

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: toNumber(product.price),
    wholesale_price: toNumber(product.wholesale_price),
    currency: product.currency,
    min_stock: product.min_stock,
    type: product.type,
    is_active: product.is_active,
    stock_on_hand: quantity,
    low_stock: isLow,
    variants,
    bundle_items: bundleComponents,
  };
};

router.get(
  '/products',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      where: { deleted_at: null, parent_id: null },
      orderBy: { name: 'asc' },
      include: productInclude,
    });

    const productIds = new Set<string>();
    products.forEach((product) => {
      productIds.add(product.id);
      product.variants.forEach((variant) => {
        productIds.add(variant.id);
      });
      product.bundleItems.forEach((item) => {
        productIds.add(item.component_id);
      });
    });

    const stock = await getStockForProducts(Array.from(productIds));

    res.json({
      data: products.map((product) => buildProductResponse(product, stock)),
    });
  }),
);

router.post(
  '/products',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(productCreateSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof productCreateSchema>;

    const existing = await prisma.product.findFirst({
      where: { sku: payload.sku, deleted_at: null },
    });

    if (existing) {
      throw new AppError(409, 'Product with this SKU already exists');
    }

    if (payload.variants) {
      const variantSkus = new Set<string>();
      for (const variant of payload.variants) {
        if (variantSkus.has(variant.sku)) {
          throw new AppError(400, 'Duplicate variant SKU detected');
        }
        variantSkus.add(variant.sku);

        const variantExists = await prisma.product.findFirst({
          where: { sku: variant.sku, deleted_at: null },
        });

        if (variantExists) {
          throw new AppError(409, `Variant SKU ${variant.sku} already exists`);
        }
      }
    }

    if (payload.type !== ProductType.BUNDLE && payload.bundle_items?.length) {
      throw new AppError(400, 'Only bundle products may include components');
    }

    if (
      payload.type === ProductType.BUNDLE &&
      payload.bundle_items &&
      payload.bundle_items.length > 0
    ) {
      const seenComponents = new Set<string>();
      for (const item of payload.bundle_items) {
        if (!item.componentId) {
          throw new AppError(400, 'Bundle component ID diperlukan');
        }
        if (seenComponents.has(item.componentId)) {
          throw new AppError(400, 'Duplicate component in bundle');
        }
        seenComponents.add(item.componentId);

        const component = await prisma.product.findFirst({
          where: { id: item.componentId, deleted_at: null },
        });

        if (!component) {
          throw new AppError(404, 'Bundle component not found');
        }
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: payload.sku,
          name: payload.name,
          description: payload.description,
          price: toDecimal(payload.price),
          wholesale_price: toDecimal(payload.wholesale_price),
          currency: payload.currency,
          min_stock: payload.min_stock,
          is_active: payload.is_active ?? true,
          type: payload.type,
        },
      });

      if (payload.variants?.length) {
        await Promise.all(
          payload.variants.map((variant) =>
            tx.product.create({
              data: {
                sku: variant.sku,
                name: variant.name,
                description: variant.description,
                price: toDecimal(variant.price),
                wholesale_price: toDecimal(variant.wholesale_price),
                currency: created.currency,
                min_stock: variant.min_stock,
                is_active: variant.is_active ?? true,
                type: ProductType.VARIANT,
                parent_id: created.id,
              },
            }),
          ),
        );
      }

      if (
        payload.type === ProductType.BUNDLE &&
        payload.bundle_items &&
        payload.bundle_items.length > 0
      ) {
        await Promise.all(
          payload.bundle_items.map((item) =>
            tx.productBundleItem.create({
              data: {
                bundle_id: created.id,
                component_id: item.componentId,
                quantity: item.quantity,
              },
            }),
          ),
        );
      }

      return tx.product.findUniqueOrThrow({
        where: { id: created.id },
        include: productInclude,
      });
    });

    const stock = await getStockForProducts([
      product.id,
      ...product.variants.map((variant) => variant.id),
      ...product.bundleItems.map((item) => item.component_id),
    ]);

    res.status(201).json({ data: buildProductResponse(product, stock) });
  }),
);

router.put(
  '/products/:id',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(productUpdateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof productUpdateSchema>;

    const product = await prisma.product.findFirst({
      where: { id, deleted_at: null },
      include: { variants: true },
    });

    if (!product) {
      throw new AppError(404, 'Product not found');
    }

    if (payload.sku && payload.sku !== product.sku) {
      const skuExists = await prisma.product.findFirst({
        where: { sku: payload.sku, deleted_at: null, NOT: { id } },
      });

      if (skuExists) {
        throw new AppError(409, 'Product with this SKU already exists');
      }
    }

    if (payload.variants) {
      const variantSkus = new Set<string>();
      for (const variant of payload.variants) {
        if (variantSkus.has(variant.sku)) {
          throw new AppError(400, 'Duplicate variant SKU detected');
        }
        variantSkus.add(variant.sku);

        const existingVariant = await prisma.product.findFirst({
          where: {
            sku: variant.sku,
            deleted_at: null,
            NOT: { parent_id: id },
          },
        });

        if (existingVariant) {
          throw new AppError(409, `Variant SKU ${variant.sku} already exists`);
        }
      }
    }

    const effectiveType = payload.type ?? product.type;

    if (payload.bundle_items) {
      if (effectiveType !== ProductType.BUNDLE && payload.bundle_items.length > 0) {
        throw new AppError(400, 'Only bundle products may include components');
      }

      const seen = new Set<string>();
      for (const item of payload.bundle_items) {
        if (!item.componentId) {
          throw new AppError(400, 'Bundle component ID diperlukan');
        }
        if (seen.has(item.componentId)) {
          throw new AppError(400, 'Duplicate component in bundle');
        }
        seen.add(item.componentId);

        if (item.componentId === id) {
          throw new AppError(400, 'Bundle cannot reference itself');
        }

        const component = await prisma.product.findFirst({
          where: { id: item.componentId, deleted_at: null },
        });

        if (!component) {
          throw new AppError(404, 'Bundle component not found');
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          sku: payload.sku,
          name: payload.name,
          description: payload.description,
          price: payload.price !== undefined ? toDecimal(payload.price) : undefined,
          wholesale_price:
            payload.wholesale_price !== undefined
              ? toDecimal(payload.wholesale_price)
              : undefined,
          currency: payload.currency,
          min_stock: payload.min_stock,
          is_active: payload.is_active,
          type: payload.type,
        },
      });

      if (payload.variants) {
        await tx.product.updateMany({
          where: { parent_id: id },
          data: { deleted_at: new Date() },
        });

        await Promise.all(
          payload.variants.map((variant) =>
            tx.product.create({
              data: {
                sku: variant.sku,
                name: variant.name,
                description: variant.description,
                price: toDecimal(variant.price),
                wholesale_price: toDecimal(variant.wholesale_price),
                currency: payload.currency ?? product.currency,
                min_stock: variant.min_stock,
                is_active: variant.is_active ?? true,
                type: ProductType.VARIANT,
                parent_id: id,
              },
            }),
          ),
        );
      }

      if (payload.bundle_items) {
        await tx.productBundleItem.deleteMany({ where: { bundle_id: id } });

        await Promise.all(
          payload.bundle_items.map((item) =>
            tx.productBundleItem.create({
              data: {
                bundle_id: id,
                component_id: item.componentId,
                quantity: item.quantity,
              },
            }),
          ),
        );
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: productInclude,
      });
    });

    const productIds = [
      updated.id,
      ...updated.variants.map((variant) => variant.id),
      ...updated.bundleItems.map((item) => item.component_id),
    ];

    const stock = await getStockForProducts(productIds);

    res.json({ data: buildProductResponse(updated, stock) });
  }),
);

router.delete(
  '/products/:id',
  requireAuth,
  authorize(['admin', 'tech']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: { id, deleted_at: null },
    });

    if (!product) {
      throw new AppError(404, 'Product not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: { deleted_at: new Date(), is_active: false },
      });

      await tx.product.updateMany({
        where: { parent_id: id },
        data: { deleted_at: new Date(), is_active: false },
      });

      await tx.productBundleItem.deleteMany({ where: { bundle_id: id } });
    });

    res.status(204).send();
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
