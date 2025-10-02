import { CampaignEventType, CampaignStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authorize, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import {
  exportRecipientsCsv,
  getCampaignMetrics,
  importRecipients,
  recordRecipientEvent,
  upsertSegment,
} from '../services/campaign-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const extractTemplateVariables = (template: string | null | undefined) => {
  if (!template) {
    return [] as string[];
  }

  const matches = template.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  if (!matches) {
    return [] as string[];
  }

  const set = new Set<string>();
  for (const match of matches) {
    const key = match.replace(/\{\{|\}\}/g, '').trim();
    if (key) {
      set.add(key);
    }
  }

  return Array.from(set);
};

const campaignSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
  scheduled_at: z.string().datetime().optional(),
  template_body: z.string().optional(),
});

const campaignUpdateSchema = campaignSchema.partial();

const importSchema = z.object({
  segment: z.object({
    key: z.string().min(1),
    name: z.string().optional(),
    timezone: z.string().optional(),
    throttlePerMinute: z.number().int().positive().max(120).optional(),
    jitterSeconds: z.number().int().min(0).max(900).optional(),
    dailyCap: z.number().int().min(0).optional(),
    windowStartHour: z.number().int().min(0).max(23).nullable().optional(),
    windowEndHour: z.number().int().min(0).max(23).nullable().optional(),
  }),
  recipients: z
    .array(
      z.object({
        customerId: z.string().uuid().optional(),
        phone: z.string().optional(),
        name: z.string().optional(),
        variables: z.record(z.string()).optional(),
      }),
    )
    .min(1),
});

const recipientEventSchema = z.object({
  type: z.enum(['sent', 'delivered', 'read', 'replied', 'opt_out', 'error']),
  timestamp: z.string().datetime().optional(),
  payload: z.record(z.any()).optional(),
});

router.get(
  '/',
  requireAuth,
  authorize(['admin', 'cashier']),
  asyncHandler(async (_req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
    res.json({ data: campaigns });
  }),
);

router.get(
  '/:id',
  requireAuth,
  authorize(['admin', 'cashier']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, deleted_at: null },
      include: { segments: { where: { deleted_at: null }, orderBy: { created_at: 'asc' } } },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    res.json({ data: campaign });
  }),
);

router.post(
  '/',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(campaignSchema),
  asyncHandler(async (req, res) => {
    const payload = campaignSchema.parse(req.body);
    const variables = extractTemplateVariables(payload.template_body);
    const campaign = await prisma.campaign.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        status: payload.status ?? CampaignStatus.DRAFT,
        scheduled_at: payload.scheduled_at ? new Date(payload.scheduled_at) : undefined,
        template_body: payload.template_body ?? null,
        template_variables: variables,
      },
    });

    res.status(201).json({ data: campaign });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(campaignUpdateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = campaignUpdateSchema.parse(req.body);

    const data: Record<string, unknown> = {};
    if (payload.name) {
      data.name = payload.name;
    }
    if (payload.slug !== undefined) {
      data.slug = payload.slug ?? null;
    }
    if (payload.description !== undefined) {
      data.description = payload.description ?? null;
    }
    if (payload.status) {
      data.status = payload.status;
    }
    if (payload.scheduled_at) {
      data.scheduled_at = new Date(payload.scheduled_at);
    }
    if (payload.template_body !== undefined) {
      data.template_body = payload.template_body ?? null;
      data.template_variables = extractTemplateVariables(payload.template_body ?? null);
    }

    if (Object.keys(data).length === 0) {
      const current = await prisma.campaign.findUnique({ where: { id } });
      res.json({ data: current });
      return;
    }

    const campaign = await prisma.campaign.update({ where: { id }, data });
    res.json({ data: campaign });
  }),
);

router.post(
  '/:id/import',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(importSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = importSchema.parse(req.body);

    const campaign = await prisma.campaign.findFirst({ where: { id, deleted_at: null } });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const segment = await upsertSegment(id, payload.segment, prisma);
    const summary = await importRecipients(campaign, segment, payload.recipients);

    res.status(201).json({ data: summary });
  }),
);

router.get(
  '/:id/metrics',
  requireAuth,
  authorize(['admin', 'cashier']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const campaign = await prisma.campaign.findFirst({ where: { id, deleted_at: null } });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const metrics = await getCampaignMetrics(id);
    res.json({ data: metrics });
  }),
);

router.get(
  '/:id/export.csv',
  requireAuth,
  authorize(['admin', 'cashier']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const campaign = await prisma.campaign.findFirst({ where: { id, deleted_at: null } });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const csv = await exportRecipientsCsv(id);
    res.setHeader('content-type', 'text/csv');
    res.setHeader('content-disposition', `attachment; filename="campaign-${id}.csv"`);
    res.send(csv);
  }),
);

router.post(
  '/:id/recipients/:recipientId/events',
  requireAuth,
  authorize(['admin', 'cashier']),
  validateBody(recipientEventSchema),
  asyncHandler(async (req, res) => {
    const { id, recipientId } = req.params;
    const payload = recipientEventSchema.parse(req.body);

    const recipient = await prisma.campaignRecipient.findFirst({
      where: { id: recipientId, campaign_id: id, deleted_at: null },
    });

    if (!recipient) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    const typeMap: Record<'sent' | 'delivered' | 'read' | 'replied' | 'opt_out' | 'error', CampaignEventType> = {
      sent: CampaignEventType.SENT,
      delivered: CampaignEventType.DELIVERED,
      read: CampaignEventType.READ,
      replied: CampaignEventType.REPLIED,
      opt_out: CampaignEventType.OPT_OUT,
      error: CampaignEventType.ERROR,
    } as const;

    const eventType = typeMap[payload.type];
    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
    await recordRecipientEvent(recipientId, eventType, timestamp, payload.payload ?? undefined);

    res.status(201).json({ data: { recipientId, type: payload.type, timestamp } });
  }),
);

export default router;
