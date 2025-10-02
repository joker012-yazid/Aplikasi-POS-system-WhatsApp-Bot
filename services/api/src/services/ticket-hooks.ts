import { Prisma, WorkTicketEventType, WorkTicketStatus } from '@prisma/client';

import { PUBLIC_WEB_APP_URL, REVIEW_URL, WA_HOOK_BASE_URL } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { normalizePhoneNumber } from '../utils/phone.js';

const DEFAULT_TEMPLATES = {
  acknowledgement:
    'Terima kasih {{nama}}! Kami telah terima tiket/peranti anda dan akan maklum perkembangan terkini. ID tiket: {{tiket}}.',
  estimate:
    'Hai {{nama}}, anggaran kos servis untuk {{peranti}} ialah RM{{anggaran}} (ETA {{eta}}). Balas YA untuk teruskan atau TIDAK untuk batal.',
  ready:
    'Hai {{nama}}, peranti anda sudah siap! Sila datang ambil sebelum {{tarikh}}. Invois: {{pautan_invois}}.',
};

type TemplateSet = typeof DEFAULT_TEMPLATES;

type TicketBasics = Prisma.WorkTicketGetPayload<{
  include: {
    customer: true;
    device: true;
    invoice: {
      select: { id: true; number: true; total_amount: Prisma.Decimal | null; due_at: Date | null; status: string | null };
    };
  };
}>;

type TicketWithEvents = Prisma.WorkTicketGetPayload<{
  include: {
    customer: true;
    device: true;
    invoice: {
      select: { id: true; number: true; total_amount: Prisma.Decimal | null; due_at: Date | null; status: string | null };
    };
    events: true;
  };
}>;

type HookDispatchResult = {
  status: 'sent' | 'failed' | 'skipped';
  detail?: string;
  response?: unknown;
};

type FollowUpStage = {
  key: '1d' | '20d' | '30d';
  days: number;
  label: string;
};

const FOLLOW_UP_STAGES: FollowUpStage[] = [
  { key: '1d', days: 1, label: 'Follow-up 1 hari' },
  { key: '20d', days: 20, label: 'Follow-up 20 hari' },
  { key: '30d', days: 30, label: 'Follow-up 30 hari' },
];

const normaliseUrl = (base: string, path: string) => {
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
};

const formatCurrency = (value: Prisma.Decimal | number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return '0.00';
  }
  const numeric = typeof value === 'object' && 'toNumber' in value ? (value as Prisma.Decimal).toNumber() : Number(value);
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }
  return numeric.toFixed(2);
};

const formatDate = (date: Date | string | null | undefined, includeTime = false) => {
  if (!date) {
    return '';
  }
  const instance = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(instance.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('ms-MY', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(instance);
};

const renderTemplate = (template: string, variables: Record<string, string | number | null | undefined>) => {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });
};

const getTemplates = async (): Promise<TemplateSet> => {
  const setting = await prisma.setting.findFirst({
    where: { key: 'wa.templates', deleted_at: null },
  });

  if (!setting) {
    return DEFAULT_TEMPLATES;
  }

  const value = setting.value as Record<string, unknown> | null;
  if (!value || typeof value !== 'object') {
    return DEFAULT_TEMPLATES;
  }

  const parse = (key: keyof TemplateSet) => {
    const raw = value[key];
    return typeof raw === 'string' && raw.trim() ? raw : DEFAULT_TEMPLATES[key];
  };

  return {
    acknowledgement: parse('acknowledgement'),
    estimate: parse('estimate'),
    ready: parse('ready'),
  };
};

const sendWhatsAppMessage = async (
  phone: string | null,
  text: string,
  attachments: { type: 'image'; url: string; caption?: string | null }[] = [],
  tag?: string,
): Promise<HookDispatchResult> => {
  if (!phone) {
    return { status: 'skipped', detail: 'missing-recipient' };
  }

  const trimmed = text?.trim?.() ?? '';
  if (!trimmed && attachments.length === 0) {
    return { status: 'skipped', detail: 'empty-message' };
  }

  try {
    const response = await fetch(normaliseUrl(WA_HOOK_BASE_URL, '/send'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: phone, text: trimmed, attachments, tag }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: 'failed',
        detail: `wa-service-${response.status}`,
        response: data,
      };
    }

    return { status: 'sent', response: data };
  } catch (error) {
    return {
      status: 'failed',
      detail: error instanceof Error ? error.message : 'unknown-error',
    };
  }
};

