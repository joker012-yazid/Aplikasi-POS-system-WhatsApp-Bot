import { Router } from 'express';
import {
  InvoiceStatus,
  InventoryMoveType,
  PaymentMethod,
  Prisma,
  ProductType,
} from '@prisma/client';
import { z } from 'zod';

import {
  buildMyInvoisArtifacts,
  loadMyInvoisConfig,
  type ResolvedMyInvoisConfig,
} from '../adapters/einvoice/myinvois.js';
import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';
import { PUBLIC_WEB_APP_URL } from '../config.js';
import { getStockForProducts } from '../services/inventory-service.js';
import { invoiceInclude, type InvoiceWithRelations } from '../types/invoice.js';

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

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative().optional(),
  useWholesale: z.boolean().optional(),
  discount: z.number().nonnegative().optional(),
  label: z.string().optional(),
});

const saleSchema = z.object({
  customerId: z.string().uuid().optional(),
  invoiceNumber: z.string().min(1).optional(),
  notes: z.string().optional(),
  offlineId: z.string().optional(),
  overallDiscount: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  items: z.array(saleItemSchema).min(1),
  payments: z.array(paymentSchema).optional(),
});

const asDecimal = (value?: number | Prisma.Decimal | null) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
};

const decimalToNumber = (value?: Prisma.Decimal | null) => {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
};

