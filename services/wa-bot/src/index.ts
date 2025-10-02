import http from 'node:http';
import { IncomingMessage, ServerResponse } from 'node:http';

import makeWASocket, {
  Browsers,
  DisconnectReason,
  WAMessage,
  WASocket,
  useMultiFileAuthState,
} from '@adiwajshing/baileys';
import { createLogger } from './logger.js';

import { ApiClient } from './api-client.js';
import { apiBaseUrl, apiEmail, apiPassword, deviceLabel, fallbackMessage, httpPort } from './config.js';
import { getMessageText, parseIntent } from './intents.js';

const logger = createLogger('wa-bot');
const apiClient = new ApiClient({ baseURL: apiBaseUrl, email: apiEmail, password: apiPassword, logger });

const takeoverSessions = new Set<string>();

const STOP_CONFIRMATION =
  'Baik, kami telah menghentikan mesej promosi untuk nombor ini. Balas START jika ingin melanggannya semula.';

const extractPhoneFromJid = (jid: string | undefined | null): string | null => {
  if (!jid) {
    return null;
  }

  const atIndex = jid.indexOf('@');
  const bare = atIndex >= 0 ? jid.slice(0, atIndex) : jid;
  const digits = bare.replace(/[^0-9+]/g, '');
  if (!digits) {
    return null;
  }

  return digits.startsWith('+') ? digits : `+${digits}`;
};

type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'READY' | 'CLOSED';

interface TicketInvoice {
  id: string;
  number: string;
  status: string;
  total_amount?: string | null;
  due_at?: string | null;
}

interface Ticket {
  id: string;
  status: TicketStatus;
  price_estimate?: string | number | null;
  eta_ready_at?: string | null;
  invoice?: TicketInvoice | null;
}

const statusLabels: Record<TicketStatus, string> = {
  NEW: 'Sedang menunggu pemeriksaan',
  IN_PROGRESS: 'Sedang dibaiki',
  READY: 'Sedia untuk diambil',
  CLOSED: 'Selesai',
};

const formatCurrency = (value: number) => `RM ${value.toFixed(2)}`;

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat('ms-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);

const parseDecimal = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface SendAttachment {
  type: 'image';
  url: string;
  caption?: string | null;
}

interface SendRequestPayload {
  to: string;
  text?: string;
  attachments?: SendAttachment[];
  tag?: string;
}

const parseBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  const maxSize = 512 * 1024; // 512KB payload limit

  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }

    const total = chunks.reduce((size, current) => size + current.length, 0);
    if (total > maxSize) {
      throw new Error('Payload too large');
    }
  }

  if (!chunks.length) {
    return null;
  }

  const buffer = Buffer.concat(chunks);
  const body = buffer.toString('utf8');
  try {
    return JSON.parse(body);
  } catch (error) {
    logger.warn({ body }, 'failed to parse JSON body');
    throw new Error('Invalid JSON payload');
  }
};

const normaliseRecipient = (value: string): string | null => {
  const digits = value.replace(/[^0-9+]/g, '');
  if (!digits) {
    return null;
  }

  const prefixed = digits.startsWith('+') ? digits : `+${digits}`;
  const number = prefixed.replace(/\+/g, '');
  if (!number) {
    return null;
  }

  return `${number}@s.whatsapp.net`;
};