const recordHookEvent = async (
  ticket: TicketBasics,
  hook: string,
  message: string,
  result: HookDispatchResult,
  recipient: string | null,
  extra: Record<string, unknown> = {},
  noteOverride?: string,
) => {
  const statusLabel =
    result.status === 'sent'
      ? 'dihantar'
      : result.status === 'skipped'
      ? 'dilangkau'
      : 'gagal';

  const note =
    noteOverride ??
    `Hook WhatsApp (${hook}) ${statusLabel}${recipient ? ` ke ${recipient}` : ''}.`;

  await prisma.$transaction(async (tx) => {
    await tx.workTicketEvent.create({
      data: {
        ticket_id: ticket.id,
        type: WorkTicketEventType.NOTE,
        note,
        payload: {
          hook,
          status: result.status,
          detail: result.detail ?? null,
          message,
          recipient,
          ...extra,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        entity: 'work_ticket',
        entity_id: ticket.id,
        action: `whatsapp_hook_${hook}`,
        diff: {
          hook,
          status: result.status,
          detail: result.detail ?? null,
          message,
          recipient,
          ...extra,
        },
        metadata: {
          ticketStatus: ticket.status,
          customerId: ticket.customer_id ?? null,
          deviceId: ticket.device_id ?? null,
          invoiceId: ticket.invoice_id ?? null,
        },
      },
    });
  });
};

const buildInvoiceLink = (ticket: TicketBasics) => {
  const invoiceId = ticket.invoice?.id ?? ticket.invoice_id;
  if (!invoiceId) {
    return normaliseUrl(PUBLIC_WEB_APP_URL, `/tickets/${ticket.id}`);
  }
  return normaliseUrl(PUBLIC_WEB_APP_URL, `/invoices/${invoiceId}`);
};

const loadTicket = async (ticketId: string): Promise<TicketBasics | null> => {
  return prisma.workTicket.findFirst({
    where: { id: ticketId, deleted_at: null },
    include: {
      customer: true,
      device: true,
      invoice: {
        select: {
          id: true,
          number: true,
          total_amount: true,
          due_at: true,
          status: true,
        },
      },
    },
  });
};

const loadReadyTickets = async (): Promise<TicketWithEvents[]> => {
  return prisma.workTicket.findMany({
    where: { status: WorkTicketStatus.READY, deleted_at: null },
    include: {
      customer: true,
      device: true,
      invoice: {
        select: {
          id: true,
          number: true,
          total_amount: true,
          due_at: true,
          status: true,
        },
      },
      events: {
        where: { deleted_at: null, type: WorkTicketEventType.NOTE },
        orderBy: { created_at: 'desc' },
      },
    },
  });
};

const getRecipientName = (ticket: TicketBasics) =>
  ticket.customer?.name?.trim() || 'Pelanggan';

const getDeviceLabel = (ticket: TicketBasics) =>
  ticket.device?.label?.trim() || 'peranti anda';

export const triggerTicketAcknowledgement = async (ticketId: string) => {
  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return;
  }

  const templates = await getTemplates();
  const name = getRecipientName(ticket);
  const device = getDeviceLabel(ticket);
  const message = renderTemplate(templates.acknowledgement, {
    nama: name,
    tiket: ticket.id,
    peranti: device,
  });

  const phone = normalizePhoneNumber(ticket.customer?.phone ?? null);
  const result = await sendWhatsAppMessage(phone, message, [], 'ticket_acknowledgement');

  await recordHookEvent(ticket, 'acknowledgement', message, result, phone, {
    template: 'acknowledgement',
  });
};

export const triggerTicketEstimateRequest = async (ticketId: string) => {
  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return;
  }

  const templates = await getTemplates();
  const name = getRecipientName(ticket);
  const device = getDeviceLabel(ticket);
  const price = formatCurrency(ticket.price_estimate);
  const eta = ticket.eta_ready_at ? formatDate(ticket.eta_ready_at, true) : 'tidak ditetapkan';

  const message = renderTemplate(templates.estimate, {
    nama: name,
    peranti: device,
    anggaran: price,
    eta,
    tiket: ticket.id,
  });

  const phone = normalizePhoneNumber(ticket.customer?.phone ?? null);
  const result = await sendWhatsAppMessage(phone, message, [], 'ticket_estimate');

  await recordHookEvent(ticket, 'estimate_request', message, result, phone, {
    template: 'estimate',
    price,
    eta,
  });
};

