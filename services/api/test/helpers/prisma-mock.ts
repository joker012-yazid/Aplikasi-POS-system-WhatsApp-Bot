import { randomUUID } from 'node:crypto';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  CampaignEventType,
  WorkTicketEventType,
  WorkTicketStatus,
} from '@prisma/client';

interface CustomerRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: Date;
  updated_at: Date;
  consents: ConsentRecord[];
  devices: DeviceRecord[];
}

interface DeviceRecord {
  id: string;
  customer_id?: string | null;
  label: string;
  platform?: string | null;
  phone_number?: string | null;
  status?: string | null;
}

interface ConsentRecord {
  id: string;
  customer_id: string;
  opt_in_at?: Date | null;
  opt_out_at?: Date | null;
}

interface WorkTicketRecord {
  id: string;
  customer_id?: string | null;
  device_id?: string | null;
  status: WorkTicketStatus;
  title: string;
  description?: string | null;
  price_estimate?: number | null;
  eta_ready_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface WorkTicketEventRecord {
  id: string;
  ticket_id: string;
  type: WorkTicketEventType;
  note?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: Date;
}

interface IntakeFormRecord {
  id: string;
  ticket_id: string;
  raw: Record<string, unknown>;
}

interface CampaignRecord {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  status: CampaignStatus;
  scheduled_at?: Date | null;
  template_body?: string | null;
  template_variables: string[];
  created_at: Date;
  updated_at: Date;
}

interface CampaignSegmentRecord {
  id: string;
  campaign_id: string;
  key: string;
  name: string;
  timezone: string;
  throttle_per_minute: number;
  jitter_seconds: number;
  daily_cap: number;
  next_send_at?: Date | null;
  daily_quota_used: number;
  window_start_hour?: number | null;
  window_end_hour?: number | null;
  created_at: Date;
  updated_at: Date;
}

interface CampaignRecipientRecord {
  id: string;
  campaign_id: string;
  segment_id?: string | null;
  customer_id?: string | null;
  phone: string;
  name?: string | null;
  variables?: Record<string, unknown> | null;
  status: CampaignRecipientStatus;
  scheduled_for?: Date | null;
  sent_at?: Date | null;
  delivered_at?: Date | null;
  read_at?: Date | null;
  replied_at?: Date | null;
  opt_out_at?: Date | null;
  error?: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CampaignEventRecord {
  id: string;
  recipient_id: string;
  type: CampaignEventType;
  payload?: Record<string, unknown> | null;
  created_at: Date;
}

interface AuditLogRecord {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  diff?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  actor_id?: string | null;
  created_at: Date;
}

const now = () => new Date();

export const createMockPrisma = () => {
  const store = {
    customers: new Map<string, CustomerRecord>(),
    devices: new Map<string, DeviceRecord>(),
    consents: new Map<string, ConsentRecord>(),
    workTickets: new Map<string, WorkTicketRecord>(),
    workTicketEvents: new Map<string, WorkTicketEventRecord>(),
    intakeForms: new Map<string, IntakeFormRecord>(),
    campaigns: new Map<string, CampaignRecord>(),
    segments: new Map<string, CampaignSegmentRecord>(),
    recipients: new Map<string, CampaignRecipientRecord>(),
    events: new Map<string, CampaignEventRecord>(),
    auditLogs: new Map<string, AuditLogRecord>(),
  };

  const reset = () => {
    store.customers.clear();
    store.devices.clear();
    store.consents.clear();
    store.workTickets.clear();
    store.workTicketEvents.clear();
    store.intakeForms.clear();
    store.campaigns.clear();
    store.segments.clear();
    store.recipients.clear();
    store.events.clear();
    store.auditLogs.clear();
  };

  const prisma: Record<string, any> = {
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      return fn(prisma);
    },
    customer: {
      create: async ({ data, include }: any) => {
        const id = randomUUID();
        const customer: CustomerRecord = {
          id,
          name: data.name,
          phone: data.phone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          notes: data.notes ?? null,
          created_at: now(),
          updated_at: now(),
          consents: [],
          devices: [],
        };

        if (data.consents?.create) {
          const entries = Array.isArray(data.consents.create)
            ? data.consents.create
            : [data.consents.create];
          for (const entry of entries) {
            const consent: ConsentRecord = {
              id: randomUUID(),
              customer_id: id,
              opt_in_at: entry.opt_in_at ? new Date(entry.opt_in_at) : now(),
              opt_out_at: entry.opt_out_at ? new Date(entry.opt_out_at) : null,
            };
            store.consents.set(consent.id, consent);
            customer.consents.push(consent);
          }
        }

        if (data.devices?.create) {
          const entries = Array.isArray(data.devices.create)
            ? data.devices.create
            : [data.devices.create];
          for (const entry of entries) {
            const device: DeviceRecord = {
              id: randomUUID(),
              customer_id: id,
              label: entry.label,
              platform: entry.platform ?? null,
              phone_number: entry.phone_number ?? null,
              status: entry.status ?? null,
            };
            store.devices.set(device.id, device);
            customer.devices.push(device);
          }
        }

        store.customers.set(id, customer);

        return includeResponse(customer, include);
      },
      deleteMany: async () => {
        store.customers.clear();
        store.devices.clear();
        store.consents.clear();
      },
      findMany: async ({ where, include }: any) => {
        const results = Array.from(store.customers.values()).filter((record) => {
          if (where?.deleted_at === null && record) {
            // deleted_at not tracked; assume not deleted
          }
          if (where?.id?.in) {
            return where.id.in.includes(record.id);
          }
          if (where?.phone?.in) {
            return where.phone.in.includes(record.phone ?? '');
          }
          return true;
        });

        return results.map((record) => includeResponse(record, include));
      },
    },
    device: {
      deleteMany: async () => {
        store.devices.clear();
      },
    },
    consent: {
      deleteMany: async () => {
        store.consents.clear();
      },
      findMany: async ({ where }: any) => {
        return Array.from(store.consents.values()).filter((record) => {
          if (where?.customer_id?.in) {
            return where.customer_id.in.includes(record.customer_id);
          }
          if (where?.customer_id && record.customer_id !== where.customer_id) {
            return false;
          }
          if (where?.channel && where.channel !== 'whatsapp') {
            return false;
          }
          return true;
        });
      },
      upsert: async ({ where, create, update }: any) => {
        let existing: ConsentRecord | undefined;
        for (const record of store.consents.values()) {
          if (record.customer_id === where.customer_id_channel.customer_id) {
            existing = record;
            break;
          }
        }

        if (existing) {
          if (update.opt_in_at !== undefined) {
            existing.opt_in_at = update.opt_in_at ? new Date(update.opt_in_at) : null;
          }
          if (update.opt_out_at !== undefined) {
            existing.opt_out_at = update.opt_out_at ? new Date(update.opt_out_at) : null;
          }
          return existing;
        }

        const record: ConsentRecord = {
          id: randomUUID(),
          customer_id: where.customer_id_channel.customer_id,
          opt_in_at: create.opt_in_at ? new Date(create.opt_in_at) : null,
          opt_out_at: create.opt_out_at ? new Date(create.opt_out_at) : null,
        };
        store.consents.set(record.id, record);
        return record;
      },
    },
    workTicket: {
      create: async ({ data, include }: any) => {
        const id = randomUUID();
        const ticket: WorkTicketRecord = {
          id,
          customer_id: data.customer_id ?? null,
          device_id: data.device_id ?? null,
          status: data.status ?? WorkTicketStatus.NEW,
          title: data.title,
          description: data.description ?? null,
          price_estimate: data.price_estimate ?? null,
          eta_ready_at: data.eta_ready_at ? new Date(data.eta_ready_at) : null,
          created_at: now(),
          updated_at: now(),
        };
        store.workTickets.set(id, ticket);

        if (data.events?.create) {
          const entries = Array.isArray(data.events.create)
            ? data.events.create
            : [data.events.create];
          for (const entry of entries) {
            const event: WorkTicketEventRecord = {
              id: randomUUID(),
              ticket_id: id,
              type: entry.type,
              note: entry.note ?? null,
              payload: entry.payload ?? null,
              created_at: now(),
            };
            store.workTicketEvents.set(event.id, event);
          }
        }

        if (data.intake_forms?.create) {
          const forms = Array.isArray(data.intake_forms.create)
            ? data.intake_forms.create
            : [data.intake_forms.create];
          for (const form of forms) {
            const record: IntakeFormRecord = {
              id: randomUUID(),
              ticket_id: id,
              raw: form.raw,
            };
            store.intakeForms.set(record.id, record);
          }
        }

        return includeTicket(ticket, include);
      },
      deleteMany: async () => {
        store.workTickets.clear();
      },
      findUnique: async ({ where, include }: any) => {
        if (!where?.id) return null;
        const record = store.workTickets.get(where.id);
        if (!record) return null;
        return includeTicket(record, include);
      },
      findUniqueOrThrow: async ({ where, include }: any) => {
        const result = await prisma.workTicket.findUnique({ where, include });
        if (!result) {
          throw new Error('Record not found');
        }
        return result;
      },
      findFirst: async ({ where, include }: any) => {
        for (const record of store.workTickets.values()) {
          if (where?.id && record.id !== where.id) continue;
          if (where?.deleted_at === null) {
            // assume not deleted
          }
          return includeTicket(record, include);
        }
        return null;
      },
      update: async ({ where, data, include }: any) => {
        const record = store.workTickets.get(where.id);
        if (!record) throw new Error('Record not found');
        if (data.status) {
          record.status = data.status;
        }
        if (data.price_estimate !== undefined) {
          record.price_estimate = data.price_estimate;
        }
        if (data.eta_ready_at !== undefined) {
          record.eta_ready_at = data.eta_ready_at ? new Date(data.eta_ready_at) : null;
        }
        record.updated_at = now();
        store.workTickets.set(record.id, record);
        return includeTicket(record, include);
      },
    },
    workTicketEvent: {
      create: async ({ data }: any) => {
        const event: WorkTicketEventRecord = {
          id: randomUUID(),
          ticket_id: data.ticket_id,
          type: data.type,
          note: data.note ?? null,
          payload: data.payload ?? null,
          created_at: now(),
        };
        store.workTicketEvents.set(event.id, event);
        return event;
      },
      deleteMany: async () => {
        store.workTicketEvents.clear();
      },
      findMany: async ({ where }: any) => {
        const list = Array.from(store.workTicketEvents.values()).filter((event) => {
          if (where?.ticket_id) {
            return event.ticket_id === where.ticket_id;
          }
          if (where?.recipient_id) {
            return event.recipient_id === where.recipient_id;
          }
          return true;
        });
        list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        return list;
      },
    },
    intakeForm: {
      create: async ({ data }: any) => {
        const record: IntakeFormRecord = {
          id: randomUUID(),
          ticket_id: data.ticket_id,
          raw: data.raw,
        };
        store.intakeForms.set(record.id, record);
        return record;
      },
      deleteMany: async () => {
        store.intakeForms.clear();
      },
    },
    campaign: {
      create: async ({ data }: any) => {
        const id = randomUUID();
        const record: CampaignRecord = {
          id,
          name: data.name,
          slug: data.slug ?? null,
          description: data.description ?? null,
          status: data.status ?? CampaignStatus.DRAFT,
          scheduled_at: data.scheduled_at ? new Date(data.scheduled_at) : null,
          template_body: data.template_body ?? null,
          template_variables: data.template_variables ?? [],
          created_at: now(),
          updated_at: now(),
        };
        store.campaigns.set(id, record);
        return record;
      },
      deleteMany: async () => {
        store.campaigns.clear();
      },
      findFirst: async ({ where, include }: any) => {
        for (const campaign of store.campaigns.values()) {
          if (where?.id && campaign.id !== where.id) continue;
          if (where?.deleted_at === null) {
            // assume not deleted
          }
          return includeCampaign(campaign, include);
        }
        return null;
      },
      findUnique: async ({ where, include }: any) => {
        const campaign = store.campaigns.get(where.id);
        if (!campaign) return null;
        return includeCampaign(campaign, include);
      },
    },
    campaignSegment: {
      create: async ({ data }: any) => {
        const id = randomUUID();
        const record: CampaignSegmentRecord = {
          id,
          campaign_id: data.campaign_id,
          key: data.key,
          name: data.name ?? data.key,
          timezone: data.timezone ?? 'Asia/Kuala_Lumpur',
          throttle_per_minute: data.throttle_per_minute ?? 60,
          jitter_seconds: data.jitter_seconds ?? 0,
          daily_cap: data.daily_cap ?? 0,
          next_send_at: data.next_send_at ? new Date(data.next_send_at) : null,
          daily_quota_used: data.daily_quota_used ?? 0,
          window_start_hour: data.window_start_hour ?? null,
          window_end_hour: data.window_end_hour ?? null,
          created_at: now(),
          updated_at: now(),
        };
        store.segments.set(id, record);
        return record;
      },
      deleteMany: async () => {
        store.segments.clear();
      },
      findFirst: async ({ where }: any) => {
        for (const segment of store.segments.values()) {
          if (where?.campaign_id?.equals && segment.campaign_id !== where.campaign_id.equals) continue;
          if (where?.key?.equals && segment.key !== where.key.equals) continue;
          if (where?.deleted_at === null) {
            // assume not deleted
          }
          return segment;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const segment = store.segments.get(where.id);
        if (!segment) throw new Error('Segment not found');
        Object.assign(segment, data);
        segment.updated_at = now();
        store.segments.set(segment.id, segment);
        return segment;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = await prisma.campaignSegment.findFirst({ where });
        if (existing) {
          return prisma.campaignSegment.update({ where: { id: existing.id }, data: update });
        }
        return prisma.campaignSegment.create({ data: create });
      },
    },
    campaignRecipient: {
      create: async ({ data }: any) => {
        const id = randomUUID();
        const record: CampaignRecipientRecord = {
          id,
          campaign_id: data.campaign_id,
          segment_id: data.segment_id ?? null,
          customer_id: data.customer_id ?? null,
          phone: data.phone,
          name: data.name ?? null,
          variables: data.variables ?? null,
          status: data.status ?? CampaignRecipientStatus.PENDING,
          scheduled_for: data.scheduled_for ? new Date(data.scheduled_for) : null,
          sent_at: data.sent_at ? new Date(data.sent_at) : null,
          delivered_at: data.delivered_at ? new Date(data.delivered_at) : null,
          read_at: data.read_at ? new Date(data.read_at) : null,
          replied_at: data.replied_at ? new Date(data.replied_at) : null,
          opt_out_at: data.opt_out_at ? new Date(data.opt_out_at) : null,
          error: data.error ?? null,
          created_at: now(),
          updated_at: now(),
        };
        store.recipients.set(id, record);

        if (data.events?.create) {
          const entry = data.events.create;
          const event: CampaignEventRecord = {
            id: randomUUID(),
            recipient_id: id,
            type: entry.type,
            payload: entry.payload ?? null,
            created_at: now(),
          };
          store.events.set(event.id, event);
        }

        return record;
      },
      deleteMany: async () => {
        store.recipients.clear();
      },
      findMany: async ({ where, orderBy, take, include }: any) => {
        let list = Array.from(store.recipients.values());

        if (where?.campaign_id) {
          if (typeof where.campaign_id === 'string') {
            list = list.filter((record) => record.campaign_id === where.campaign_id);
          } else if (where.campaign_id?.equals) {
            list = list.filter((record) => record.campaign_id === where.campaign_id.equals);
          }
        }

        if (where?.phone?.in) {
          list = list.filter((record) => where.phone.in.includes(record.phone));
        } else if (where?.phone) {
          list = list.filter((record) => record.phone === where.phone);
        }

        if (where?.status?.in) {
          list = list.filter((record) => where.status.in.includes(record.status));
        } else if (where?.status) {
          list = list.filter((record) => record.status === where.status);
        }

        if (where?.id?.in) {
          list = list.filter((record) => where.id.in.includes(record.id));
        }

        if (where?.scheduled_for?.lte) {
          const cutoff = new Date(where.scheduled_for.lte);
          list = list.filter((record) => {
            if (!record.scheduled_for) {
              return false;
            }
            return record.scheduled_for.getTime() <= cutoff.getTime();
          });
        }

        if (orderBy?.scheduled_for === 'asc') {
          list.sort((a, b) => {
            const aTime = a.scheduled_for ? a.scheduled_for.getTime() : 0;
            const bTime = b.scheduled_for ? b.scheduled_for.getTime() : 0;
            return aTime - bTime;
          });
        }

        if (typeof take === 'number') {
          list = list.slice(0, take);
        }

        return list.map((record) => {
          if (!include) {
            return { ...record };
          }
          const result: Record<string, unknown> = { ...record };
          if (include.campaign) {
            result.campaign = store.campaigns.get(record.campaign_id) ?? null;
          }
          return result;
        });
      },
      findUnique: async ({ where }: any) => {
        if (where?.id) {
          return store.recipients.get(where.id) ?? null;
        }
        if (where?.campaign_id_phone) {
          const { campaign_id, phone } = where.campaign_id_phone;
          for (const record of store.recipients.values()) {
            if (record.campaign_id === campaign_id && record.phone === phone) {
              return record;
            }
          }
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const record = store.recipients.get(where.id);
        if (!record) {
          throw new Error('Recipient not found');
        }

        if (data.status !== undefined) {
          record.status = data.status;
        }
        if (data.sent_at !== undefined) {
          record.sent_at = data.sent_at ? new Date(data.sent_at) : null;
        }
        if (data.delivered_at !== undefined) {
          record.delivered_at = data.delivered_at ? new Date(data.delivered_at) : null;
        }
        if (data.read_at !== undefined) {
          record.read_at = data.read_at ? new Date(data.read_at) : null;
        }
        if (data.replied_at !== undefined) {
          record.replied_at = data.replied_at ? new Date(data.replied_at) : null;
        }
        if (data.opt_out_at !== undefined) {
          record.opt_out_at = data.opt_out_at ? new Date(data.opt_out_at) : null;
        }
        if (data.error !== undefined) {
          record.error = data.error ?? null;
        }
        record.updated_at = now();

        if (data.events?.create) {
          const entry = data.events.create;
          const event: CampaignEventRecord = {
            id: randomUUID(),
            recipient_id: record.id,
            type: entry.type,
            payload: entry.payload ?? null,
            created_at: now(),
          };
          store.events.set(event.id, event);
        }

        store.recipients.set(record.id, record);
        return { ...record };
      },
      updateMany: async ({ where, data }: any) => {
        const ids: string[] = Array.isArray(where?.id?.in) ? where.id.in : [];
        let count = 0;
        for (const id of ids) {
          const record = store.recipients.get(id);
          if (!record) {
            continue;
          }
          if (data.status !== undefined) {
            record.status = data.status;
          }
          if (data.opt_out_at !== undefined) {
            record.opt_out_at = data.opt_out_at ? new Date(data.opt_out_at) : null;
          }
          record.updated_at = now();
          store.recipients.set(id, record);
          count += 1;
        }
        return { count };
      },
    },
    campaignEvent: {
      create: async ({ data }: any) => {
        const event: CampaignEventRecord = {
          id: randomUUID(),
          recipient_id: data.recipient_id,
          type: data.type,
          payload: data.payload ?? null,
          created_at: now(),
        };
        store.events.set(event.id, event);
        return event;
      },
      createMany: async ({ data }: any) => {
        const entries = Array.isArray(data) ? data : [data];
        for (const entry of entries) {
          const event: CampaignEventRecord = {
            id: randomUUID(),
            recipient_id: entry.recipient_id,
            type: entry.type,
            payload: entry.payload ?? null,
            created_at: now(),
          };
          store.events.set(event.id, event);
        }
        return { count: entries.length };
      },
      deleteMany: async () => {
        store.events.clear();
      },
      findMany: async ({ where }: any) => {
        const list = Array.from(store.events.values()).filter((event) => {
          if (where?.recipient_id && event.recipient_id !== where.recipient_id) return false;
          return true;
        });
        return list;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const record: AuditLogRecord = {
          id: randomUUID(),
          entity: data.entity,
          entity_id: data.entity_id,
          action: data.action,
          diff: data.diff ?? null,
          metadata: data.metadata ?? null,
          actor_id: data.actor_id ?? null,
          created_at: now(),
        };
        store.auditLogs.set(record.id, record);
        return record;
      },
      deleteMany: async () => {
        store.auditLogs.clear();
      },
    },
  };

  const includeResponse = (customer: CustomerRecord, include: any) => {
    if (!include) {
      return { ...customer, consents: undefined, devices: undefined };
    }
    const result: Record<string, unknown> = { ...customer };
    if (include.devices) {
      result.devices = customer.devices.map((device) => ({ ...device }));
    }
    if (include.consents) {
      result.consents = customer.consents.map((consent) => ({ ...consent }));
    }
    return result;
  };

  const includeTicket = (ticket: WorkTicketRecord, include: any) => {
    const result: Record<string, unknown> = { ...ticket };
    if (include?.customer && ticket.customer_id) {
      const customer = store.customers.get(ticket.customer_id);
      result.customer = customer ? includeResponse(customer, include.customer) : null;
    }
    if (include?.device && ticket.device_id) {
      result.device = store.devices.get(ticket.device_id) ?? null;
    }
    if (include?.events) {
      const events = Array.from(store.workTicketEvents.values())
        .filter((event) => event.ticket_id === ticket.id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      result.events = include.events?.take ? events.slice(0, include.events.take) : events;
    }
    return result;
  };

  const includeCampaign = (campaign: CampaignRecord, include: any) => {
    const result: Record<string, unknown> = { ...campaign };
    if (include?.segments) {
      const segments = Array.from(store.segments.values()).filter(
        (segment) => segment.campaign_id === campaign.id,
      );
      result.segments = segments;
    }
    return result;
  };

  return { prisma, store, reset };
};