const createHttpServer = (getSocket: () => WASocket | null) => {
  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (method === 'GET' && (url === '/healthz' || url === '/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'wa-bot',
          deviceLabel,
          takeoverSessions: takeoverSessions.size,
          apiConfigured: apiClient.isConfigured,
        }),
      );
      return;
    }

    if (method === 'POST' && url === '/send') {
      let payload: SendRequestPayload | null = null;
      try {
        const parsed = await parseBody(req);
        payload = (parsed as SendRequestPayload | null) ?? null;
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: (error as Error).message }));
        return;
      }

      if (!payload || typeof payload !== 'object') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Payload diperlukan' }));
        return;
      }

      const recipient = normaliseRecipient(payload.to);
      if (!recipient) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Nombor WhatsApp tidak sah' }));
        return;
      }

      const socket = getSocket();
      if (!socket) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Socket belum bersedia' }));
        return;
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

      const results: { type: 'text' | 'attachment'; status: 'sent' | 'skipped' | 'failed'; detail?: string | null }[] = [];

      if (text) {
        try {
          await socket.sendMessage(recipient, { text });
          results.push({ type: 'text', status: 'sent' });
        } catch (error) {
          logger.error({ err: error, recipient }, 'failed to send text message');
          results.push({ type: 'text', status: 'failed', detail: (error as Error).message });
        }
      } else {
        results.push({ type: 'text', status: 'skipped', detail: 'tiada mesej teks' });
      }

      for (const attachment of attachments) {
        if (!attachment || attachment.type !== 'image' || !attachment.url) {
          results.push({ type: 'attachment', status: 'skipped', detail: 'format lampiran tidak sah' });
          continue;
        }

        try {
          await socket.sendMessage(recipient, {
            image: { url: attachment.url },
            caption: attachment.caption ?? undefined,
          });
          results.push({ type: 'attachment', status: 'sent' });
        } catch (error) {
          logger.error({ err: error, recipient, attachment }, 'failed to send attachment');
          results.push({ type: 'attachment', status: 'failed', detail: (error as Error).message });
        }
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          to: recipient,
          tag: payload.tag ?? null,
          results,
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Not found' }));
  });

  server.listen(httpPort, () => {
    logger.info({ port: httpPort }, 'HTTP control server listening');
  });

  return server;
};

