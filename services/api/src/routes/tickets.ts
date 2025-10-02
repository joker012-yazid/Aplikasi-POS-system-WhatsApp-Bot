import { Router } from 'express';
import { Prisma, WorkTicketEventType, WorkTicketStatus } from '@prisma/client';
import { z } from 'zod';

import { authorize, getAuthenticatedUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { triggerTicketAcknowledgement, triggerTicketEstimateRequest, triggerTicketPickupThankYou, triggerTicketReadyNotification } from '../services/ticket-hooks.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const intakeSchema = z.object({
  customerId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  intakeForm: z.record(z.any()).optional(),
});

const estimateSchema = z.object({
  price_estimate: z.number().nonnegative(),
  eta_ready_at: z.string().datetime().optional(),
});

const readySchema = z.object({
  photos: z.array(z.string().url()).optional(),
  note: z.string().optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(WorkTicketStatus).refine((value) => value !== WorkTicketStatus.CLOSED, {
    message: 'Status update to CLOSED is not permitted from the kanban board',
  }),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const tickets = await prisma.workTicket.findMany({
      where: { deleted_at: null },
      include: {
        customer: true,
        device: true,
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    res.json({ data: tickets });
  }),
);

router.get(
  '/kanban',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const tickets = await prisma.workTicket.findMany({
      where: { deleted_at: null },
      include: {
        customer: true,
        device: true,
        events: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 6,
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const grouped: Record<WorkTicketStatus, typeof tickets> = {
      NEW: [],
      IN_PROGRESS: [],
      READY: [],
      CLOSED: [],
    };

    tickets.forEach((ticket) => {
      grouped[ticket.status]?.push(ticket);
    });

    res.json({ data: grouped });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ticket = await prisma.workTicket.findFirst({
      where: { id: req.params.id, deleted_at: null },
      include: {
        customer: true,
        device: true,
        invoice: {
          select: {
            id: true,
            number: true,
            status: true,
            total_amount: true,
            due_at: true,
          },
        },
        events: { orderBy: { created_at: 'asc' } },
        intake_forms: true,
      },
    });

    if (!ticket) {
      throw new AppError(404, 'Ticket not found');
    }

    res.json({ data: ticket });
  }),
);

router.post(
  '/intake',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(intakeSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof intakeSchema>;

    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.workTicket.create({
        data: {
          customer_id: payload.customerId,
          device_id: payload.deviceId,
          title: payload.title,
          description: payload.description,
          assignee_id: payload.assigneeId,
          status: WorkTicketStatus.NEW,
        },
        include: {
          customer: true,
          device: true,
        },
      });

      const user = getAuthenticatedUser(req);

      await tx.workTicketEvent.create({
        data: {
          ticket_id: created.id,
          type: 'CREATED',
          payload: {
            intakeForm: payload.intakeForm ?? null,
          },
          note: payload.description,
          author_id: user?.id,
        },
      });

      if (payload.intakeForm) {
        await tx.intakeForm.create({
          data: {
            ticket_id: created.id,
            raw: payload.intakeForm,
          },
        });
      }

      return created;
    });

    res.status(201).json({ data: ticket });

    triggerTicketAcknowledgement(ticket.id).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to trigger WhatsApp acknowledgement', error);
    });
  }),
);

router.patch(
  '/:id/estimate',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(estimateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof estimateSchema>;

    const existing = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existing) {
      throw new AppError(404, 'Ticket not found');
    }

    const user = getAuthenticatedUser(req);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.workTicket.update({
        where: { id },
        data: {
          price_estimate: new Prisma.Decimal(payload.price_estimate),
          eta_ready_at: payload.eta_ready_at ? new Date(payload.eta_ready_at) : null,
          status:
            existing.status === WorkTicketStatus.NEW
              ? WorkTicketStatus.IN_PROGRESS
              : existing.status,
        },
        include: { customer: true, device: true },
      });

      await tx.workTicketEvent.create({
        data: {
          ticket_id: id,
          type: 'ESTIMATE_SET',
          payload: {
            price_estimate: payload.price_estimate,
            eta_ready_at: payload.eta_ready_at ?? null,
          },
          author_id: user?.id,
        },
      });

      return updated;
    });

    res.json({ data: result });

    triggerTicketEstimateRequest(id).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to trigger WhatsApp estimate request', error);
    });
  }),
);

router.post(
  '/:id/ready',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(readySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof readySchema>;

    const existing = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existing) {
      throw new AppError(404, 'Ticket not found');
    }

    const user = getAuthenticatedUser(req);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.workTicket.update({
        where: { id },
        data: {
          status: WorkTicketStatus.READY,
        },
        include: { customer: true, device: true },
      });

      await tx.workTicketEvent.create({
        data: {
          ticket_id: id,
          type: 'READY',
          note: payload.note,
          payload: {
            photos: payload.photos ?? [],
          },
          author_id: user?.id,
        },
      });

      return updated;
    });

    res.json({ data: result });

    triggerTicketReadyNotification(id, payload.photos ?? []).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to trigger WhatsApp ready notification', error);
    });
  }),
);

router.post(
  '/:id/pickup',
  requireAuth,
  authorize(['admin', 'tech']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existing) {
      throw new AppError(404, 'Ticket not found');
    }

    const user = getAuthenticatedUser(req);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.workTicket.update({
        where: { id },
        data: { status: WorkTicketStatus.CLOSED },
        include: { customer: true, device: true },
      });

      await tx.workTicketEvent.create({
        data: {
          ticket_id: id,
          type: WorkTicketEventType.PICKED_UP,
          payload: { previous: existing.status },
          author_id: user?.id,
        },
      });

      return updated;
    });

    res.json({ data: result });

    triggerTicketPickupThankYou(id).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to trigger WhatsApp pickup thank you', error);
    });
  }),
);

router.patch(
  '/:id/status',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof statusSchema>;

    const existing = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
      include: { customer: true, device: true },
    });

    if (!existing) {
      throw new AppError(404, 'Ticket not found');
    }

    if (existing.status === payload.status) {
      return res.json({ data: existing });
    }

    if (payload.status === WorkTicketStatus.READY) {
      throw new AppError(400, 'Use the ready action to mark tickets as READY');
    }

    const user = getAuthenticatedUser(req);

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ticket = await tx.workTicket.update({
        where: { id },
        data: { status: payload.status },
        include: {
          customer: true,
          device: true,
          events: {
            where: { deleted_at: null },
            orderBy: { created_at: 'desc' },
            take: 6,
          },
        },
      });

      await tx.workTicketEvent.create({
        data: {
          ticket_id: id,
          type: WorkTicketEventType.NOTE,
          note: `Status ditukar kepada ${payload.status}`,
          payload: {
            previous: existing.status,
            next: payload.status,
            source: 'kanban-board',
          },
          author_id: user?.id,
        },
      });

      return ticket;
    });

    res.json({ data: updated });
  }),
);

router.post(
  '/:id/request-approval',
  requireAuth,
  authorize(['admin', 'tech']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const ticket = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
      include: { customer: true, device: true },
    });

    if (!ticket) {
      throw new AppError(404, 'Ticket not found');
    }

    const user = getAuthenticatedUser(req);

    const event = await prisma.workTicketEvent.create({
      data: {
        ticket_id: id,
        type: WorkTicketEventType.NOTE,
        note: 'Kelulusan kos diminta melalui WhatsApp bot',
        payload: {
          intent: 'request_approval',
          price_estimate: ticket.price_estimate,
          eta_ready_at: ticket.eta_ready_at,
        },
        author_id: user?.id,
      },
    });

    res.status(202).json({ data: event });
  }),
);

export default router;
