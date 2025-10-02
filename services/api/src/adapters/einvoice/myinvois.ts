import { Prisma } from '@prisma/client';

import { MYINVOIS_MODE } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import type { InvoiceWithRelations } from '../../types/invoice.js';
import { createZipArchive } from '../../utils/zip.js';

export const MYINVOIS_SETTING_KEY = 'einvoice.myinvois';

export type MyInvoisMode = 'portal' | 'api' | 'disabled';

interface SupplierDetails {
  tin: string;
  businessName: string;
  branchCode: string;
  address: string;
  email: string;
  phone: string;
}

interface DefaultSettings {
  currency: string;
}

interface ApiSettings {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  environment: string;
}

interface StoredMyInvoisConfig {
  mode?: string | null;
  supplier?: Partial<SupplierDetails> & { name?: string | null };
  defaults?: Partial<DefaultSettings>;
  api?: Partial<ApiSettings>;
}

export interface ResolvedMyInvoisConfig {
  mode: MyInvoisMode;
  supplier: SupplierDetails;
  defaults: DefaultSettings;
  api: ApiSettings;
}

export interface PortalExportTotals {
  gross: number;
  discount: number;
  net: number;
  tax: number;
  payable: number;
  paid: number;
  balance: number;
}

export interface PortalExport {
  zipFileName: string;
  xmlFileName: string;
  jsonFileName: string;
  zipBase64: string;
  xml: string;
  json: Record<string, unknown>;
  totals: PortalExportTotals;
  warnings: string[];
}

export interface ApiStubResult {
  status: 'stub';
  message: string;
  payload: Record<string, unknown>;
  config: {
    baseUrl?: string;
    clientId?: string;
    environment?: string;
  };
  warnings: string[];
}

export interface MyInvoisArtifacts {
  mode: MyInvoisMode;
  generatedAt: string;
  configSummary: {
    supplierTin?: string;
    currency: string;
    environment?: string;
  };
  warnings: string[];
  portal?: PortalExport;
  api?: ApiStubResult;
}

const normaliseMode = (value?: string | null): MyInvoisMode => {
  if (!value) {
    return 'portal';
  }
  const lower = value.toLowerCase();
  if (lower === 'api') return 'api';
  if (lower === 'portal') return 'portal';
  if (lower === 'disabled' || lower === 'off' || lower === 'none') return 'disabled';
  return 'portal';
};

const normaliseCurrency = (value?: string | null): string => {
  if (!value || typeof value !== 'string') {
    return 'MYR';
  }
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : 'MYR';
};

