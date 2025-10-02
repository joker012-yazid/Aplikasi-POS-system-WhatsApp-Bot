import { proto } from '@adiwajshing/baileys';

export type IntentType =
  | 'status'
  | 'price'
  | 'appointment'
  | 'invoice'
  | 'intake_form'
  | 'unknown';

export interface IntentResult {
  intent: IntentType;
  ticketId?: string;
  intakeReference?: string;
}

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const intakePattern = /(https?:\/\/\S*forms\/(?:customer|intake)\S*|\bborang\s*(?:id)?\s*([0-9a-z-]{6,}))/i;

export const getMessageText = (message?: proto.IMessage | null): string | null => {
  if (!message) {
    return null;
  }

  if (message.conversation) {
    return message.conversation.trim();
  }

  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text.trim();
  }

  if (message.imageMessage?.caption) {
    return message.imageMessage.caption.trim();
  }

  if (message.videoMessage?.caption) {
    return message.videoMessage.caption.trim();
  }

  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return message.buttonsResponseMessage.selectedDisplayText.trim();
  }

  if (message.listResponseMessage?.title) {
    return message.listResponseMessage.title.trim();
  }

  if (message.templateButtonReplyMessage?.selectedDisplayText) {
    return message.templateButtonReplyMessage.selectedDisplayText.trim();
  }

  if (message.interactiveResponseMessage?.body?.text) {
    return message.interactiveResponseMessage.body.text.trim();
  }

  if (message.ephemeralMessage?.message) {
    return getMessageText(message.ephemeralMessage.message);
  }

  return null;
};

export const parseIntent = (text: string): IntentResult => {
  const lower = text.toLowerCase();
  const ticketId = text.match(uuidPattern)?.[0];

  if (/\bstatus\b/.test(lower)) {
    return { intent: 'status', ticketId };
  }

  if (/(harga|price|anggaran|estimate)/.test(lower)) {
    return { intent: 'price', ticketId };
  }

  if (/(janji temu|appointment|ambil|ready|eta)/.test(lower)) {
    return { intent: 'appointment', ticketId };
  }

  if (/(invois|invoice|bil|resit)/.test(lower)) {
    return { intent: 'invoice', ticketId };
  }

  const intakeMatch = text.match(intakePattern);
  if (intakeMatch) {
    return { intent: 'intake_form', intakeReference: intakeMatch[0] };
  }

  return { intent: 'unknown' };
};
