import { CampaignEventType, ConsentChannel } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { recordRecipientEvent } from '../services/campaign-service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { normalizePhoneNumber } from '../utils/phone.js';

const router = Router();

const auditSchema = z.object({
  messageId: z.string().min(1),
  sender: z.string().min(1),
  intent: z.string().min(1),
  response: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const campaignReplySchema = z.object({
  phone: z.string().min(5),
  messageId: z.string().min(1),
  message: z.string().min(1),
  campaignId: z.string().uuid().optional(),
  timestamp: z.number().int().optional(),
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

router.post(
  '/campaigns/reply',
  requireAuth,
  authorize(['admin', 'tech']),
  validateBody(campaignReplySchema),
  asyncHandler(async (req, res) => {
    const payload = campaignReplySchema.parse(req.body);
    const normalizedPhone = normalizePhoneNumber(payload.phone);

    if (!normalizedPhone) {
      res.status(400).json({ error: 'Invalid phone number' });
      return;
    }

    const whereClause: Parameters<typeof prisma.campaignRecipient.findFirst>[0]['where'] = {
      phone: normalizedPhone,
      deleted_at: null,
    };

    if (payload.campaignId) {
      whereClause.campaign_id = payload.campaignId;
    }

    const recipient = await prisma.campaignRecipient.findFirst({
      where: whereClause,
      orderBy: { scheduled_for: 'desc' },
    });

    if (!recipient) {
      res.json({ data: { handled: false } });
      return;
    }

    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const lowerMessage = payload.message.trim().toLowerCase();

    await recordRecipientEvent(recipient.id, CampaignEventType.REPLIED, timestamp, {
      messageId: payload.messageId,
      message: payload.message,
    });

    let optOut = false;
    if (lowerMessage === 'stop') {
      optOut = true;
      await recordRecipientEvent(recipient.id, CampaignEventType.OPT_OUT, timestamp, {
        messageId: payload.messageId,
      });

      if (recipient.customer_id) {
        await prisma.consent.upsert({
          where: { customer_id_channel: { customer_id: recipient.customer_id, channel: ConsentChannel.whatsapp } },
          create: {
            customer_id: recipient.customer_id,
            channel: ConsentChannel.whatsapp,
            opt_out_at: timestamp,
            opt_in_at: null,
          },
          update: { opt_out_at: timestamp },
        });
      }
    }

    res.json({ data: { handled: true, optOut } });
  }),
);

export default router;
