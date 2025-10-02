import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { WorkTicketEventType, WorkTicketStatus } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { createMockPrisma } from './helpers/prisma-mock.js';

const mock = createMockPrisma();

process.env.JWT_SECRET = 'test-secret';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: mock.prisma,
}));

const createAuthHeader = () => {
  const token = jwt.sign(
    {
      sub: 'test-user',
      role: 'admin',
      email: 'admin@example.com',
    },
    process.env.JWT_SECRET ?? 'test-secret',
  );

  return `Bearer ${token}`;
};

describe('Tickets routes', () => {
  let app: Express;
  let authHeader: string;

  beforeAll(async () => {
    const module = await import('../src/app.js');
    app = module.createApp();
    authHeader = createAuthHeader();
  });

  beforeEach(async () => {
    mock.reset();
  });

  test('POST /tickets/intake creates a ticket and audit event', async () => {
    const customer = await mock.prisma.customer.create({
      data: {
        name: 'Integration Customer',
        phone: '0123456789',
        email: 'integration@example.com',
        consents: { create: { channel: 'whatsapp', opt_in_at: new Date() } },
        devices: {
          create: {
            label: 'Integration Device',
            platform: 'Android',
            status: 'active',
          },
        },
      },
      include: { devices: true },
    });

    const response = await request(app)
      .post('/api/tickets/intake')
      .set('Authorization', authHeader)
      .send({
        customerId: customer.id,
        deviceId: customer.devices[0]?.id,
        title: 'Broken screen',
        description: 'Customer reported cracked screen',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      customer_id: customer.id,
      status: WorkTicketStatus.NEW,
    });

    const stored = mock.store.workTickets.get(response.body.data.id);
    expect(stored).not.toBeUndefined();

    const events = Array.from(mock.store.workTicketEvents.values()).filter(
      (event) => event.ticket_id === response.body.data.id,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(WorkTicketEventType.CREATED);
  });

  test('PATCH /tickets/:id/status updates ticket status and records history', async () => {
    const customer = await mock.prisma.customer.create({
      data: {
        name: 'Status Customer',
        phone: '0123456790',
        consents: { create: { channel: 'whatsapp', opt_in_at: new Date() } },
      },
    });

    const ticket = await mock.prisma.workTicket.create({
      data: {
        customer_id: customer.id,
        title: 'Diagnose battery issue',
        status: WorkTicketStatus.NEW,
      },
    });

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/status`)
      .set('Authorization', authHeader)
      .send({ status: WorkTicketStatus.IN_PROGRESS });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(WorkTicketStatus.IN_PROGRESS);

    const updated = mock.store.workTickets.get(ticket.id);
    expect(updated?.status).toBe(WorkTicketStatus.IN_PROGRESS);

    const history = Array.from(mock.store.workTicketEvents.values()).filter(
      (event) => event.ticket_id === ticket.id,
    );
    expect(history.some((event) => event.type === WorkTicketEventType.NOTE)).toBe(true);
  });
});
