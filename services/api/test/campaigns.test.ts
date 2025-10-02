import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { CampaignEventType, CampaignRecipientStatus, CampaignStatus } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { createMockPrisma } from './helpers/prisma-mock.js';
import { recordRecipientEvent } from '../src/services/campaign-service.js';

const mock = createMockPrisma();

process.env.JWT_SECRET = 'test-secret';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: mock.prisma,
}));

const createAuthHeader = () => {
  const token = jwt.sign(
    {
      sub: 'campaign-tester',
      role: 'admin',
      email: 'campaign@example.com',
    },
    process.env.JWT_SECRET ?? 'test-secret',
  );

  return `Bearer ${token}`;
};

describe('Campaign routes', () => {
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

  test('POST /campaigns creates a campaign with template variables', async () => {
    const response = await request(app)
      .post('/api/campaigns')
      .set('Authorization', authHeader)
      .send({
        name: 'Promo Raya',
        description: 'Seasonal promotion',
        template_body: 'Hai {{name}}, promosi {{product}} untuk anda!',
        status: CampaignStatus.SCHEDULED,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'Promo Raya',
      template_variables: ['name', 'product'],
    });

    const stored = mock.store.campaigns.get(response.body.data.id);
    expect(stored).not.toBeUndefined();
    expect(stored?.template_variables).toEqual(['name', 'product']);
  });

  test('POST /campaigns/:id/import queues opted-in recipients and skips opt-outs', async () => {
    const campaign = await mock.prisma.campaign.create({
      data: {
        name: 'Welcome Series',
        status: CampaignStatus.DRAFT,
      },
    });

    const optedIn = await mock.prisma.customer.create({
      data: {
        name: 'Opted In Customer',
        phone: '0123456600',
        consents: { create: { channel: 'whatsapp', opt_in_at: new Date() } },
      },
    });

    const optedOut = await mock.prisma.customer.create({
      data: {
        name: 'Opted Out Customer',
        phone: '0123456611',
        consents: {
          create: {
            channel: 'whatsapp',
            opt_in_at: new Date(Date.now() - 86_400_000),
            opt_out_at: new Date(),
          },
        },
      },
    });

    const response = await request(app)
      .post(`/api/campaigns/${campaign.id}/import`)
      .set('Authorization', authHeader)
      .send({
        segment: { key: 'default', name: 'Default Segment', throttlePerMinute: 30 },
        recipients: [
          { customerId: optedIn.id },
          { customerId: optedOut.id },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.inserted).toBe(1);
    expect(response.body.data.skipped).toHaveLength(1);

    const recipients = Array.from(mock.store.recipients.values()).filter(
      (record) => record.campaign_id === campaign.id,
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.status).toBe(CampaignRecipientStatus.SCHEDULED);

    const events = Array.from(mock.store.events.values()).filter(
      (event) => event.recipient_id === recipients[0]?.id,
    );
    expect(events).not.toHaveLength(0);
  });

  test('recordRecipientEvent propagates opt-out across scheduled recipients', async () => {
    const campaignA = await mock.prisma.campaign.create({
      data: { name: 'Series A', status: CampaignStatus.RUNNING },
    });
    const campaignB = await mock.prisma.campaign.create({
      data: { name: 'Series B', status: CampaignStatus.RUNNING },
    });

    const primary = await mock.prisma.campaignRecipient.create({
      data: {
        campaign_id: campaignA.id,
        phone: '0123456788',
        status: CampaignRecipientStatus.SCHEDULED,
      },
    });
    const secondary = await mock.prisma.campaignRecipient.create({
      data: {
        campaign_id: campaignB.id,
        phone: '0123456788',
        status: CampaignRecipientStatus.SCHEDULED,
      },
    });
    await mock.prisma.campaignRecipient.create({
      data: {
        campaign_id: campaignB.id,
        phone: '0999988776',
        status: CampaignRecipientStatus.SCHEDULED,
      },
    });

    const timestamp = new Date();
    await recordRecipientEvent(primary.id, CampaignEventType.OPT_OUT, timestamp, { reason: 'user_request' });

    const propagated = mock.store.recipients.get(secondary.id);
    expect(propagated?.status).toBe(CampaignRecipientStatus.OPTED_OUT);
    expect(propagated?.opt_out_at).toBeInstanceOf(Date);

    const optOutEvents = Array.from(mock.store.events.values()).filter(
      (event) => event.recipient_id === secondary.id && event.type === CampaignEventType.OPT_OUT,
    );
    expect(optOutEvents).toHaveLength(1);
  });
});
