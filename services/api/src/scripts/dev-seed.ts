import { Prisma, PrismaClient, WorkTicketEventType, WorkTicketStatus } from '@prisma/client';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DATABASE_URL =
  process.env.DEV_SEED_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/dev_seed';

function ensureDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = url;
    console.log(`⚙️  DATABASE_URL not set. Using fallback: ${url}`);
  }

  return url;
}

async function pushTestSchema(databaseUrl: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const schemaPath = path.resolve(__dirname, '../../../../prisma/schema.test.prisma');
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      pnpmCommand,
      [
        'exec',
        'prisma',
        'db',
        'push',
        '--skip-generate',
        '--force-reset',
        '--accept-data-loss',
        '--schema',
        schemaPath,
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`prisma db push exited with code ${code}`));
      }
    });
  });
}
let prisma: PrismaClient;

const productNames = [
  'Screen Protector Deluxe',
  'Phone Battery Pack',
  'Wireless Charger Pad',
  'USB-C Cable 2m',
  'Bluetooth Earbuds',
  'Protective Phone Case',
  'Tablet Stylus Pen',
  'Laptop Cooling Stand',
  'Gaming Mouse',
  'Mechanical Keyboard',
];

const customerNames = [
  'Aisyah Rahman',
  'Hafiz Abdullah',
  'Nurul Izzati',
  'Lim Wei Jian',
  'Siti Aminah',
  "Kumaravel Naidu",
  'Daniel Wong',
  'Farah Ali',
  'Grace Tan',
  'Imran Malik',
];

const statuses: WorkTicketStatus[] = [
  WorkTicketStatus.NEW,
  WorkTicketStatus.IN_PROGRESS,
  WorkTicketStatus.READY,
];

const pad = (value: number, length = 3) => String(value).padStart(length, '0');

async function clearExistingData(client: PrismaClient) {
  await client.workTicketEvent.deleteMany();
  await client.intakeForm.deleteMany();
  await client.workTicket.deleteMany();
  await client.campaignEvent.deleteMany();
  await client.campaignRecipient.deleteMany();
  await client.campaignSegment.deleteMany();
  await client.campaign.deleteMany();
  await client.inventoryMove.deleteMany();
  await client.productBundleItem.deleteMany();
  await client.invoiceItem.deleteMany();
  await client.invoice.deleteMany();
  await client.quoteItem.deleteMany();
  await client.quote.deleteMany();
  await client.device.deleteMany();
  await client.consent.deleteMany();
  await client.waThread.deleteMany();
  await client.customer.deleteMany();
  await client.product.deleteMany();
}

async function seedProducts(client: PrismaClient) {
  const results = [] as Array<{ id: string }>;

  for (let index = 0; index < productNames.length; index += 1) {
    const price = new Prisma.Decimal(49 + index * 8);
    const wholesale = price.minus(10);

    const product = await client.product.create({
      data: {
        sku: `SKU-${pad(index + 1)}`,
        name: productNames[index],
        description: `${productNames[index]} sample inventory item`,
        price,
        wholesale_price: wholesale,
        currency: 'MYR',
        min_stock: (index % 3) + 1,
        is_active: true,
        inventory: {
          create: {
            type: 'IN',
            quantity: 25 - index,
            reference: 'dev-seed',
            notes: 'Initial seeded stock',
          },
        },
      },
      select: { id: true },
    });

    results.push(product);
  }

  return results;
}

async function seedCustomers(client: PrismaClient) {
  const results: Array<{ id: string; deviceId: string | null }> = [];

  for (let index = 0; index < customerNames.length; index += 1) {
    const phone = `0123${pad(index + 1, 4)}`;
    const customer = await client.customer.create({
      data: {
        name: customerNames[index],
        phone,
        email: `customer${index + 1}@example.com`,
        address: `123 Sample Street #${index + 1}`,
        consents: {
          create: {
            channel: 'whatsapp',
            opt_in_at: new Date(),
          },
        },
        devices: {
          create: {
            label: `${customerNames[index]}'s Device`,
            platform: index % 2 === 0 ? 'Android' : 'iOS',
            status: 'active',
          },
        },
      },
      include: { devices: true },
    });

    results.push({ id: customer.id, deviceId: customer.devices[0]?.id ?? null });
  }

  return results;
}

async function seedTickets(client: PrismaClient, customers: Array<{ id: string; deviceId: string | null }>) {
  let counter = 1;

  for (const status of statuses) {
    for (let index = 0; index < 3; index += 1) {
      const customer = customers[(counter - 1) % customers.length];
      const events: Array<{
        type: WorkTicketEventType;
        note?: string | null;
        payload?: Record<string, unknown> | null;
      }> = [
        {
          type: WorkTicketEventType.CREATED,
          note: 'Ticket created during development seeding',
          payload: { source: 'dev:seed' },
        },
      ];

      if (status !== WorkTicketStatus.NEW) {
        events.push({
          type: WorkTicketEventType.NOTE,
          note: `Status updated to ${status}`,
          payload: { source: 'dev:seed', status },
        });
      }

      await client.workTicket.create({
        data: {
          customer_id: customer.id,
          device_id: customer.deviceId,
          title: `Seed Ticket ${pad(counter)}`,
          description: `Seeded ticket currently ${status.replace('_', ' ').toLowerCase()}`,
          status,
          price_estimate:
            status === WorkTicketStatus.NEW
              ? null
              : new Prisma.Decimal(80 + counter * 5),
          eta_ready_at:
            status === WorkTicketStatus.NEW
              ? null
              : new Date(Date.now() + index * 60 * 60 * 1000),
          events: {
            create: events,
          },
        },
      });

      counter += 1;
    }
  }
}

async function main() {
  const databaseUrl = ensureDatabaseUrl();
  console.log('🗄️  Ensuring development schema is up to date...');
  await pushTestSchema(databaseUrl);

  prisma = new PrismaClient();

  console.log('🔄 Clearing existing seed data...');
  await clearExistingData(prisma);

  console.log('📦 Creating products...');
  await seedProducts(prisma);

  console.log('👤 Creating customers and devices...');
  const customers = await seedCustomers(prisma);

  console.log('🎫 Creating work tickets...');
  await seedTickets(prisma, customers);

  console.log('✅ Development data seeded successfully.');
}

main()
  .catch((error) => {
    console.error('❌ Failed to seed development data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