const sanitiseTin = (value?: string | null): string => {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const decimalToNumber = (value?: Prisma.Decimal | number | string | null): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (value instanceof Prisma.Decimal) {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
};

const roundAmount = (value: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const collectTotals = (invoice: InvoiceWithRelations) => {
  const metadata = asRecord(invoice.metadata);
  const lineTotal = invoice.items.reduce(
    (sum, item) => sum + decimalToNumber(item.total_price),
    0,
  );

  const grossSubtotal =
    typeof metadata.gross_subtotal === 'number' ? metadata.gross_subtotal : lineTotal;
  const subtotal = typeof metadata.subtotal === 'number' ? metadata.subtotal : lineTotal;
  const discountTotal =
    typeof metadata.discount_total === 'number'
      ? metadata.discount_total
      : Number(metadata.line_discount_total ?? 0) || 0;
  const taxAmount = typeof metadata.tax_amount === 'number' ? metadata.tax_amount : 0;
  const totalAmount = decimalToNumber(invoice.total_amount) || subtotal + taxAmount;
  const totalPaid = invoice.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );

  const balance = Math.max(roundAmount(totalAmount - totalPaid), 0);

  return {
    grossSubtotal: roundAmount(grossSubtotal),
    subtotal: roundAmount(subtotal),
    discountTotal: roundAmount(discountTotal),
    taxAmount: roundAmount(taxAmount),
    totalAmount: roundAmount(totalAmount),
    totalPaid: roundAmount(totalPaid),
    balance,
  };
};

const resolveCustomerTin = (invoice: InvoiceWithRelations): string => {
  const metadata = asRecord(invoice.metadata);
  const candidateKeys = ['customer_tin', 'customerTin', 'buyer_tin', 'buyerTin'];
  for (const key of candidateKeys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return sanitiseTin(value);
    }
  }
  return '';
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildPortalJson = (
  invoice: InvoiceWithRelations,
  config: ResolvedMyInvoisConfig,
  totals: ReturnType<typeof collectTotals>,
  warnings: string[],
) => {
  const issueDate = invoice.issued_at ?? new Date();
  const issueDateIso = issueDate instanceof Date ? issueDate.toISOString() : new Date(issueDate).toISOString();
  const customerTin = resolveCustomerTin(invoice);
  const metadata = asRecord(invoice.metadata);
  const offlineReference =
    (typeof metadata.offline_id === 'string' && metadata.offline_id) ||
    (typeof metadata.offlineId === 'string' && metadata.offlineId) ||
    null;

  if (!customerTin) {
    warnings.push('TIN pelanggan tidak tersedia. Pastikan nombor cukai pelanggan diisi sebelum memuat naik.');
  }

  return {
    DocumentType: 'INVOICE',
    DocumentNumber: invoice.number,
    IssueDate: issueDateIso,
    Currency: config.defaults.currency,
    Supplier: {
      TIN: config.supplier.tin,
      Name: config.supplier.businessName,
      BranchCode: config.supplier.branchCode,
      Address: config.supplier.address,
      Email: config.supplier.email,
      Phone: config.supplier.phone,
    },
    Customer: {
      Name: invoice.customer?.name ?? 'Pelanggan',
      TIN: customerTin,
      Email: invoice.customer?.email ?? null,
      Phone: invoice.customer?.phone ?? null,
    },
    Items: invoice.items.map((item, index) => {
      const itemMetadata = asRecord(item.metadata);
      const discount = typeof itemMetadata.discount === 'number' ? itemMetadata.discount : 0;
      return {
        SequenceNumber: index + 1,
        Description: item.description,
        SKU: item.product?.sku ?? null,
        Quantity: item.quantity,
        UnitPrice: roundAmount(decimalToNumber(item.unit_price)),
        Discount: roundAmount(discount),
        TaxCode: typeof itemMetadata.tax_code === 'string' ? itemMetadata.tax_code : 'SR',
        TotalAmount: roundAmount(decimalToNumber(item.total_price)),
      };
    }),
    Totals: {
      Gross: totals.grossSubtotal,
      Discount: totals.discountTotal,
      Net: totals.subtotal,
      Tax: totals.taxAmount,
      Payable: totals.totalAmount,
      Paid: totals.totalPaid,
      BalanceDue: totals.balance,
    },
    Payments: invoice.payments.map((payment) => ({
      Amount: roundAmount(decimalToNumber(payment.amount)),
      Method: payment.method ?? 'CASH',
      PaidAt:
        payment.paid_at instanceof Date
          ? payment.paid_at.toISOString()
          : payment.paid_at
            ? new Date(payment.paid_at).toISOString()
            : new Date().toISOString(),
      Reference: payment.reference ?? null,
    })),
    Metadata: {
      InvoiceId: invoice.id,
      OfflineReference: offlineReference,
    },
  };
};

const buildPortalXml = (
  invoice: InvoiceWithRelations,
  config: ResolvedMyInvoisConfig,
  totals: ReturnType<typeof collectTotals>,
): string => {
  const issueDate = invoice.issued_at ?? new Date();
  const date = issueDate instanceof Date ? issueDate : new Date(issueDate);
  const dateString = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  const customerTin = resolveCustomerTin(invoice);
  const supplierName = config.supplier.businessName || 'Pembekal';
  const currency = config.defaults.currency;

  const lines = invoice.items
    .map((item, index) => {
      const itemMetadata = asRecord(item.metadata);
      const sku = item.product?.sku ?? '';
      const lineAmount = roundAmount(decimalToNumber(item.total_price));
      const unitPrice = roundAmount(decimalToNumber(item.unit_price));
      const taxCode = typeof itemMetadata.tax_code === 'string' ? itemMetadata.tax_code : 'SR';
      return `    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${lineAmount.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${escapeXml(item.description)}</cbc:Name>
        ${sku ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(sku)}</cbc:ID></cac:SellersItemIdentification>` : ''}
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${escapeXml(taxCode)}</cbc:ID>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>MYINV-1.0</cbc:CustomizationID>
  <cbc:ProfileID>MYINV-STD</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.number)}</cbc:ID>
  <cbc:IssueDate>${dateString}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="TIN">${escapeXml(config.supplier.tin)}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${escapeXml(supplierName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(config.supplier.address)}</cbc:StreetName>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:CompanyID>${escapeXml(config.supplier.tin)}</cbc:CompanyID>
        <cbc:RegistrationName>${escapeXml(supplierName)}</cbc:RegistrationName>
        <cbc:CompanyLegalForm>${escapeXml(config.supplier.branchCode || 'HQ')}</cbc:CompanyLegalForm>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${escapeXml(config.supplier.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(config.supplier.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="TIN">${escapeXml(customerTin)}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.customer?.name ?? 'Pelanggan')}</cbc:Name>
      </cac:PartyName>
      <cac:Contact>
        <cbc:Telephone>${escapeXml(invoice.customer?.phone ?? '')}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(invoice.customer?.email ?? '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${totals.taxAmount.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${totals.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${totals.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${(totals.subtotal + totals.taxAmount).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${totals.totalAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
};

export const defaultMyInvoisMode = normaliseMode(MYINVOIS_MODE);

export const defaultMyInvoisConfig: ResolvedMyInvoisConfig = {
  mode: defaultMyInvoisMode,
  supplier: {
    tin: '',
    businessName: '',
    branchCode: '',
    address: '',
    email: '',
    phone: '',
  },
  defaults: {
    currency: 'MYR',
  },
  api: {
    baseUrl: '',
    clientId: '',
    clientSecret: '',
    environment: '',
  },
};

export const loadMyInvoisConfig = async (): Promise<ResolvedMyInvoisConfig> => {
  const setting = await prisma.setting.findFirst({
    where: { key: MYINVOIS_SETTING_KEY, deleted_at: null },
  });

  const raw = (setting?.value as StoredMyInvoisConfig | undefined) ?? {};
  const mode = raw.mode ? normaliseMode(raw.mode) : defaultMyInvoisConfig.mode;

  return {
    mode,
    supplier: {
      tin: sanitiseTin(raw.supplier?.tin ?? raw.supplier?.name ?? defaultMyInvoisConfig.supplier.tin),
      businessName: raw.supplier?.businessName ?? raw.supplier?.name ?? '',
      branchCode: raw.supplier?.branchCode ?? '',
      address: raw.supplier?.address ?? '',
      email: raw.supplier?.email ?? '',
      phone: raw.supplier?.phone ?? '',
    },
    defaults: {
      currency: normaliseCurrency(raw.defaults?.currency ?? defaultMyInvoisConfig.defaults.currency),
    },
    api: {
      baseUrl: raw.api?.baseUrl ?? '',
      clientId: raw.api?.clientId ?? '',
      clientSecret: raw.api?.clientSecret ?? '',
      environment: raw.api?.environment ?? '',
    },
  };
};

export const buildPortalExport = async (
  invoice: InvoiceWithRelations,
  config: ResolvedMyInvoisConfig,
): Promise<PortalExport> => {
  const totals = collectTotals(invoice);
  const warnings: string[] = [];
  const invoiceMetadata = asRecord(invoice.metadata);
  const metadataCurrency = typeof invoiceMetadata.currency === 'string' ? invoiceMetadata.currency : undefined;
  const resolvedCurrency = normaliseCurrency(metadataCurrency ?? config.defaults.currency);
  const effectiveConfig: ResolvedMyInvoisConfig = {
    ...config,
    defaults: { ...config.defaults, currency: resolvedCurrency },
  };

  if (!config.supplier.tin) {
    warnings.push('TIN pembekal belum ditetapkan dalam tetapan MyInvois.');
  }

  const jsonPayload = buildPortalJson(invoice, effectiveConfig, totals, warnings);
  const xmlPayload = buildPortalXml(invoice, effectiveConfig, totals);

  const jsonString = JSON.stringify(jsonPayload, null, 2);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');
  const xmlBuffer = Buffer.from(xmlPayload, 'utf8');

  const rawIdentifier = invoice.number ?? invoice.id;
  const baseName = rawIdentifier.replace(/[^A-Za-z0-9_-]/g, '') || invoice.id;
  const xmlFileName = `${baseName}.xml`;
  const jsonFileName = `${baseName}.json`;
  const zipFileName = `${baseName}.zip`;

  const zipBuffer = createZipArchive([
    { name: xmlFileName, data: xmlBuffer },
    { name: jsonFileName, data: jsonBuffer },
  ]);

  return {
    zipFileName,
    xmlFileName,
    jsonFileName,
    zipBase64: zipBuffer.toString('base64'),
    xml: xmlPayload,
    json: jsonPayload,
    totals: {
      gross: totals.grossSubtotal,
      discount: totals.discountTotal,
      net: totals.subtotal,
      tax: totals.taxAmount,
      payable: totals.totalAmount,
      paid: totals.totalPaid,
      balance: totals.balance,
    },
    warnings,
  };
};

const buildApiPayload = (
  invoice: InvoiceWithRelations,
  config: ResolvedMyInvoisConfig,
  totals: ReturnType<typeof collectTotals>,
): Record<string, unknown> => {
  const customerTin = resolveCustomerTin(invoice);
  const metadata = asRecord(invoice.metadata);
  const offlineReference =
    (typeof metadata.offline_id === 'string' && metadata.offline_id) ||
    (typeof metadata.offlineId === 'string' && metadata.offlineId) ||
    null;

  return {
    DocumentNumber: invoice.number,
    IssueDate:
      invoice.issued_at instanceof Date
        ? invoice.issued_at.toISOString()
        : invoice.issued_at ?? new Date().toISOString(),
    Currency: config.defaults.currency,
    Supplier: {
      TIN: config.supplier.tin,
      Name: config.supplier.businessName,
      BranchCode: config.supplier.branchCode,
      Address: config.supplier.address,
      Email: config.supplier.email,
      Phone: config.supplier.phone,
    },
    Customer: {
      Name: invoice.customer?.name ?? 'Pelanggan',
      TIN: customerTin,
      Email: invoice.customer?.email ?? '',
      Phone: invoice.customer?.phone ?? '',
    },
    Items: invoice.items.map((item, index) => {
      const itemMetadata = asRecord(item.metadata);
      return {
        SequenceNumber: index + 1,
        SKU: item.product?.sku ?? null,
        Description: item.description,
        Quantity: item.quantity,
        UnitPrice: roundAmount(decimalToNumber(item.unit_price)),
        Discount: roundAmount(typeof itemMetadata.discount === 'number' ? itemMetadata.discount : 0),
        TaxCode: typeof itemMetadata.tax_code === 'string' ? itemMetadata.tax_code : 'SR',
        LineAmount: roundAmount(decimalToNumber(item.total_price)),
      };
    }),
    Totals: {
      Net: totals.subtotal,
      Tax: totals.taxAmount,
      Payable: totals.totalAmount,
      Paid: totals.totalPaid,
      Balance: totals.balance,
    },
    Payments: invoice.payments.map((payment) => ({
      Amount: roundAmount(decimalToNumber(payment.amount)),
      Method: payment.method ?? 'CASH',
      PaidAt:
        payment.paid_at instanceof Date
          ? payment.paid_at.toISOString()
          : payment.paid_at ?? new Date().toISOString(),
      Reference: payment.reference ?? null,
    })),
    Metadata: {
      InvoiceId: invoice.id,
      OfflineReference: offlineReference,
    },
  };
};

export const submitInvoice = async (
  invoice: InvoiceWithRelations,
  options: { config?: ResolvedMyInvoisConfig } = {},
): Promise<ApiStubResult> => {
  const config = options.config ?? (await loadMyInvoisConfig());
  const totals = collectTotals(invoice);
  const warnings: string[] = [];
  const invoiceMetadata = asRecord(invoice.metadata);
  const metadataCurrency = typeof invoiceMetadata.currency === 'string' ? invoiceMetadata.currency : undefined;
  const resolvedCurrency = normaliseCurrency(metadataCurrency ?? config.defaults.currency);
  const effectiveConfig: ResolvedMyInvoisConfig = {
    ...config,
    defaults: { ...config.defaults, currency: resolvedCurrency },
  };

  if (!config.supplier.tin) {
    warnings.push('TIN pembekal diperlukan untuk serahan API.');
  }
  if (!resolveCustomerTin(invoice)) {
    warnings.push('TIN pelanggan tidak tersedia. API MyInvois memerlukan TIN pelanggan.');
  }

  return {
    status: 'stub',
    message:
      'Integrasi API MyInvois belum diaktifkan dalam persekitaran ini. Payload di bawah menjelaskan pemetaan medan untuk ujian.',
    payload: buildApiPayload(invoice, effectiveConfig, totals),
    config: {
      baseUrl: config.api.baseUrl || undefined,
      clientId: config.api.clientId || undefined,
      environment: config.api.environment || undefined,
    },
    warnings,
  };
};

export const getDocument = async (
  documentId: string,
): Promise<{ status: 'stub'; documentId: string; message: string }> => ({
  status: 'stub',
  documentId,
  message:
    'Integrasi API MyInvois belum disambungkan. Fungsi ini mengembalikan nilai olok-olok untuk tujuan pembangunan.',
});

export const searchDocuments = async (
  query: Record<string, unknown>,
): Promise<{ status: 'stub'; query: Record<string, unknown>; message: string }> => ({
  status: 'stub',
  query,
  message:
    'Carian dokumen MyInvois belum diintegrasikan. Kembalikan ke mod portal untuk muat naik manual atau lengkapkan pensijilan API.',
});

export const buildMyInvoisArtifacts = async (
  invoice: InvoiceWithRelations,
  options: { config?: ResolvedMyInvoisConfig } = {},
): Promise<MyInvoisArtifacts> => {
  const config = options.config ?? (await loadMyInvoisConfig());
  const generatedAt = new Date().toISOString();
  const totals = collectTotals(invoice);
  const metadata = asRecord(invoice.metadata);
  const metadataCurrency = typeof metadata.currency === 'string' ? metadata.currency : undefined;
  const resolvedCurrency = normaliseCurrency(metadataCurrency ?? config.defaults.currency);
  const configSummary = {
    supplierTin: config.supplier.tin || undefined,
    currency: resolvedCurrency,
    environment: config.api.environment || undefined,
  };

  if (config.mode === 'disabled') {
    return {
      mode: 'disabled',
      generatedAt,
      configSummary,
      warnings: [],
    };
  }

  if (config.mode === 'portal') {
    const portal = await buildPortalExport(invoice, config);
    const warnings = Array.from(new Set(portal.warnings));
    return {
      mode: 'portal',
      generatedAt,
      configSummary,
      warnings,
      portal,
    };
  }

  const api = await submitInvoice(invoice, { config });
  const warnings = Array.from(new Set(api.warnings));
  return {
    mode: 'api',
    generatedAt,
    configSummary,
    warnings,
    api,
  };
};
