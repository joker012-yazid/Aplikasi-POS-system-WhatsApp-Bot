import { Router } from 'express';
import { InvoiceStatus, WorkTicketEventType } from '@prisma/client';

import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const HOURS_IN_DAY = 24;
const MILLISECONDS_IN_HOUR = 60 * 60 * 1000;

const subtractHours = (date: Date, hours: number) => new Date(date.getTime() - hours * MILLISECONDS_IN_HOUR);

const decimalToNumber = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof (value as { toString?: () => string })?.toString === 'function') {
    const parsed = Number.parseFloat((value as { toString: () => string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const roundCurrency = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const loadCurrency = async () => {
  const invoice = await prisma.invoice.findFirst({
    where: { deleted_at: null },
    select: { currency: true },
    orderBy: { created_at: 'desc' },
  });
  return invoice?.currency ?? 'MYR';
};

router.get(
  '/metrics',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = subtractHours(now, 7 * HOURS_IN_DAY);
    const thirtyDaysAgo = subtractHours(now, 30 * HOURS_IN_DAY);

    const [currency, todaySales, sevenDaySales, thirtyDaySales, todayTickets, sevenDayTickets, thirtyDayTickets, todayCompleted, sevenDayCompleted, thirtyDayCompleted] =
      await Promise.all([
        loadCurrency(),
        prisma.invoice.aggregate({
          where: {
            deleted_at: null,
            status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] },
            created_at: { gte: startOfToday },
            total_amount: { not: null },
          },
          _sum: { total_amount: true },
        }),
        prisma.invoice.aggregate({
          where: {
            deleted_at: null,
            status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] },
            created_at: { gte: sevenDaysAgo },
            total_amount: { not: null },
          },
          _sum: { total_amount: true },
        }),
        prisma.invoice.aggregate({
          where: {
            deleted_at: null,
            status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] },
            created_at: { gte: thirtyDaysAgo },
            total_amount: { not: null },
          },
          _sum: { total_amount: true },
        }),
        prisma.workTicket.count({
          where: { deleted_at: null, created_at: { gte: startOfToday } },
        }),
        prisma.workTicket.count({
          where: { deleted_at: null, created_at: { gte: sevenDaysAgo } },
        }),
        prisma.workTicket.count({
          where: { deleted_at: null, created_at: { gte: thirtyDaysAgo } },
        }),
        prisma.workTicketEvent.count({
          where: {
            deleted_at: null,
            type: WorkTicketEventType.READY,
            created_at: { gte: startOfToday },
          },
        }),
        prisma.workTicketEvent.count({
          where: {
            deleted_at: null,
            type: WorkTicketEventType.READY,
            created_at: { gte: sevenDaysAgo },
          },
        }),
        prisma.workTicketEvent.count({
          where: {
            deleted_at: null,
            type: WorkTicketEventType.READY,
            created_at: { gte: thirtyDaysAgo },
          },
        }),
      ]);

    res.json({
      data: {
        currency,
        today: {
          salesTotal: roundCurrency(decimalToNumber(todaySales._sum.total_amount)),
          newTickets: todayTickets,
          completedTickets: todayCompleted,
        },
        last7Days: {
          salesTotal: roundCurrency(decimalToNumber(sevenDaySales._sum.total_amount)),
          newTickets: sevenDayTickets,
          completedTickets: sevenDayCompleted,
        },
        last30Days: {
          salesTotal: roundCurrency(decimalToNumber(thirtyDaySales._sum.total_amount)),
          newTickets: thirtyDayTickets,
          completedTickets: thirtyDayCompleted,
        },
        generatedAt: now.toISOString(),
      },
    });
  }),
);

export default router;
