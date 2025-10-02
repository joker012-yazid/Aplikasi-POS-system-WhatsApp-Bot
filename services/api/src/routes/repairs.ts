import { Router } from 'express';
import { WorkTicketEventType, WorkTicketStatus } from '@prisma/client';
import { z } from 'zod';

import { authorize, getAuthenticatedUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const noteSchema = z.object({
  type: z.nativeEnum(WorkTicketEventType).default(WorkTicketEventType.NOTE),
  note: z.string().min(1).optional(),
  payload: z.record(z.any()).optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const repairs = await prisma.workTicket.findMany({
      where: {
        deleted_at: null,
        status: { in: [WorkTicketStatus.NEW, WorkTicketStatus.IN_PROGRESS, WorkTicketStatus.READY] },
      },
      include: {
        customer: true,
        device: true,
      },
      orderBy: { created_at: 'asc' },
    });

    res.json({ data: repairs });
  }),
);

router.get(
  '/:id/events',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ticket = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });

    if (!ticket) {
      throw new AppError(404, 'Ticket not found');
    }

    const events = await prisma.workTicketEvent.findMany({
      where: { ticket_id: id, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });

    res.json({ data: events });
  }),
);

router.post(
  '/:id/note',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(noteSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof noteSchema>;

    const ticket = await prisma.workTicket.findFirst({
      where: { id, deleted_at: null },
    });

    if (!ticket) {
      throw new AppError(404, 'Ticket not found');
    }

    const user = getAuthenticatedUser(req);

    const event = await prisma.workTicketEvent.create({
      data: {
        ticket_id: id,
        type: payload.type,
        note: payload.note,
        payload: payload.payload,
        author_id: user?.id,
      },
    });

    res.status(201).json({ data: event });
  }),
);

export default router;
