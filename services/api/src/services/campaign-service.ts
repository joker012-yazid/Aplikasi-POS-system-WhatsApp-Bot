import {
  Campaign,
  CampaignEventType,
  CampaignRecipientStatus,
  CampaignSegment,
  ConsentChannel,
  Prisma,
} from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { normalizePhoneNumber } from '../utils/phone.js';

const MINUTES_IN_MILLISECONDS = 60_000;

export interface SegmentInput {
  key: string;
  name?: string;
  timezone?: string;
  throttlePerMinute?: number;
  jitterSeconds?: number;
  dailyCap?: number;
  windowStartHour?: number | null;
  windowEndHour?: number | null;
}

export interface RecipientInput {
  customerId?: string;
  phone?: string;
  name?: string;
  variables?: Record<string, string>;
}

export interface ImportSummary {
  inserted: number;
  skipped: Array<{ input: RecipientInput; reason: string }>;
  segment: CampaignSegment;
}

const computeTimezoneOffsetMinutes = (timeZone: string, reference = new Date()): number => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = formatter.formatToParts(reference);
    const data: Record<string, number> = {};
    for (const part of parts) {
      if (part.type === 'literal') {
        continue;
      }

      data[part.type] = Number.parseInt(part.value, 10);
    }

    const utc = Date.UTC(
      data.year ?? reference.getUTCFullYear(),
      (data.month ?? reference.getUTCMonth() + 1) - 1,
      data.day ?? reference.getUTCDate(),
      data.hour ?? reference.getUTCHours(),
      data.minute ?? reference.getUTCMinutes(),
      data.second ?? reference.getUTCSeconds(),
    );

    return Math.round((utc - reference.getTime()) / MINUTES_IN_MILLISECONDS);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('failed to compute timezone offset', error);
    return 0;
  }
};

const offsetToMilliseconds = (minutes: number) => minutes * MINUTES_IN_MILLISECONDS;

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

class SegmentScheduler {
  private readonly segment: CampaignSegment;

  private readonly offsetMinutes: number;

  private readonly offsetMilliseconds: number;

  private readonly throttleIntervalMs: number;

  private readonly jitterSeconds: number;

  private readonly dailyCap: number;

  private readonly windowStartHour: number | null;

  private readonly windowEndHour: number | null;

  private nextLocal: Date;

  private dailyDateKey: string;

  private dailyUsed: number;

  constructor(segment: CampaignSegment, campaign: Campaign) {
    this.segment = segment;
    const timezone = segment.timezone ?? 'Asia/Kuala_Lumpur';
    this.offsetMinutes = segment.timezone_offset_minutes ?? computeTimezoneOffsetMinutes(timezone);
    this.offsetMilliseconds = offsetToMilliseconds(this.offsetMinutes);
    const throttlePerMinute = segment.throttle_per_minute && segment.throttle_per_minute > 0 ? segment.throttle_per_minute : 60;
    this.throttleIntervalMs = Math.max(Math.floor(MINUTES_IN_MILLISECONDS / throttlePerMinute), 500);
    this.jitterSeconds = Math.max(segment.jitter_seconds ?? 0, 0);
    this.dailyCap = Math.max(segment.daily_cap ?? 0, 0);
    this.windowStartHour = segment.window_start_hour ?? null;
    this.windowEndHour = segment.window_end_hour ?? null;

    const base = segment.next_send_at ?? campaign.scheduled_at ?? new Date();
    const baseLocal = this.applyWindow(this.toLocal(base));
    this.nextLocal = baseLocal;

    const quotaReference = segment.daily_quota_date ? this.toLocal(segment.daily_quota_date) : null;
    const quotaKey = quotaReference ? formatDateKey(quotaReference) : formatDateKey(baseLocal);

    if (quotaReference && quotaKey === formatDateKey(baseLocal)) {
      this.dailyUsed = segment.daily_quota_used ?? 0;
      this.dailyDateKey = quotaKey;
    } else {
      this.dailyUsed = 0;
      this.dailyDateKey = formatDateKey(baseLocal);
    }

    if (this.dailyCap > 0 && this.dailyUsed >= this.dailyCap) {
      const shifted = this.moveToNextWindow(this.nextLocal);
      this.nextLocal = shifted;
      this.dailyDateKey = formatDateKey(shifted);
      this.dailyUsed = 0;
    }
  }