export const triggerTicketReadyNotification = async (ticketId: string, photos: string[] = []) => {
  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return;
  }

  const templates = await getTemplates();
  const name = getRecipientName(ticket);
  const device = getDeviceLabel(ticket);
  const invoiceLink = buildInvoiceLink(ticket);
  const readyBy = ticket.eta_ready_at ? formatDate(ticket.eta_ready_at, true) : formatDate(new Date(), true);
  const total = formatCurrency(ticket.invoice?.total_amount ?? ticket.price_estimate ?? 0);

  const message = renderTemplate(templates.ready, {
    nama: name,
    peranti: device,
    pautan_invois: invoiceLink,
    tarikh: readyBy,
    jumlah: total,
    tiket: ticket.id,
  });

  const attachments = photos
    .filter((url) => typeof url === 'string' && url.trim())
    .map((url) => ({ type: 'image' as const, url: url.trim(), caption: `Tiket ${ticket.id}` }));

  const phone = normalizePhoneNumber(ticket.customer?.phone ?? null);
  const result = await sendWhatsAppMessage(phone, message, attachments, 'ticket_ready');

  await recordHookEvent(ticket, 'ready_notification', message, result, phone, {
    template: 'ready',
    invoiceLink,
    attachments: attachments.map((item) => item.url),
    total,
  });
};

export const triggerTicketPickupThankYou = async (ticketId: string) => {
  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return;
  }

  const name = getRecipientName(ticket);
  const message = `Terima kasih ${name}! Kami menghargai anda mengambil tiket ${ticket.id}. Kongsikan maklum balas di ${REVIEW_URL}.`;
  const phone = normalizePhoneNumber(ticket.customer?.phone ?? null);
  const result = await sendWhatsAppMessage(phone, message, [], 'ticket_picked_up');

  await recordHookEvent(ticket, 'picked_up', message, result, phone, {
    reviewLink: REVIEW_URL,
  });
};

const findReadyEvent = (ticket: TicketWithEvents) => {
  return ticket.events.find((event) => {
    const payload = event.payload as Record<string, unknown> | null;
    return payload?.hook === 'ready_notification' && payload?.status === 'sent';
  });
};

const hasFollowUpForStage = (ticket: TicketWithEvents, stage: FollowUpStage) => {
  return ticket.events.some((event) => {
    const payload = event.payload as Record<string, unknown> | null;
    return payload?.hook === 'follow_up' && payload?.stage === stage.key;
  });
};

const sendReadyFollowUp = async (
  ticket: TicketWithEvents,
  stage: FollowUpStage,
  readySentAt: Date,
): Promise<HookDispatchResult> => {
  const phone = normalizePhoneNumber(ticket.customer?.phone ?? null);
  const name = getRecipientName(ticket);
  const invoiceLink = buildInvoiceLink(ticket);
  const message = `Hai ${name}, peringatan ${stage.label.toLowerCase()} untuk tiket ${ticket.id}. Peranti masih menunggu diambil. Invois: ${invoiceLink}.`;

  const result = await sendWhatsAppMessage(phone, message, [], `ticket_follow_up_${stage.key}`);

  await recordHookEvent(ticket, 'follow_up', message, result, phone, {
    stage: stage.key,
    readySentAt: readySentAt.toISOString(),
    invoiceLink,
  });

  return result;
};

export const processReadyFollowUps = async () => {
  const now = new Date();
  const tickets = await loadReadyTickets();

  const triggered: { ticketId: string; stage: FollowUpStage['key']; status: HookDispatchResult['status'] }[] = [];

  for (const ticket of tickets) {
    const readyEvent = findReadyEvent(ticket);
    if (!readyEvent || !readyEvent.created_at) {
      continue;
    }

    const readySentAt = readyEvent.created_at;

    for (const stage of FOLLOW_UP_STAGES) {
      if (hasFollowUpForStage(ticket, stage)) {
        continue;
      }

      const dueAt = new Date(readySentAt.getTime() + stage.days * 24 * 60 * 60 * 1000);
      if (now < dueAt) {
        continue;
      }

      const result = await sendReadyFollowUp(ticket, stage, readySentAt);
      triggered.push({ ticketId: ticket.id, stage: stage.key, status: result.status });
    }
  }

  return {
    checked: tickets.length,
    triggered,
  };
};
