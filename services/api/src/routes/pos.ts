import { Router } from 'express';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  productId: z.string().uuid().optional(),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid().optional(),
  number: z.string().min(1),
  status: z.nativeEnum(InvoiceStatus).optional(),
  issued_at: z.string().datetime().optional(),
  due_at: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).default([]),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod).optional(),
  paid_at: z.string().datetime().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

router.get(
  '/invoices',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const invoices = await prisma.invoice.findMany({
      where: { deleted_at: null },
      include: {
        customer: true,
        items: true,
        payments: true,
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    res.json({ data: invoices });
  }),
);

router.post(
  '/invoices',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(invoiceSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof invoiceSchema>;

    const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.invoice.create({
        data: {
          number: payload.number,
          customer_id: payload.customerId,
          status: payload.status ?? InvoiceStatus.SENT,
          issued_at: payload.issued_at ? new Date(payload.issued_at) : new Date(),
          due_at: payload.due_at ? new Date(payload.due_at) : undefined,
          notes: payload.notes,
        },
        include: {
          items: true,
          payments: true,
        },
      });

      if (payload.items.length > 0) {
        const items = await Promise.all(
          payload.items.map((item) =>
            tx.invoiceItem.create({
              data: {
                invoice_id: created.id,
                product_id: item.productId,
                description: item.description,
                quantity: item.quantity,
                unit_price: new Prisma.Decimal(item.unit_price),
                total_price: new Prisma.Decimal(item.unit_price * item.quantity),
              },
            }),
          ),
        );

        const total = items.reduce(
          (sum, item) => sum.plus(item.total_price),
          new Prisma.Decimal(0),
        );

        await tx.invoice.update({
          where: { id: created.id },
          data: {
            total_amount: total,
          },
        });
      }

      return tx.invoice.findUnique({
        where: { id: created.id },
        include: { items: true, payments: true },
      });
    });

    res.status(201).json({ data: invoice });
  }),
);

router.post(
  '/invoices/:id/payments',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(paymentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof paymentSchema>;

    const invoice = await prisma.invoice.findFirst({
      where: { id, deleted_at: null },
    });

    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }

    const payment = await prisma.payment.create({
      data: {
        invoice_id: id,
        amount: new Prisma.Decimal(payload.amount),
        method: payload.method,
        paid_at: payload.paid_at ? new Date(payload.paid_at) : new Date(),
        reference: payload.reference,
        notes: payload.notes,
      },
    });

    const aggregate = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { invoice_id: id, deleted_at: null },
    });

    const totalPaid = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const total = invoice.total_amount ?? new Prisma.Decimal(0);

    let status = invoice.status;
    if (total.gt(0)) {
      if (totalPaid.gte(total)) {
        status = InvoiceStatus.PAID;
      } else if (totalPaid.gt(0)) {
        status = InvoiceStatus.PARTIALLY_PAID;
      }
    }

    await prisma.invoice.update({
      where: { id },
      data: { status },
    });

    res.status(201).json({ data: payment });
  }),
);

export default router;