  private toLocal(date: Date): Date {
    return new Date(date.getTime() + this.offsetMilliseconds);
  }

  private toUtc(date: Date): Date {
    return new Date(date.getTime() - this.offsetMilliseconds);
  }

  private applyWindow(date: Date): Date {
    const start = this.windowStartHour;
    const end = this.windowEndHour;

    if (start === null && end === null) {
      return new Date(date);
    }

    const result = new Date(date);

    if (start !== null && result.getHours() < start) {
      result.setHours(start, 0, 0, 0);
    }

    if (end !== null && result.getHours() >= end) {
      result.setDate(result.getDate() + 1);
      result.setHours(start ?? 9, 0, 0, 0);
    }

    return result;
  }

  private moveToNextWindow(date: Date): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    if (this.windowStartHour !== null) {
      next.setHours(this.windowStartHour, 0, 0, 0);
    }
    return this.applyWindow(next);
  }

  private ensureDailyAllowance(date: Date): { date: Date; key: string } {
    let candidate = new Date(date);
    let key = formatDateKey(candidate);

    if (key !== this.dailyDateKey) {
      this.dailyUsed = 0;
    }

    if (this.dailyCap > 0 && this.dailyUsed >= this.dailyCap) {
      candidate = this.moveToNextWindow(candidate);
      key = formatDateKey(candidate);
      this.dailyUsed = 0;
    }

    return { date: candidate, key };
  }

  nextSend(): { scheduledUtc: Date; scheduledLocal: Date } {
    const windowAligned = this.applyWindow(this.nextLocal);
    const { date: allowanceAligned, key } = this.ensureDailyAllowance(windowAligned);

    const jitter = this.jitterSeconds > 0 ? Math.floor(Math.random() * (this.jitterSeconds * 1000)) : 0;
    const sendLocal = new Date(allowanceAligned.getTime() + jitter);
    const sendUtc = this.toUtc(sendLocal);

    this.dailyDateKey = key;
    this.dailyUsed += 1;

    const nextBase = new Date(allowanceAligned.getTime() + this.throttleIntervalMs);
    this.nextLocal = nextBase;

    return { scheduledUtc: sendUtc, scheduledLocal: sendLocal };
  }

  getState(): Pick<CampaignSegment, 'next_send_at' | 'daily_quota_date' | 'daily_quota_used'> {
    const key = this.dailyDateKey;
    let quotaDateUtc: Date | null = null;
    if (key) {
      const [year, month, day] = key.split('-').map((value) => Number.parseInt(value, 10));
      const localDate = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0));
      quotaDateUtc = this.toUtc(localDate);
    }

    const nextUtc = this.toUtc(this.applyWindow(this.nextLocal));

    return {
      next_send_at: nextUtc,
      daily_quota_date: quotaDateUtc,
      daily_quota_used: this.dailyUsed,
    };
  }
}

const buildSegmentUpdate = (
  segment: CampaignSegment,
  input: SegmentInput,
): Prisma.CampaignSegmentUpdateInput => {
  const data: Prisma.CampaignSegmentUpdateInput = {};

  if (input.name && input.name !== segment.name) {
    data.name = input.name;
  }

  if (input.timezone && input.timezone !== segment.timezone) {
    data.timezone = input.timezone;
    data.timezone_offset_minutes = computeTimezoneOffsetMinutes(input.timezone);
  }

  if (typeof input.throttlePerMinute === 'number') {
    const value = Math.max(1, Math.floor(input.throttlePerMinute));
    if (value !== segment.throttle_per_minute) {
      data.throttle_per_minute = value;
    }
  }

  if (typeof input.jitterSeconds === 'number') {
    const value = Math.max(0, Math.floor(input.jitterSeconds));
    if (value !== segment.jitter_seconds) {
      data.jitter_seconds = value;
    }
  }

  if (typeof input.dailyCap === 'number') {
    const value = Math.max(0, Math.floor(input.dailyCap));
    if (value !== segment.daily_cap) {
      data.daily_cap = value;
    }
  }

  if (input.windowStartHour !== undefined && input.windowStartHour !== segment.window_start_hour) {
    data.window_start_hour = input.windowStartHour ?? null;
  }

  if (input.windowEndHour !== undefined && input.windowEndHour !== segment.window_end_hour) {
    data.window_end_hour = input.windowEndHour ?? null;
  }

  return data;
};