const logAudit = async (
  message: WAMessage,
  intent: string,
  response?: string,
  extra?: Record<string, unknown>,
) => {
  if (!apiClient.isConfigured) {
    logger.warn({ intent }, 'skipping audit log because API credentials missing');
    return;
  }

  try {
    await apiClient.logMessage({
      messageId: message.key.id ?? 'unknown',
      sender: message.key.remoteJid ?? 'unknown',
      intent,
      response,
      metadata: {
        pushName: message.pushName ?? null,
        fromMe: message.key.fromMe ?? null,
        timestamp: message.messageTimestamp ? Number(message.messageTimestamp) : Date.now() / 1000,
        text: getMessageText(message.message),
        ...(extra ?? {}),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to log audit event');
  }
};

const fetchTicket = async (ticketId: string): Promise<Ticket | null> => {
  if (!apiClient.isConfigured) {
    logger.warn('API not configured; unable to fetch ticket');
    return null;
  }

  try {
    const response = await apiClient.getTicket(ticketId);
    const ticket = response?.data?.data as Ticket | undefined;
    return ticket ?? null;
  } catch (error) {
    logger.error({ err: error, ticketId }, 'failed to fetch ticket from API');
    return null;
  }
};

type HandlerResult = { reply: string; success: boolean; context?: Record<string, unknown> };

const handleStatusIntent = (ticketId: string | undefined, ticket: Ticket | null): HandlerResult => {
  if (!ticketId || !ticket) {
    return { reply: fallbackMessage, success: false, context: { reason: 'ticket-unavailable', ticketId: ticketId ?? null } };
  }

  const parts = [`Status tiket ${ticketId}: ${statusLabels[ticket.status]}.`];
  const eta = parseDate(ticket.eta_ready_at ?? null);
  if (eta) {
    parts.push(`Anggaran siap: ${formatDateTime(eta)}.`);
  }

  return { reply: parts.join(' '), success: true, context: { ticketId, status: ticket.status } };
};

const handlePriceIntent = (ticketId: string | undefined, ticket: Ticket | null): HandlerResult => {
  if (!ticketId || !ticket) {
    return { reply: fallbackMessage, success: false, context: { reason: 'ticket-unavailable', ticketId: ticketId ?? null } };
  }

  const price = parseDecimal(ticket.price_estimate);
  if (price === null) {
    return {
      reply: 'Anggaran harga belum ditetapkan. Kami akan maklumkan sebaik sahaja siap.',
      success: true,
      context: { ticketId, status: ticket.status },
    };
  }

  return {
    reply: `Anggaran kos untuk tiket ${ticketId} ialah ${formatCurrency(price)}.`,
    success: true,
    context: { ticketId, price },
  };
};

const handleAppointmentIntent = (ticketId: string | undefined, ticket: Ticket | null): HandlerResult => {
  if (!ticketId || !ticket) {
    return { reply: fallbackMessage, success: false, context: { reason: 'ticket-unavailable', ticketId: ticketId ?? null } };
  }

  const eta = parseDate(ticket.eta_ready_at ?? null);
  if (!eta) {
    return {
      reply: 'Teknisi kami akan menghubungi anda untuk menetapkan masa janji temu.',
      success: true,
      context: { ticketId, status: ticket.status },
    };
  }

  return {
    reply: `Janji temu untuk tiket ${ticketId} dijangka pada ${formatDateTime(eta)}.`,
    success: true,
    context: { ticketId, eta: eta.toISOString() },
  };
};

const handleInvoiceIntent = (ticketId: string | undefined, ticket: Ticket | null): HandlerResult => {
  if (!ticketId || !ticket) {
    return { reply: fallbackMessage, success: false, context: { reason: 'ticket-unavailable', ticketId: ticketId ?? null } };
  }

  const invoice = ticket.invoice;
  if (!invoice) {
    return {
      reply: 'Invois belum dikeluarkan untuk tiket ini. Kami akan maklumkan sebaik sahaja tersedia.',
      success: true,
      context: { ticketId, status: ticket.status },
    };
  }

  const total = parseDecimal(invoice.total_amount ?? null);
  const due = parseDate(invoice.due_at ?? null);
  const parts = [`Invois ${invoice.number} berstatus ${invoice.status}.`];

  if (total !== null) {
    parts.push(`Jumlah: ${formatCurrency(total)}.`);
  }
  if (due) {
    parts.push(`Tarikh tamat tempoh: ${formatDateTime(due)}.`);
  }

  return {
    reply: parts.join(' '),
    success: true,
    context: { ticketId, invoiceId: invoice.id, invoiceStatus: invoice.status },
  };
};

const handleIntakeLink = async (reference: string | undefined, remoteJid: string): Promise<HandlerResult> => {
  if (!reference) {
    return { reply: fallbackMessage, success: false, context: { reason: 'missing-reference' } };
  }

  try {
    const response = await apiClient.createIntakeTicket({
      title: 'WhatsApp Intake',
      description: `Pautan borang dihantar melalui WhatsApp (${remoteJid}).`,
      intakeForm: {
        reference,
        source: 'whatsapp',
        remoteJid,
      },
    });

    const ticketId = response?.data?.data?.id as string | undefined;
    if (ticketId) {
      return {
        reply: `Terima kasih! Kami telah buka tiket baharu (${ticketId}). Pasukan kami akan menyemak maklumat tersebut.`,
        success: true,
        context: { ticketId },
      };
    }

    return {
      reply: 'Terima kasih! Kami akan semak pautan yang dihantar dan hubungi anda semula.',
      success: true,
      context: { reference },
    };
  } catch (error) {
    logger.error({ err: error }, 'failed to trigger intake link');
    return { reply: fallbackMessage, success: false, context: { reason: 'intake-request-failed', reference } };
  }
};

const handleIntent = async (sock: WASocket, message: WAMessage) => {
  const text = getMessageText(message.message);
  if (!text) {
    await logAudit(message, 'ignored', undefined, { reason: 'empty-text' });
    return;
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const remoteJid = message.key.remoteJid ?? 'unknown';

  const phoneForCampaign = extractPhoneFromJid(remoteJid);
  if (phoneForCampaign && apiClient.isConfigured) {
    try {
      await apiClient.recordCampaignReply({
        phone: phoneForCampaign,
        messageId: message.key.id ?? 'unknown',
        message: trimmed,
        timestamp: message.messageTimestamp ? Number(message.messageTimestamp) * 1000 : Date.now(),
      });
    } catch (error) {
      logger.warn({ err: error }, 'failed to record campaign reply');
    }
  }

  if (lower === 'stop') {
    try {
      await sock.sendMessage(remoteJid, { text: STOP_CONFIRMATION }, { quoted: message });
    } catch (error) {
      logger.error({ err: error }, 'failed to send STOP confirmation');
    }
    await logAudit(message, 'campaign-stop', STOP_CONFIRMATION, { campaignOptOut: true });
    return;
  }

  if (lower === '!takeover') {
    takeoverSessions.add(remoteJid);
    await logAudit(message, 'takeover', undefined, { takeover: true });
    logger.info({ remoteJid }, 'takeover activated, disabling auto-reply');
    return;
  }

  if (takeoverSessions.has(remoteJid)) {
    await logAudit(message, 'takeover-active');
    return;
  }

  const { intent, ticketId, intakeReference } = parseIntent(trimmed);
  let result: HandlerResult;

  try {
    if (intent === 'intake_form') {
      result = await handleIntakeLink(intakeReference, remoteJid);
    } else if (intent === 'unknown') {
      result = { reply: fallbackMessage, success: false, context: { reason: 'unknown-intent' } };
    } else {
      const ticket = ticketId ? await fetchTicket(ticketId) : null;
      switch (intent) {
        case 'status':
          result = handleStatusIntent(ticketId, ticket);
          break;
        case 'price':
          result = handlePriceIntent(ticketId, ticket);
          break;
        case 'appointment':
          result = handleAppointmentIntent(ticketId, ticket);
          break;
        case 'invoice':
          result = handleInvoiceIntent(ticketId, ticket);
          break;
        default:
          result = { reply: fallbackMessage, success: false, context: { reason: 'unknown-intent' } };
      }
    }
  } catch (error) {
    logger.error({ err: error, intent }, 'failed to handle message intent');
    result = { reply: fallbackMessage, success: false, context: { reason: 'handler-error' } };
  }

  const reply = result.reply ?? fallbackMessage;

  try {
    await sock.sendMessage(remoteJid, { text: reply }, { quoted: message });
  } catch (error) {
    logger.error({ err: error }, 'failed to send WhatsApp reply');
  }

  await logAudit(message, intent, reply, { ...result.context, success: result.success });
};

const registerMessageHandler = (sock: WASocket) => {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      const remoteJid = message.key.remoteJid ?? '';
      if (!remoteJid || remoteJid.endsWith('@g.us') || message.key.fromMe) {
        continue;
      }

      await handleIntent(sock, message);
    }
  });
};

const registerConnectionHandler = (sock: WASocket, recreate: () => WASocket) => {
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr, isOnline } = update;
    logger.info({ connection, isOnline, hasQR: Boolean(qr) }, 'connection update');

    if (connection === 'close') {
      const statusCode =
        (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        logger.warn({ reason: statusCode }, 'restarting WhatsApp socket');
        const next = recreate();
        registerMessageHandler(next);
        registerConnectionHandler(next, recreate);
      } else {
        logger.info('session ended, waiting for new login');
      }
    }
  });
};

const start = async () => {
  const auth = await useMultiFileAuthState('./session');
  let sock: WASocket | null = null;

  const connect = () => {
    const instance = makeWASocket({
      auth: auth.state,
      logger: logger as unknown as any,
      printQRInTerminal: true,
      browser: Browsers.appropriate(deviceLabel),
    });
    sock = instance;
    return instance;
  };

  const server = createHttpServer(() => sock);

  const attachHandlers = (instance: WASocket) => {
    instance.ev.on('creds.update', auth.saveCreds);
    registerMessageHandler(instance);
    registerConnectionHandler(instance, () => {
      const next = connect();
      attachHandlers(next);
      return next;
    });
  };

  const activeSocket = connect();
  attachHandlers(activeSocket);

  const shutdown = async () => {
    logger.info('shutting down');
    sock = null;
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((error) => {
  logger.error({ err: error }, 'failed to initialize WhatsApp bot');
  process.exit(1);
});
