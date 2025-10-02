import type { Prisma } from '@prisma/client';

export const invoiceInclude = {
  customer: true,
  items: {
    include: {
      product: true,
    },
  },
  payments: true,
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: typeof invoiceInclude;
}>;