const extractTemplateVariables = (template: string | null | undefined): string[] => {
  if (!template) {
    return [];
  }

  const matches = template.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  if (!matches) {
    return [];
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

export const upsertSegment = async (
  campaignId: string,
  input: SegmentInput,
  tx = prisma,
): Promise<CampaignSegment> => {
  const segment = await tx.campaignSegment.upsert({
    where: {
      campaign_id_key: {
        campaign_id: campaignId,
        key: input.key,
      },
    },
    update: {},
    create: {
      campaign_id: campaignId,
      key: input.key,
      name: input.name ?? input.key,
      timezone: input.timezone ?? 'Asia/Kuala_Lumpur',
      timezone_offset_minutes: computeTimezoneOffsetMinutes(input.timezone ?? 'Asia/Kuala_Lumpur'),
      throttle_per_minute: input.throttlePerMinute ? Math.max(1, Math.floor(input.throttlePerMinute)) : 60,
      jitter_seconds: input.jitterSeconds ? Math.max(0, Math.floor(input.jitterSeconds)) : 0,
      daily_cap: input.dailyCap ? Math.max(0, Math.floor(input.dailyCap)) : 0,
      window_start_hour: input.windowStartHour ?? null,
      window_end_hour: input.windowEndHour ?? null,
    },
  });

  const update = buildSegmentUpdate(segment, input);
  if (Object.keys(update).length > 0) {
    return tx.campaignSegment.update({
      where: { id: segment.id },
      data: update,
    });
  }

  return segment;
};

interface ConsentRecord {
  customerId: string;
  phone: string | null;
  name: string | null;
  isOptedIn: boolean;
}

interface ConsentLookup {
  byCustomer: Map<string, ConsentRecord>;
  byPhone: Map<string, ConsentRecord>;
}

const findConsentingCustomers = async (
  inputs: RecipientInput[],
  tx: Prisma.TransactionClient,
): Promise<ConsentLookup> => {
  const customerIds = Array.from(
    new Set(inputs.map((item) => item.customerId).filter((value): value is string => Boolean(value))),
  );

  const byCustomer = new Map<string, ConsentRecord>();
  const byPhone = new Map<string, ConsentRecord>();

  if (customerIds.length > 0) {
    const customers = await tx.customer.findMany({
      where: { id: { in: customerIds }, deleted_at: null },
      include: { consents: { where: { channel: ConsentChannel.whatsapp } } },
    });

    for (const customer of customers) {
      const consent = customer.consents[0];
      const isOptedIn = Boolean(consent?.opt_in_at) && !consent?.opt_out_at;
      const normalizedPhone = normalizePhoneNumber(customer.phone ?? null);
      const record: ConsentRecord = {
        customerId: customer.id,
        phone: normalizedPhone,
        name: customer.name ?? null,
        isOptedIn,
      };
      byCustomer.set(customer.id, record);
      if (normalizedPhone) {
        byPhone.set(normalizedPhone, record);
      }
    }
  }

  const rawPhones = inputs
    .map((item) => (item.phone ? item.phone.trim() : null))
    .filter((value): value is string => Boolean(value));

  const normalizedPhones = rawPhones
    .map((value) => normalizePhoneNumber(value))
    .filter((value): value is string => Boolean(value));

  const uniquePhones = Array.from(new Set([...rawPhones, ...normalizedPhones]));
  if (uniquePhones.length > 0) {
    const customers = await tx.customer.findMany({
      where: { phone: { in: uniquePhones }, deleted_at: null },
      include: { consents: { where: { channel: ConsentChannel.whatsapp } } },
    });

    for (const customer of customers) {
      const consent = customer.consents[0];
      const isOptedIn = Boolean(consent?.opt_in_at) && !consent?.opt_out_at;
      const normalizedPhone = normalizePhoneNumber(customer.phone ?? null);
      const record: ConsentRecord = {
        customerId: customer.id,
        phone: normalizedPhone,
        name: customer.name ?? null,
        isOptedIn,
      };

      byCustomer.set(customer.id, record);
      if (normalizedPhone) {
        byPhone.set(normalizedPhone, record);
      }
    }
  }

  return { byCustomer, byPhone };
};

export const importRecipients = async (
  campaign: Campaign,
  segment: CampaignSegment,
  recipients: RecipientInput[],
): Promise<ImportSummary> => {
  if (recipients.length === 0) {
    return { inserted: 0, skipped: [], segment };
  }

  return prisma.$transaction(async (tx) => {
    const consenting = await findConsentingCustomers(recipients, tx);
    const scheduler = new SegmentScheduler(segment, campaign);
    const seenPhones = new Set<string>();
    const skipped: Array<{ input: RecipientInput; reason: string }> = [];
    let inserted = 0;

    for (const entry of recipients) {
      const baseConsent = entry.customerId ? consenting.byCustomer.get(entry.customerId) : undefined;
      const normalizedPhone = normalizePhoneNumber(entry.phone ?? baseConsent?.phone ?? null);

      if (!normalizedPhone) {
        skipped.push({ input: entry, reason: 'invalid_phone' });
        continue;
      }

      if (seenPhones.has(normalizedPhone)) {
        skipped.push({ input: entry, reason: 'duplicate_phone' });
        continue;
      }

      const consentRecord = baseConsent ?? consenting.byPhone.get(normalizedPhone);

      if (consentRecord && !consentRecord.isOptedIn) {
        skipped.push({ input: entry, reason: 'not_opted_in' });
        continue;
      }

      if (!consentRecord) {
        skipped.push({ input: entry, reason: 'consent_missing' });
        continue;
      }

      const existing = await tx.campaignRecipient.findUnique({
        where: {
          campaign_id_phone: {
            campaign_id: campaign.id,
            phone: normalizedPhone,
          },
        },
      });

      if (existing) {
        skipped.push({ input: entry, reason: 'already_imported' });
        continue;
      }

      const schedule = scheduler.nextSend();

      await tx.campaignRecipient.create({
        data: {
          campaign_id: campaign.id,
          segment_id: segment.id,
          customer_id: entry.customerId ?? consentRecord.customerId ?? null,
          phone: normalizedPhone,
          name: entry.name ?? consentRecord.name ?? null,
          variables: entry.variables ? { ...entry.variables } : undefined,
          status: CampaignRecipientStatus.SCHEDULED,
          scheduled_for: schedule.scheduledUtc,
          events: {
            create: {
              type: CampaignEventType.QUEUED,
              payload: { scheduledLocal: schedule.scheduledLocal.toISOString() },
            },
          },
        },
      });

      inserted += 1;
      seenPhones.add(normalizedPhone);
    }

    const nextState = scheduler.getState();
    const updatedSegment = await tx.campaignSegment.update({
      where: { id: segment.id },
      data: nextState,
    });

    return { inserted, skipped, segment: updatedSegment };
  });
};

export const updateCampaignTemplate = async (campaignId: string, template: string | null | undefined) => {
  const variables = extractTemplateVariables(template);
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      template_body: template ?? null,
      template_variables: variables,
    },
  });
};