const normaliseUrl = (base: string, path: string) => {
  const normalisedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalisedBase}${path}`;
};

const buildInvoiceResponse = (invoice: InvoiceWithRelations) => {
  const subtotalFromMetadata =
    typeof invoice.metadata?.subtotal === 'number'
      ? invoice.metadata.subtotal
      : invoice.items.reduce(
          (sum, item) => sum + decimalToNumber(item.total_price),
          0,
        );

  const grossSubtotalFromMetadata =
    typeof invoice.metadata?.gross_subtotal === 'number'
      ? invoice.metadata.gross_subtotal
      : subtotalFromMetadata;

  const taxAmountFromMetadata =
    typeof invoice.metadata?.tax_amount === 'number'
      ? invoice.metadata.tax_amount
      : 0;

  const discountTotalFromMetadata =
    typeof invoice.metadata?.discount_total === 'number'
      ? invoice.metadata.discount_total
      : 0;

  const taxRateFromMetadata =
    typeof invoice.metadata?.tax_rate === 'number' ? invoice.metadata.tax_rate : 0;

  const totalAmount = decimalToNumber(invoice.total_amount);
  const totalPaid = invoice.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );

  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issued_at: invoice.issued_at,
    due_at: invoice.due_at,
    notes: invoice.notes,
    customer: invoice.customer,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: decimalToNumber(item.unit_price),
      total_price: decimalToNumber(item.total_price),
      product_id: item.product_id,
      metadata: item.metadata ?? undefined,
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: decimalToNumber(payment.amount),
      method: payment.method,
      paid_at: payment.paid_at,
      reference: payment.reference,
      notes: payment.notes,
    })),
    totals: {
      gross_subtotal: grossSubtotalFromMetadata,
      subtotal: subtotalFromMetadata,
      discount_total: discountTotalFromMetadata,
      tax_amount: taxAmountFromMetadata,
      tax_rate: taxRateFromMetadata,
      total: totalAmount,
      total_paid: totalPaid,
      balance_due: Math.max(totalAmount - totalPaid, 0),
    },
    metadata: invoice.metadata,
    qr_url: normaliseUrl(PUBLIC_WEB_APP_URL, `/invoices/${invoice.id}`),
  };
};

const composeInvoiceResponse = async (
  invoice: InvoiceWithRelations,
  config: ResolvedMyInvoisConfig,
) => {
  const base = buildInvoiceResponse(invoice);
  const einvoice = await buildMyInvoisArtifacts(invoice, { config });
  return { ...base, einvoice };
};

router.get(
  '/invoices',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const invoices = await prisma.invoice.findMany({
      where: { deleted_at: null },
      include: invoiceInclude,
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    const config = await loadMyInvoisConfig();
    const data = await Promise.all(
      invoices.map((invoice) => composeInvoiceResponse(invoice, config)),
    );

    res.json({ data });
  }),
);

router.get(
  '/invoices/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, deleted_at: null },
      include: invoiceInclude,
    });

    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }

    const config = await loadMyInvoisConfig();
    const payload = await composeInvoiceResponse(invoice, config);

    res.json({ data: payload });
  }),
);

router.post(
  '/invoices',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(invoiceSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof invoiceSchema>;
    const config = await loadMyInvoisConfig();

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
      });

      let subtotal = new Prisma.Decimal(0);

      if (payload.items.length > 0) {
        for (const item of payload.items) {
          const unitPrice = new Prisma.Decimal(item.unit_price);
          const totalPrice = unitPrice.mul(item.quantity);
          subtotal = subtotal.plus(totalPrice);

          await tx.invoiceItem.create({
            data: {
              invoice_id: created.id,
              product_id: item.productId,
              description: item.description,
              quantity: item.quantity,
              unit_price: unitPrice,
              total_price: totalPrice,
              metadata: { discount: 0 },
            },
          });
        }
      }

      const updated = await tx.invoice.update({
        where: { id: created.id },
        data: {
          total_amount: subtotal,
          metadata: {
            gross_subtotal: Number(subtotal),
            subtotal: Number(subtotal),
            discount_total: 0,
            tax_amount: 0,
            tax_rate: 0,
          },
        },
        include: invoiceInclude,
      });

      return updated;
    });

    const response = await composeInvoiceResponse(invoice, config);

    res.status(201).json({ data: response });
  }),
);

const saleProductInclude = {
  parent: true,
  bundleItems: {
    include: {
      component: true,
    },
  },
} satisfies Prisma.ProductInclude;

router.post(
  '/sales',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(saleSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof saleSchema>;
    const config = await loadMyInvoisConfig();

    const invoiceNumber =
      payload.invoiceNumber ?? `POS-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

    const existingInvoice = await prisma.invoice.findFirst({
      where: { number: invoiceNumber, deleted_at: null },
      include: invoiceInclude,
    });

    if (existingInvoice) {
      const existingResponse = await composeInvoiceResponse(existingInvoice, config);
      res.status(200).json({ data: existingResponse });
      return;
    }

    const productIds = payload.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deleted_at: null },
      include: saleProductInclude,
    });

    if (products.length !== productIds.length) {
      throw new AppError(400, 'Produk jualan tidak lengkap atau sudah dipadam');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const stockIds = new Set<string>();

    products.forEach((product) => {
      if (product.type === ProductType.BUNDLE) {
        product.bundleItems.forEach((item) => {
          stockIds.add(item.component_id);
        });
      } else {
        stockIds.add(product.id);
      }
    });

    const stock = await getStockForProducts(Array.from(stockIds));

    type SaleLine = {
      productId: string;
      description: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      total: Prisma.Decimal;
      metadata: Record<string, unknown>;
    };

    const saleLines: SaleLine[] = [];
    const inventoryAdjustments = new Map<string, number>();

    let grossSubtotal = new Prisma.Decimal(0);
    let netSubtotal = new Prisma.Decimal(0);
    let lineDiscountTotal = new Prisma.Decimal(0);

    for (const item of payload.items) {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new AppError(404, 'Produk tidak dijumpai');
      }

      const quantity = item.quantity;

      if (product.type === ProductType.BUNDLE) {
        if (product.bundleItems.length === 0) {
          throw new AppError(400, `Bundle ${product.name} belum mempunyai komponen`);
        }

        for (const component of product.bundleItems) {
          const available = stock.get(component.component_id) ?? 0;
          const required = component.quantity * quantity;

          if (available < required) {
            throw new AppError(
              400,
              `Stok komponen ${component.component.name} tidak mencukupi untuk bundle ${product.name}`,
            );
          }

          stock.set(component.component_id, available - required);
          inventoryAdjustments.set(
            component.component_id,
            (inventoryAdjustments.get(component.component_id) ?? 0) + required,
          );
        }
      } else {
        const available = stock.get(product.id) ?? 0;
        if (available < quantity) {
          throw new AppError(
            400,
            `Stok ${product.name} tidak mencukupi. Baki semasa ${available}`,
          );
        }

        stock.set(product.id, available - quantity);
        inventoryAdjustments.set(
          product.id,
          (inventoryAdjustments.get(product.id) ?? 0) + quantity,
        );
      }

      const basePrice =
        asDecimal(item.unit_price) ??
        (item.useWholesale
          ? asDecimal(product.wholesale_price) ??
            asDecimal(product.parent?.wholesale_price) ??
            asDecimal(product.price) ??
            asDecimal(product.parent?.price)
          : asDecimal(product.price) ??
            asDecimal(product.parent?.price) ??
            asDecimal(product.wholesale_price) ??
            asDecimal(product.parent?.wholesale_price));

      if (!basePrice) {
        throw new AppError(400, `Harga tidak ditetapkan untuk ${product.name}`);
      }

      const lineDiscount = asDecimal(item.discount ?? 0) ?? new Prisma.Decimal(0);
      const lineSubtotal = basePrice.mul(quantity);
      const lineTotal = lineSubtotal.minus(lineDiscount);
      const netLine = lineTotal.lt(0) ? new Prisma.Decimal(0) : lineTotal;

      grossSubtotal = grossSubtotal.plus(lineSubtotal);
      netSubtotal = netSubtotal.plus(netLine);
      lineDiscountTotal = lineDiscountTotal.plus(lineDiscount);

      saleLines.push({
        productId: product.id,
        description: item.label ?? product.name,
        quantity,
        unitPrice: basePrice,
        total: netLine,
        metadata: {
          discount: decimalToNumber(lineDiscount),
          useWholesale: item.useWholesale ?? false,
        },
      });
    }

    const overallDiscount = asDecimal(payload.overallDiscount ?? 0) ?? new Prisma.Decimal(0);
    const discountTotal = lineDiscountTotal.plus(overallDiscount);

    let amountDue = netSubtotal.minus(overallDiscount);
    if (amountDue.lt(0)) {
      amountDue = new Prisma.Decimal(0);
    }

    let taxAmount = new Prisma.Decimal(0);
    if (payload.taxRate) {
      taxAmount = amountDue.mul(payload.taxRate);
      amountDue = amountDue.plus(taxAmount);
    }

    const metadata = {
      gross_subtotal: Number(grossSubtotal),
      subtotal: Number(netSubtotal),
      line_discount_total: Number(lineDiscountTotal),
      overall_discount: Number(overallDiscount),
      discount_total: Number(discountTotal),
      tax_rate: payload.taxRate ?? 0,
      tax_amount: Number(taxAmount),
      offline_id: payload.offlineId ?? null,
    };

    const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          customer_id: payload.customerId,
          status: InvoiceStatus.SENT,
          issued_at: new Date(),
          notes: payload.notes,
          metadata,
        },
      });

      for (const line of saleLines) {
        await tx.invoiceItem.create({
          data: {
            invoice_id: created.id,
            product_id: line.productId,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            total_price: line.total,
            metadata: line.metadata,
          },
        });
      }

      await Promise.all(
        Array.from(inventoryAdjustments.entries()).map(([productId, quantity]) =>
          tx.inventoryMove.create({
            data: {
              product_id: productId,
              type: InventoryMoveType.OUT,
              quantity,
              reference: invoiceNumber,
              notes: payload.notes,
            },
          }),
        ),
      );

      let payments = payload.payments;
      if (!payments || payments.length === 0) {
        payments = [
          {
            amount: Number(amountDue),
            method: PaymentMethod.CASH,
            paid_at: new Date().toISOString(),
            reference: `POS-${invoiceNumber}`,
            notes: payload.notes,
          },
        ];
      }

      const recordedPayments = await Promise.all(
        payments.map((payment) =>
          tx.payment.create({
            data: {
              invoice_id: created.id,
              amount: new Prisma.Decimal(payment.amount),
              method: payment.method,
              paid_at: payment.paid_at ? new Date(payment.paid_at) : new Date(),
              reference: payment.reference,
              notes: payment.notes,
            },
          }),
        ),
      );

      const totalPaid = recordedPayments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );

      const status = totalPaid.gte(amountDue)
        ? InvoiceStatus.PAID
        : totalPaid.gt(0)
          ? InvoiceStatus.PARTIALLY_PAID
          : InvoiceStatus.SENT;

      const updated = await tx.invoice.update({
        where: { id: created.id },
        data: {
          status,
          total_amount: amountDue,
          metadata: {
            ...metadata,
            total_paid: Number(totalPaid),
          },
        },
        include: invoiceInclude,
      });

      return updated;
    });

    const response = await composeInvoiceResponse(invoice, config);

    res.status(201).json({ data: response });
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
