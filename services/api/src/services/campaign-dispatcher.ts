import { CampaignEventType, CampaignRecipientStatus, CampaignStatus, ConsentChannel } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { recordRecipientEvent, renderTemplate } from './campaign-service.js';
import { createLogger } from '../utils/logger.js';
import { normalizePhoneNumber } from '../utils/phone.js';

const logger = createLogger('campaign-dispatcher');

const toStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || raw === undefined) {
      continue;
    }
    result[key] = String(raw);
  }
  return result;
};

export const processDueRecipients = async (limit = 25) => {
  const now = new Date();
  const recipients = await prisma.campaignRecipient.findMany({
    where: {
      status: CampaignRecipientStatus.SCHEDULED,
      scheduled_for: { lte: now },
      deleted_at: null,
    },
    orderBy: { scheduled_for: 'asc' },
    take: limit,
    include: { campaign: true },
  });

  if (recipients.length === 0) {
    return 0;
  }

  const customerIds = Array.from(
    new Set(
      recipients
        .map((recipient) => recipient.customer_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const phones = Array.from(
    new Set(
      recipients
        .map((recipient) => normalizePhoneNumber(recipient.phone))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [consentsByCustomer, consentsByPhone] = await Promise.all([
    customerIds.length
      ? prisma.consent
          .findMany({ where: { customer_id: { in: customerIds }, channel: ConsentChannel.whatsapp } })
          .then((records) => {
            const map = new Map<string, { opt_in_at: Date | null; opt_out_at: Date | null }>();
            for (const entry of records) {
              map.set(entry.customer_id, {
                opt_in_at: entry.opt_in_at ?? null,
                opt_out_at: entry.opt_out_at ?? null,
              });
            }
            return map;
          })
      : Promise.resolve(new Map<string, { opt_in_at: Date | null; opt_out_at: Date | null }>()),
    phones.length
      ? prisma.customer
          .findMany({
            where: { phone: { in: phones } },
            include: { consents: { where: { channel: ConsentChannel.whatsapp }, take: 1 } },
          })
          .then((records) => {
            const map = new Map<string, { opt_in_at: Date | null; opt_out_at: Date | null }>();
            for (const customer of records) {
              const consent = customer.consents[0];
              if (!consent) {
                continue;
              }
              const normalized = normalizePhoneNumber(customer.phone ?? null);
              if (!normalized) {
                continue;
              }
              map.set(normalized, {
                opt_in_at: consent.opt_in_at ?? null,
                opt_out_at: consent.opt_out_at ?? null,
              });
            }
            return map;
          })
      : Promise.resolve(new Map<string, { opt_in_at: Date | null; opt_out_at: Date | null }>()),
  ]);

  const processedCampaigns = new Set<string>();

  for (const recipient of recipients) {
    try {
      const campaign = recipient.campaign;
      const normalizedPhone = normalizePhoneNumber(recipient.phone);
      const consentRecord =
        (recipient.customer_id ? consentsByCustomer.get(recipient.customer_id) : undefined) ||
        (normalizedPhone ? consentsByPhone.get(normalizedPhone) : undefined);

      if (consentRecord?.opt_out_at) {
        await recordRecipientEvent(recipient.id, CampaignEventType.OPT_OUT, now, {
          reason: 'consent_opt_out',
        });
        continue;
      }

      if (!consentRecord || !consentRecord.opt_in_at) {
        await recordRecipientEvent(recipient.id, CampaignEventType.ERROR, now, {
          reason: 'missing_opt_in',
        });
        continue;
      }

      let renderedMessage: string | null = null;

      if (campaign?.template_body) {
        const context = {
          nama: recipient.name ?? '',
          phone: recipient.phone,
          campaign: campaign.name,
          ...toStringRecord(recipient.variables ?? {}),
        };
        renderedMessage = renderTemplate(campaign.template_body, context);
      }

      await recordRecipientEvent(recipient.id, CampaignEventType.SENT, now, {
        scheduledFor: recipient.scheduled_for?.toISOString() ?? null,
        message: renderedMessage,
      });

      if (campaign) {
        processedCampaigns.add(campaign.id);
        if (!campaign.started_at) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              started_at: now,
              status:
                campaign.status === CampaignStatus.DRAFT || campaign.status === CampaignStatus.SCHEDULED
                  ? CampaignStatus.RUNNING
                  : campaign.status,
            },
          });
        }
      }
    } catch (error) {
      logger.error({ err: error, recipientId: recipient.id }, 'failed to mark recipient as sent');
    }
  }

  for (const campaignId of processedCampaigns) {
    const remaining = await prisma.campaignRecipient.count({
      where: {
        campaign_id: campaignId,
        deleted_at: null,
        status: { in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.SCHEDULED] },
      },
    });

    if (remaining === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          completed_at: now,
          status: CampaignStatus.COMPLETED,
        },
      });
    }
  }

  return recipients.length;
};

export const startCampaignDispatcher = (intervalMs = 15_000) => {
  let active = true;

  const tick = async () => {
    if (!active) {
      return;
    }

    try {
      const processed = await processDueRecipients();
      if (processed > 0) {
        logger.debug({ processed }, 'campaign recipients dispatched');
      }
    } catch (error) {
      logger.error({ err: error }, 'campaign dispatcher tick failed');
    }
  };

  const timer = setInterval(tick, intervalMs);
  tick().catch((error) => logger.error({ err: error }, 'initial campaign dispatcher run failed'));

  return () => {
    active = false;
    clearInterval(timer);
  };
};
