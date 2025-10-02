import { Router } from 'express';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const auditSchema = z.object({
  messageId: z.string().min(1),
  sender: z.string().min(1),
  intent: z.string().min(1),
  response: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

router.post(
  '/messages',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(auditSchema),
  asyncHandler(async (req, res) => {
    const payload = auditSchema.parse(req.body);
    const entry = await prisma.auditLog.create({
      data: {
        entity: 'whatsapp_message',
        entity_id: payload.messageId,
        action: payload.intent,
        diff: {
          intent: payload.intent,
          response: payload.response ?? null,
        },
        metadata: {
          sender: payload.sender,
          ...(payload.metadata ?? {}),
        },
      },
    });

    res.status(201).json({ data: entry });
  }),
);

export default router;
