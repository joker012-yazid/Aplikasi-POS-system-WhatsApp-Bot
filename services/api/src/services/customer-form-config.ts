import { prisma } from '../lib/prisma.js';

export const CUSTOMER_FORM_SETTING_KEY = 'customerForm';

export type CustomerFormSection = {
  id: 'personal' | 'device' | 'issue' | 'consent';
  title: { en: string; ms: string };
  description?: { en: string; ms: string };
};

export type CustomerFormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'photos';

export type CustomerFormOption = {
  value: string;
  label: { en: string; ms: string };
};

export type CustomerFormField = {
  id:
    | 'name'
    | 'phone'
    | 'email'
    | 'address'
    | 'category'
    | 'brand'
    | 'model'
    | 'serial'
    | 'accessories'
    | 'description'
    | 'photos'
    | 'terms'
    | 'whatsappOptIn';
  section: CustomerFormSection['id'];
  type: CustomerFormFieldType;
  label: { en: string; ms: string };
  placeholder?: { en: string; ms: string };
  helperText?: { en: string; ms: string };
  options?: CustomerFormOption[];
  enabled: boolean;
  required: boolean;
};

export type CustomerFormConfig = {
  version: number;
  sections: CustomerFormSection[];
  fields: CustomerFormField[];
};

type StoredConfig = {
  version?: number;
  fields?: Array<Pick<CustomerFormField, 'id' | 'enabled' | 'required'>>;
} | null;

export const defaultCustomerFormConfig: CustomerFormConfig = {
  version: 1,
  sections: [
    {
      id: 'personal',
      title: { en: 'Personal Details', ms: 'Maklumat Peribadi' },
    },
    {
      id: 'device',
      title: { en: 'Device Information', ms: 'Maklumat Peranti' },
    },
    {
      id: 'issue',
      title: { en: 'Issue Summary', ms: 'Ringkasan Masalah' },
    },
    {
      id: 'consent',
      title: { en: 'Consent', ms: 'Persetujuan' },
      description: {
        en: 'Please confirm the agreements before submitting.',
        ms: 'Sila sahkan persetujuan sebelum hantar.',
      },
    },
  ],
  fields: [
    {
      id: 'name',
      section: 'personal',
      type: 'text',
      label: { en: 'Full Name', ms: 'Nama Penuh' },
      placeholder: {
        en: 'e.g. Ahmad bin Ali',
        ms: 'cth. Ahmad bin Ali',
      },
      enabled: true,
      required: true,
    },
    {
      id: 'phone',
      section: 'personal',
      type: 'phone',
      label: { en: 'Phone Number', ms: 'Nombor Telefon' },
      placeholder: {
        en: 'e.g. 0123456789',
        ms: 'cth. 0123456789',
      },
      enabled: true,
      required: true,
    },
    {
      id: 'email',
      section: 'personal',
      type: 'email',
      label: { en: 'Email', ms: 'E-mel' },
      enabled: true,
      required: false,
    },
    {
      id: 'address',
      section: 'personal',
      type: 'textarea',
      label: { en: 'Address', ms: 'Alamat' },
      enabled: true,
      required: false,
    },
    {
      id: 'category',
      section: 'device',
      type: 'select',
      label: { en: 'Device Category', ms: 'Kategori Peranti' },
      options: [
        { value: 'laptop', label: { en: 'Laptop', ms: 'Komputer Riba' } },
        { value: 'printer', label: { en: 'Printer', ms: 'Pencetak' } },
        { value: 'pc', label: { en: 'PC', ms: 'Komputer Meja' } },
      ],
      enabled: true,
      required: true,
    },
    {
      id: 'brand',
      section: 'device',
      type: 'text',
      label: { en: 'Brand', ms: 'Jenama' },
      enabled: true,
      required: true,
    },
    {
      id: 'model',
      section: 'device',
      type: 'text',
      label: { en: 'Model', ms: 'Model' },
      enabled: true,
      required: true,
    },
    {
      id: 'serial',
      section: 'device',
      type: 'text',
      label: { en: 'Serial Number', ms: 'Nombor Siri' },
      enabled: true,
      required: false,
    },
    {
      id: 'accessories',
      section: 'device',
      type: 'textarea',
      label: { en: 'Accessories Included', ms: 'Aksesori Disertakan' },
      helperText: {
        en: 'List any chargers, cables, or extras handed over.',
        ms: 'Senaraikan pengecas, kabel atau aksesori lain.',
      },
      enabled: true,
      required: false,
    },
    {
      id: 'description',
      section: 'issue',
      type: 'textarea',
      label: { en: 'Describe the Issue', ms: 'Terangkan Masalah' },
      helperText: {
        en: 'Share symptoms, error messages, or recent damage.',
        ms: 'Kongsi simptom, mesej ralat, atau kerosakan terbaru.',
      },
      enabled: true,
      required: true,
    },
    {
      id: 'photos',
      section: 'issue',
      type: 'photos',
      label: { en: 'Photos', ms: 'Foto' },
      helperText: {
        en: 'Attach clear photos of the device or issue (optional).',
        ms: 'Lampirkan foto peranti atau masalah (pilihan).',
      },
      enabled: true,
      required: false,
    },
    {
      id: 'terms',
      section: 'consent',
      type: 'checkbox',
      label: {
        en: 'I accept the service Terms & Conditions',
        ms: 'Saya bersetuju dengan Terma & Syarat Servis',
      },
      required: true,
      enabled: true,
    },
    {
      id: 'whatsappOptIn',
      section: 'consent',
      type: 'checkbox',
      label: {
        en: 'I agree to receive WhatsApp updates about my repair',
        ms: 'Saya setuju menerima kemas kini WhatsApp mengenai pembaikan',
      },
      helperText: {
        en: 'We will only message relevant updates for your repair status.',
        ms: 'Kami hanya akan menghantar kemas kini berkaitan status pembaikan.',
      },
      required: true,
      enabled: true,
    },
  ],
};

const mergeConfig = (stored: StoredConfig): CustomerFormConfig => {
  const overrides = new Map(
    (stored?.fields ?? []).map((field) => [field.id, field]),
  );

  return {
    ...defaultCustomerFormConfig,
    version: stored?.version ?? defaultCustomerFormConfig.version,
    fields: defaultCustomerFormConfig.fields.map((field) => {
      const override = overrides.get(field.id);
      return {
        ...field,
        ...(override
          ? {
              enabled:
                override.enabled === undefined ? field.enabled : override.enabled,
              required:
                override.required === undefined
                  ? field.required
                  : override.required,
            }
          : {}),
      };
    }),
  };
};

export const getCustomerFormConfig = async (): Promise<CustomerFormConfig> => {
  const setting = await prisma.setting.findUnique({
    where: { key: CUSTOMER_FORM_SETTING_KEY },
  });

  return mergeConfig((setting?.value as StoredConfig) ?? null);
};