export const renderTemplate = (template: string, variables: Record<string, string | number | null | undefined>): string => {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key.trim()];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });
};

export const recordRecipientEvent = async (
  recipientId: string,
  type: CampaignEventType,
  timestamp: Date,
  payload?: Record<string, unknown>,
) => {
  let propagatePhones: string[] = [];
  if (type === CampaignEventType.OPT_OUT) {
    const current = await prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      select: { phone: true },
    });

    if (current?.phone) {
      const normalized = normalizePhoneNumber(current.phone);
      const values = new Set<string>();
      values.add(current.phone);
      if (normalized) {
        values.add(normalized);
      }
      propagatePhones = Array.from(values);
    }
  }

  const updates: Prisma.CampaignRecipientUpdateInput = {
    events: {
      create: { type, payload: { ...(payload ?? {}), timestamp: timestamp.toISOString() } },
    },
  };

  switch (type) {
    case CampaignEventType.SENT:
      updates.sent_at = timestamp;
      updates.status = CampaignRecipientStatus.SENT;
      break;
    case CampaignEventType.DELIVERED:
      updates.delivered_at = timestamp;
      if (updates.status === undefined) {
        updates.status = CampaignRecipientStatus.DELIVERED;
      }
      break;
    case CampaignEventType.READ:
      updates.read_at = timestamp;
      updates.status = CampaignRecipientStatus.READ;
      break;
    case CampaignEventType.REPLIED:
      updates.replied_at = timestamp;
      updates.status = CampaignRecipientStatus.REPLIED;
      break;
    case CampaignEventType.OPT_OUT:
      updates.opt_out_at = timestamp;
      updates.status = CampaignRecipientStatus.OPTED_OUT;
      break;
    case CampaignEventType.ERROR:
      updates.status = CampaignRecipientStatus.FAILED;
      updates.error = payload?.message ? String(payload.message) : 'unknown_error';
      break;
    default:
      break;
  }

  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: updates,
  });

  if (type === CampaignEventType.OPT_OUT && propagatePhones.length > 0) {
    const candidates = await prisma.campaignRecipient.findMany({
      where: {
        phone: { in: propagatePhones },
        deleted_at: null,
        status: { in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.SCHEDULED] },
      },
      select: { id: true },
    });

    const targetIds = candidates.map((record) => record.id).filter((id) => id !== recipientId);
    if (targetIds.length > 0) {
      await prisma.campaignRecipient.updateMany({
        where: { id: { in: targetIds } },
        data: { status: CampaignRecipientStatus.OPTED_OUT, opt_out_at: timestamp },
      });

      await prisma.campaignEvent.createMany({
        data: targetIds.map((id) => ({
          recipient_id: id,
          type: CampaignEventType.OPT_OUT,
          payload: { propagatedFrom: recipientId, timestamp: timestamp.toISOString() },
        })),
      });
    }
  }
};

