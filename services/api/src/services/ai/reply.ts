import OpenAI from 'openai';
import { Prisma } from '@prisma/client';

import { OPENAI_API_KEY } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app-error.js';

const FALLBACK_REPLY = 'Tunggu sebentar, teknisyen kami akan menghubungi anda.';

const SYSTEM_PROMPT =
  'Jawab hanya berdasarkan data CRM/POS; jika tiada data → guna templat fallback yang sopan.';

const MODEL = process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini';

const openai = (() => {
  if (!OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
})();

type Nullable<T> = T | null;

type TicketContext = {
  id: string;
  status: string;
  title: string;
  description?: string | null;
  price_estimate?: Prisma.Decimal | null;
  eta_ready_at?: Date | null;
  device?: {
    label: string | null;
    brand: string | null;
    model: string | null;
  } | null;
  invoice?: {
    number: string | null;
    status: string | null;
    total_amount: Prisma.Decimal | null;
    due_at: Date | null;
  } | null;
  quote?: {
    status: string | null;
    total_amount: Prisma.Decimal | null;
  } | null;
  events: {
    type: string;
    note: string | null;
    created_at: Date;
  }[];
  updated_at: Date;
};

type CustomerContext = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type DeviceContext = {
  id: string;
  label: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  status?: string | null;
};

export interface AiReplyInput {
  thread: string;
  question: string;
  customerId?: string;
  actorId?: string;
}

export interface AiReplyResult {
  reply: string;
  usedFallback: boolean;
  contextSummary: string[];
}

const redact = (value: string): string =>
  value
    .replace(
      /([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
      (_match, prefix, domain) => `${prefix}***${domain}`,
    )
    .replace(/\b\d{3,}\b/g, (match) => `${match.slice(0, 2)}***`);

const formatCurrency = (amount?: Prisma.Decimal | null): string => {
  if (!amount) return 'n/a';
  const num = Number(amount);
  if (Number.isNaN(num)) return 'n/a';
  return num.toLocaleString('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  });
};

const summariseTicket = (ticket: TicketContext): string => {
  const base = [
    `Tiket ${ticket.id}`,
    `Tajuk: ${ticket.title}`,
    `Status: ${ticket.status}`,
    `Kemaskini: ${ticket.updated_at.toISOString()}`,
  ];
  if (ticket.device) {
    base.push(
      `Peranti: ${[ticket.device.label, ticket.device.brand, ticket.device.model]
        .filter(Boolean)
        .join(' ')}`,
    );
  }
  if (ticket.price_estimate) {
    base.push(`Anggaran harga: ${formatCurrency(ticket.price_estimate)}`);
  }
  if (ticket.eta_ready_at) {
    base.push(`ETA siap: ${ticket.eta_ready_at.toISOString()}`);
  }
  if (ticket.invoice) {
    base.push(
      `Invois ${ticket.invoice.number ?? ticket.invoice?.status ?? ''} (${ticket.invoice?.status ?? 'n/a'}) jumlah ${formatCurrency(ticket.invoice?.total_amount)} due ${ticket.invoice?.due_at?.toISOString() ?? 'n/a'}`,
    );
  }
  if (ticket.quote) {
    base.push(
      `Sebutharga status ${ticket.quote.status ?? 'n/a'} jumlah ${formatCurrency(ticket.quote.total_amount)}`,
    );
  }
  if (ticket.events.length) {
    const notes = ticket.events
      .map((event) => `${event.created_at.toISOString()} ${event.type}${event.note ? `: ${event.note}` : ''}`)
      .join('\n');
    base.push(`Peristiwa terkini:\n${notes}`);
  }
  if (ticket.description) {
    base.push(`Ringkasan isu: ${ticket.description}`);
  }
  return base.join('\n');
};

const fallbackResult = (contextSummary: string[]): AiReplyResult => ({
  reply: FALLBACK_REPLY,
  usedFallback: true,
  contextSummary,
});

const ensureClient = () => {
  if (!openai) {
    throw new AppError(500, 'OpenAI client not configured');
  }
  return openai;
};

const buildContext = (input: {
  customer?: Nullable<CustomerContext>;
  devices: DeviceContext[];
  tickets: TicketContext[];
  threadInfo?: Nullable<{ remote_jid: string; device_label?: string | null }>;
}) => {
  const sections: string[] = [];
  if (input.customer) {
    const { name, phone, email, address, id } = input.customer;
    const customerDetails = [`ID: ${id}`, `Nama: ${name}`];
    if (phone) customerDetails.push(`Telefon: ${phone}`);
    if (email) customerDetails.push(`Email: ${email}`);
    if (address) customerDetails.push(`Alamat: ${address}`);
    sections.push(`Pelanggan:\n${customerDetails.join('\n')}`);
  }

  if (input.threadInfo) {
    sections.push(
      `Thread WhatsApp:\nRemote: ${input.threadInfo.remote_jid}${
        input.threadInfo.device_label ? `\nPeranti: ${input.threadInfo.device_label}` : ''
      }`,
    );
  }

  if (input.devices.length) {
    const deviceLines = input.devices.map((device) => {
      const attrs = [device.label];
      if (device.brand) attrs.push(device.brand);
      if (device.model) attrs.push(device.model);
      if (device.serial) attrs.push(`SN:${device.serial}`);
      if (device.status) attrs.push(`Status:${device.status}`);
      return attrs.join(' ');
    });
    sections.push(`Peranti berkaitan:\n${deviceLines.join('\n')}`);
  }

  if (input.tickets.length) {
    sections.push(
      `Tiket kerja berkaitan:\n${input.tickets.map((ticket) => summariseTicket(ticket)).join('\n\n')}`,
    );
  }

  return sections;
};

export const generateAiReply = async ({
  thread,
  question,
  customerId,
  actorId,
}: AiReplyInput): Promise<AiReplyResult> => {
  const threadRecord = thread
    ? await prisma.waThread.findFirst({
        where: {
          OR: [
            { id: thread },
            { remote_jid: thread },
          ],
        },
        include: {
          device: {
            select: {
              id: true,
              label: true,
              brand: true,
              model: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
            },
          },
        },
      })
    : null;

  const resolvedCustomerId = customerId ?? threadRecord?.customer_id ?? null;

  const customer = resolvedCustomerId
    ? await prisma.customer.findUnique({
        where: { id: resolvedCustomerId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
        },
      })
    : threadRecord?.customer
    ? {
        id: threadRecord.customer.id,
        name: threadRecord.customer.name,
        phone: threadRecord.customer.phone,
        email: threadRecord.customer.email,
        address: threadRecord.customer.address,
      }
    : null;

  const deviceFilter = threadRecord?.device?.id
    ? [{ device_id: threadRecord.device.id }]
    : [];

  const tickets = await prisma.workTicket.findMany({
    where: {
      deleted_at: null,
      OR: [
        ...(resolvedCustomerId ? [{ customer_id: resolvedCustomerId }] : []),
        ...deviceFilter,
      ],
    },
    include: {
      device: {
        select: { label: true, brand: true, model: true },
      },
      invoice: {
        select: {
          number: true,
          status: true,
          total_amount: true,
          due_at: true,
        },
      },
      quote: {
        select: {
          status: true,
          total_amount: true,
        },
      },
      events: {
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: {
          type: true,
          note: true,
          created_at: true,
        },
      },
    },
    orderBy: { updated_at: 'desc' },
    take: 5,
  });

  const devices = resolvedCustomerId
    ? await prisma.device.findMany({
        where: {
          deleted_at: null,
          customer_id: resolvedCustomerId,
        },
        select: {
          id: true,
          label: true,
          brand: true,
          model: true,
          serial: true,
          status: true,
        },
        take: 5,
        orderBy: { updated_at: 'desc' },
      })
    : threadRecord?.device
    ? [
        {
          id: threadRecord.device.id,
          label: threadRecord.device.label,
          brand: threadRecord.device.brand,
          model: threadRecord.device.model,
          serial: null,
          status: null,
        },
      ]
    : [];

  const contextSections = buildContext({
    customer: customer ?? null,
    devices,
    tickets: tickets.map((ticket): TicketContext => ({
      id: ticket.id,
      status: ticket.status,
      title: ticket.title,
      description: ticket.description,
      price_estimate: ticket.price_estimate,
      eta_ready_at: ticket.eta_ready_at,
      device: ticket.device,
      invoice: ticket.invoice,
      quote: ticket.quote,
      events: ticket.events,
      updated_at: ticket.updated_at,
    })),
    threadInfo: threadRecord
      ? {
          remote_jid: threadRecord.remote_jid,
          device_label: threadRecord.device?.label ?? null,
        }
      : null,
  });

  if (!contextSections.length) {
    if (question) {
      await prisma.auditLog.create({
        data: {
          entity: 'ai_reply',
          entity_id: thread ?? resolvedCustomerId ?? 'unknown',
          action: 'ai_response',
          diff: {
            prompt: redact(question),
            response: redact(FALLBACK_REPLY),
            reason: 'no_context',
          },
          metadata: {
            thread,
            customer_id: resolvedCustomerId,
            used_fallback: true,
          },
          actor_id: actorId ?? undefined,
        },
      });
    }
    return fallbackResult(contextSections);
  }

  const client = ensureClient();

  const prompt = `Soalan pelanggan: ${question}\n\nData berkaitan:\n${contextSections.join('\n\n')}`;

  try {
    const response = await client.responses.create({
      model: MODEL,
      temperature: 0.2,
      top_p: 0.8,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
    });

    const replyText = (response.output_text ?? '').trim() || FALLBACK_REPLY;
    const usedFallback = replyText === FALLBACK_REPLY;

    await prisma.auditLog.create({
      data: {
        entity: 'ai_reply',
        entity_id: thread ?? resolvedCustomerId ?? 'unknown',
        action: 'ai_response',
        diff: {
          prompt: redact(prompt),
          response: redact(replyText),
        },
        metadata: {
          thread,
          customer_id: resolvedCustomerId,
          model: MODEL,
          used_fallback: usedFallback,
        },
        actor_id: actorId ?? undefined,
      },
    });

    return {
      reply: replyText,
      usedFallback,
      contextSummary: contextSections,
    };
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        entity: 'ai_reply',
        entity_id: thread ?? resolvedCustomerId ?? 'unknown',
        action: 'ai_response_error',
        diff: {
          prompt: redact(prompt),
          error: error instanceof Error ? error.message : 'unknown_error',
        },
        metadata: {
          thread,
          customer_id: resolvedCustomerId,
        },
        actor_id: actorId ?? undefined,
      },
    });
    return fallbackResult(contextSections);
  }
};
