import { Router } from 'express';
import { ConsentChannel, Prisma, WorkTicketStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';
import {
  CUSTOMER_FORM_SETTING_KEY,
  CustomerFormConfig,
  CustomerFormField,
  CustomerFormFieldType,
  getCustomerFormConfig,
} from '../services/customer-form-config.js';

const router = Router();

router.get(
  '/customer-form',
  asyncHandler(async (_req, res) => {
    const config = await getCustomerFormConfig();
    res.json({ data: config, key: CUSTOMER_FORM_SETTING_KEY });
  }),
);

const buildFieldSchema = (field: CustomerFormField) => {
  const baseError = `${field.label.en} is required`;

  const mapString = (schema: z.ZodString) =>
    field.required
      ? schema.min(1, baseError)
      : schema.optional().transform((value) => (value === undefined ? '' : value));

  let schema: z.ZodTypeAny;
  switch (field.type as CustomerFormFieldType) {
    case 'email':
      schema = mapString(z.string().email(`${field.label.en} must be a valid email`));
      break;
    case 'phone':
      schema = mapString(z.string());
      break;
    case 'textarea':
    case 'text':
      schema = mapString(z.string());
      break;
    case 'select':
      schema = field.required
        ? z
            .string()
            .min(1, baseError)
            .refine((value) => field.options?.some((option) => option.value === value), {
              message: `${field.label.en} is invalid`,
            })
        : z
            .string()
            .optional()
            .refine(
              (value) =>
                value === undefined || value === '' || field.options?.some((option) => option.value === value),
              { message: `${field.label.en} is invalid` },
            )
            .transform((value) => value ?? '');
      break;
    case 'checkbox':
      schema = field.required
        ? z.boolean().refine((value) => value === true, {
            message: `${field.label.en} must be accepted`,
          })
        : z.boolean().optional().default(false);
      break;
    case 'photos':
      schema = field.required
        ? z.array(z.string().min(1)).min(1, `${field.label.en} must include at least one photo`)
        : z.array(z.string().min(1)).optional().default([]);
      break;
    default:
      schema = z.any();
  }

  if (!field.enabled) {
    return z.any().optional().transform(() => undefined);
  }

  return schema;
};

const buildSubmissionSchema = (config: CustomerFormConfig) => {
  const shape: Record<string, z.ZodTypeAny> = {};

  config.fields.forEach((field) => {
    shape[field.id] = buildFieldSchema(field);
  });

  return z.object(shape);
};

router.post(
  '/customer-form',
  asyncHandler(async (req, res) => {
    const config = await getCustomerFormConfig();
    const schema = buildSubmissionSchema(config);
    const result = await schema.safeParseAsync(req.body);

    if (!result.success) {
      const flattened = result.error.flatten();
      const fieldErrors = Object.values(flattened.fieldErrors).flat();
      const messages = [...flattened.formErrors, ...fieldErrors].filter(Boolean);
      throw new AppError(400, messages.join(', ') || 'Invalid submission');
    }

    const payload = result.data as Record<string, unknown>;

    const extract = (key: CustomerFormField['id']) => payload[key];
    const getString = (key: CustomerFormField['id']) => {
      const value = extract(key);
      return typeof value === 'string' ? value.trim() : '';
    };

    const photos = Array.isArray(payload.photos) ? (payload.photos as string[]) : [];
    const customerName = getString('name');

    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const phone = getString('phone');
      const email = getString('email');
      const address = getString('address');

      const orConditions = [
        phone ? { phone: { equals: phone, mode: Prisma.QueryMode.insensitive } } : undefined,
        email ? { email: { equals: email, mode: Prisma.QueryMode.insensitive } } : undefined,
      ].filter(Boolean) as Prisma.CustomerWhereInput[];

      const customerWhere: Prisma.CustomerWhereInput = {
        deleted_at: null,
        ...(orConditions.length ? { OR: orConditions } : {}),
      };

      let customer = orConditions.length
        ? await tx.customer.findFirst({ where: customerWhere })
        : null;

      if (customer) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: customerName || customer.name,
            phone: phone || customer.phone,
            email: email || customer.email,
            address: address || customer.address,
          },
        });
      } else {
        customer = await tx.customer.create({
          data: {
            name: customerName,
            phone: phone || null,
            email: email || null,
            address: address || null,
          },
        });
      }

      const category = getString('category');
      const brand = getString('brand');
      const model = getString('model');
      const serial = getString('serial');
      const accessories = getString('accessories');

      let device = serial
        ? await tx.device.findFirst({
            where: { serial, deleted_at: null },
          })
        : null;

      if (!device && customer) {
        device = await tx.device.findFirst({
          where: {
            customer_id: customer.id,
            brand: brand || undefined,
            model: model || undefined,
            deleted_at: null,
          },
        });
      }

      const labelParts = [brand, model].filter(Boolean);
      const label = labelParts.join(' ').trim() || `${category || 'Device'} Intake`;

      if (device) {
        device = await tx.device.update({
          where: { id: device.id },
          data: {
            customer_id: customer.id,
            label,
            platform: category || device.platform,
            category: category || device.category,
            brand: brand || device.brand,
            model: model || device.model,
            serial: serial || device.serial,
            accessories: accessories || device.accessories,
          },
        });
      } else {
        device = await tx.device.create({
          data: {
            customer_id: customer.id,
            label,
            platform: category || null,
            category: category || null,
            brand: brand || null,
            model: model || null,
            serial: serial || null,
            accessories: accessories || null,
          },
        });
      }

      const description = getString('description');
      const ticketTitle = `${brand || category || 'Repair'} Intake`.trim();

      const ticket = await tx.workTicket.create({
        data: {
          customer_id: customer.id,
          device_id: device.id,
          status: WorkTicketStatus.NEW,
          title: ticketTitle,
          description: description || null,
        },
      });

      await tx.workTicketEvent.create({
        data: {
          ticket_id: ticket.id,
          type: 'CREATED',
          note: description || null,
          payload: {
            photos,
            accessories: accessories || null,
            category: category || null,
            brand: brand || null,
            model: model || null,
          },
        },
      });

      await tx.intakeForm.create({
        data: {
          ticket_id: ticket.id,
          raw: {
            configVersion: config.version,
            submission: payload,
          },
        },
      });

      const whatsappField = config.fields.find((field) => field.id === 'whatsappOptIn');
      if (whatsappField?.enabled) {
        const whatsappOptIn = Boolean(payload.whatsappOptIn);

        if (whatsappOptIn) {
          await tx.consent.upsert({
            where: {
              customer_id_channel: {
                customer_id: customer.id,
                channel: ConsentChannel.whatsapp,
              },
            },
            update: { opt_in_at: new Date(), opt_out_at: null },
            create: {
              customer_id: customer.id,
              channel: ConsentChannel.whatsapp,
              opt_in_at: new Date(),
            },
          });
        } else {
          await tx.consent.upsert({
            where: {
              customer_id_channel: {
                customer_id: customer.id,
                channel: ConsentChannel.whatsapp,
              },
            },
            update: { opt_out_at: new Date(), opt_in_at: null },
            create: {
              customer_id: customer.id,
              channel: ConsentChannel.whatsapp,
              opt_out_at: new Date(),
            },
          });
        }
      }

      return ticket;
    });

    res.status(201).json({ data: { ticketId: ticket.id } });
  }),
);

export default router;