export const getCampaignMetrics = async (campaignId: string) => {
  const [total, scheduled, sent, delivered, read, replied, optOut, failed] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaign_id: campaignId, deleted_at: null } }),
    prisma.campaignRecipient.count({
      where: {
        campaign_id: campaignId,
        deleted_at: null,
        status: CampaignRecipientStatus.SCHEDULED,
      },
    }),
    prisma.campaignRecipient.count({
      where: { campaign_id: campaignId, deleted_at: null, sent_at: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaign_id: campaignId, deleted_at: null, delivered_at: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaign_id: campaignId, deleted_at: null, read_at: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaign_id: campaignId, deleted_at: null, replied_at: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaign_id: campaignId, deleted_at: null, opt_out_at: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaign_id: campaignId, deleted_at: null, status: CampaignRecipientStatus.FAILED },
    }),
  ]);

  return {
    total,
    scheduled,
    sent,
    delivered,
    read,
    replied,
    optOut,
    failed,
  };
};

export const exportRecipientsCsv = async (campaignId: string): Promise<string> => {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaign_id: campaignId, deleted_at: null },
    orderBy: { scheduled_for: 'asc' },
  });

  const header = [
    'phone',
    'name',
    'status',
    'scheduled_for',
    'sent_at',
    'delivered_at',
    'read_at',
    'replied_at',
    'opt_out_at',
  ];

  const rows = recipients.map((recipient) => [
    recipient.phone,
    recipient.name ?? '',
    recipient.status,
    recipient.scheduled_for?.toISOString() ?? '',
    recipient.sent_at?.toISOString() ?? '',
    recipient.delivered_at?.toISOString() ?? '',
    recipient.read_at?.toISOString() ?? '',
    recipient.replied_at?.toISOString() ?? '',
    recipient.opt_out_at?.toISOString() ?? '',
  ]);

  const escapeCell = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csv = [header, ...rows]
    .map((columns) => columns.map((column) => escapeCell(column ?? '')).join(','))
    .join('\n');

  return `${csv}\n`;
};

