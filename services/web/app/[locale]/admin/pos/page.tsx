'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShareableQRCode } from '../../../../components/qr-code';
import { Button } from '../../../../components/ui/button';

interface ApiResponse<T> {
  data: T;
}

interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  price: number | null;
  wholesale_price: number | null;
  min_stock: number;
  currency?: string | null;
  is_active?: boolean | null;
  stock_on_hand: number;
  low_stock: boolean;
}

interface BundleComponent {
  id: string;
  componentId: string;
  quantity: number;
  component: {
    id: string;
    sku: string;
    name: string;
    stock_on_hand: number;
    min_stock: number;
  };
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  price: number | null;
  wholesale_price: number | null;
  currency?: string | null;
  min_stock: number;
  type: 'SIMPLE' | 'BUNDLE';
  is_active: boolean;
  stock_on_hand: number;
  low_stock: boolean;
  variants: ProductVariant[];
  bundle_items: BundleComponent[];
}

interface InvoiceItemResponse {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_id?: string | null;
  metadata?: Record<string, unknown>;
}

interface InvoicePaymentResponse {
  id: string;
  amount: number;
  method?: string | null;
  paid_at: string;
  reference?: string | null;
  notes?: string | null;
}

interface InvoiceResponse {
  id: string;
  number: string;
  status: string;
  issued_at?: string | null;
  due_at?: string | null;
  notes?: string | null;
  customer?: {
    id: string;
    name: string;
  } | null;
  items: InvoiceItemResponse[];
  payments: InvoicePaymentResponse[];
  totals: {
    gross_subtotal: number;
    subtotal: number;
    discount_total: number;
    tax_amount: number;
    tax_rate: number;
    total: number;
    total_paid: number;
    balance_due: number;
  };
  metadata?: Record<string, unknown> | null;
  qr_url: string;
  einvoice?: MyInvoisArtifacts;
}

type MyInvoisMode = 'portal' | 'api' | 'disabled';

interface MyInvoisPortalExport {
  zipFileName: string;
  xmlFileName: string;
  jsonFileName: string;
  zipBase64: string;
  xml: string;
  json: Record<string, unknown>;
  totals: {
    gross: number;
    discount: number;
    net: number;
    tax: number;
    payable: number;
    paid: number;
    balance: number;
  };
  warnings?: string[];
}

interface MyInvoisApiStub {
  status: 'stub';
  message: string;
  payload: Record<string, unknown>;
  config?: {
    baseUrl?: string;
    clientId?: string;
    environment?: string;
  };
  warnings?: string[];
}

interface MyInvoisArtifacts {
  mode: MyInvoisMode;
  generatedAt: string;
  configSummary?: {
    supplierTin?: string;
    currency: string;
    environment?: string;
  };
  warnings?: string[];
  portal?: MyInvoisPortalExport;
  api?: MyInvoisApiStub;
}

interface MyInvoisConfig {
  mode: MyInvoisMode;
  supplier: {
    tin: string;
    businessName: string;
    branchCode: string;
    address: string;
    email: string;
    phone: string;
  };
  defaults: {
    currency: string;
  };
  api: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    environment: string;
  };
}

interface SettingRecord {
  id: string;
  key: string;
  value?: unknown;
}

interface SaleItemPayload {
  productId: string;
  quantity: number;
  unit_price?: number;
  useWholesale?: boolean;
  discount?: number;
  label?: string;
}

interface SalePayload {
  customerId?: string;
  invoiceNumber?: string;
  offlineId?: string;
  notes?: string;
  overallDiscount?: number;
  taxRate?: number;
  items: SaleItemPayload[];
}

interface OfflineSale {
  id: string;
  payload: SalePayload;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

interface SaleProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  wholesale_price: number | null;
  stock_on_hand: number;
  low_stock: boolean;
  type: 'SIMPLE' | 'VARIANT' | 'BUNDLE';
  baseName?: string;
}

interface CartItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  useWholesale: boolean;
  type: 'SIMPLE' | 'VARIANT' | 'BUNDLE';
  wholesalePrice: number | null;
  retailPrice: number;
  baseName?: string;
}

interface ProductFormVariant {
  id?: string;
  sku: string;
  name: string;
  price: string;
  wholesale_price: string;
  min_stock: string;
}

interface ProductFormBundleItem {
  id?: string;
  componentId: string;
  quantity: string;
}

interface ProductFormState {
  id?: string;
  sku: string;
  name: string;
  description: string;
  price: string;
  wholesale_price: string;
  currency: string;
  min_stock: string;
  type: 'SIMPLE' | 'BUNDLE';
  is_active: boolean;
  variants: ProductFormVariant[];
  bundle_items: ProductFormBundleItem[];
}

const OFFLINE_STORAGE_KEY = 'wa-pos-offline-sales';

const defaultMyInvoisConfig: MyInvoisConfig = {
  mode: 'portal',
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

const normaliseMyInvoisConfig = (value?: unknown): MyInvoisConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultMyInvoisConfig };
  }

  const record = value as Record<string, unknown>;
  const supplier =
    record.supplier && typeof record.supplier === 'object' && !Array.isArray(record.supplier)
      ? (record.supplier as Record<string, unknown>)
      : {};
  const defaults =
    record.defaults && typeof record.defaults === 'object' && !Array.isArray(record.defaults)
      ? (record.defaults as Record<string, unknown>)
      : {};
  const api =
    record.api && typeof record.api === 'object' && !Array.isArray(record.api)
      ? (record.api as Record<string, unknown>)
      : {};

  const modeValue = typeof record.mode === 'string' ? (record.mode as string).toLowerCase() : 'portal';
  const mode: MyInvoisMode = modeValue === 'api' || modeValue === 'disabled' ? (modeValue as MyInvoisMode) : 'portal';

  return {
    mode,
    supplier: {
      tin: typeof supplier.tin === 'string' ? supplier.tin : '',
      businessName: typeof supplier.businessName === 'string' ? supplier.businessName : '',
      branchCode: typeof supplier.branchCode === 'string' ? supplier.branchCode : '',
      address: typeof supplier.address === 'string' ? supplier.address : '',
      email: typeof supplier.email === 'string' ? supplier.email : '',
      phone: typeof supplier.phone === 'string' ? supplier.phone : '',
    },
    defaults: {
      currency: typeof defaults.currency === 'string' ? defaults.currency : 'MYR',
    },
    api: {
      baseUrl: typeof api.baseUrl === 'string' ? api.baseUrl : '',
      clientId: typeof api.clientId === 'string' ? api.clientId : '',
      clientSecret: typeof api.clientSecret === 'string' ? api.clientSecret : '',
      environment: typeof api.environment === 'string' ? api.environment : '',
    },
  };
};

const emptyFormState: ProductFormState = {
  sku: '',
  name: '',
  description: '',
  price: '',
  wholesale_price: '',
  currency: 'MYR',
  min_stock: '0',
  type: 'SIMPLE',
  is_active: true,
  variants: [],
  bundle_items: [],
};

const formatCurrency = (value: number, currency: string = 'MYR') => {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'MYR';
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 2,
  }).format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const parseNumberInput = (value: string) => {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toOptionalNumber = (value: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildSaleInvoiceNumber = () => `OFF-${Date.now().toString(36)}`;

export default function AdminPosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState<string>('0');
  const [taxRate, setTaxRate] = useState<string>('0');
  const [saleNotes, setSaleNotes] = useState('');
  const [receipt, setReceipt] = useState<InvoiceResponse | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineSale[]>([]);
  const [queueInitialised, setQueueInitialised] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyFormState);
  const [productFormSaving, setProductFormSaving] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [myInvoisConfig, setMyInvoisConfig] = useState<MyInvoisConfig>(defaultMyInvoisConfig);
  const [myInvoisLoading, setMyInvoisLoading] = useState(true);
  const [myInvoisSaving, setMyInvoisSaving] = useState(false);
  const [myInvoisError, setMyInvoisError] = useState<string | null>(null);
  const [myInvoisSuccess, setMyInvoisSuccess] = useState<string | null>(null);

  const currentEinvoice = receipt?.einvoice ?? null;
  const currentEinvoiceCurrency = currentEinvoice?.configSummary?.currency ?? 'MYR';

  const flattenSaleProducts = useMemo<SaleProduct[]>(() => {
    const list: SaleProduct[] = [];
    products.forEach((product) => {
      if (product.type !== 'BUNDLE') {
        list.push({
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          wholesale_price: product.wholesale_price,
          stock_on_hand: product.stock_on_hand,
          low_stock: product.low_stock,
          type: 'SIMPLE',
        });
      } else {
        list.push({
          id: product.id,
          name: `${product.name} (Pek)`,
          sku: product.sku,
          price: product.price,
          wholesale_price: product.wholesale_price,
          stock_on_hand: product.stock_on_hand,
          low_stock: product.low_stock,
          type: 'BUNDLE',
        });
      }

      product.variants.forEach((variant) => {
        list.push({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          wholesale_price: variant.wholesale_price,
          stock_on_hand: variant.stock_on_hand,
          low_stock: variant.low_stock,
          type: 'VARIANT',
          baseName: product.name,
        });
      });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const cartTotals = useMemo(() => {
    let gross = 0;
    let lineDiscount = 0;

    cart.forEach((item) => {
      const lineGross = item.unitPrice * item.quantity;
      gross += lineGross;
      lineDiscount += item.discount;
    });

    const netBeforeOverall = Math.max(gross - lineDiscount, 0);
    const overall = parseNumberInput(overallDiscount);
    const taxPercent = parseNumberInput(taxRate);
    const subtotalAfterDiscount = Math.max(netBeforeOverall - overall, 0);
    const taxAmount = subtotalAfterDiscount * (taxPercent / 100);
    const total = subtotalAfterDiscount + taxAmount;

    return {
      gross,
      lineDiscount,
      overallDiscount: overall,
      subtotal: subtotalAfterDiscount,
      taxAmount,
      total,
    };
  }, [cart, overallDiscount, taxRate]);

  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const response = await fetch('/api/stock/products', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Gagal memuat produk');
        }
        const json = (await response.json()) as ApiResponse<Product[]>;
        setProducts(json.data);
        setProductError(null);
      } catch (error) {
        console.error(error);
        setProductError('Tidak dapat memuat senarai produk. Cuba lagi.');
      } finally {
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, []);

  useEffect(() => {
    const loadMyInvois = async () => {
      try {
        const response = await fetch('/api/settings/einvoice.myinvois', { cache: 'no-store' });
        if (response.status === 404) {
          setMyInvoisConfig({ ...defaultMyInvoisConfig });
          setMyInvoisError(null);
          setMyInvoisLoading(false);
          return;
        }
        if (!response.ok) {
          throw new Error('Gagal memuat konfigurasi MyInvois');
        }
        const json = (await response.json()) as ApiResponse<SettingRecord>;
        setMyInvoisConfig(normaliseMyInvoisConfig(json.data?.value));
        setMyInvoisError(null);
      } catch (error) {
        console.error(error);
        setMyInvoisError('Tidak dapat memuat konfigurasi MyInvois.');
      } finally {
        setMyInvoisLoading(false);
      }
    };

    loadMyInvois();
  }, []);

  const refreshProducts = useCallback(async () => {
    try {
      const response = await fetch('/api/stock/products', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Gagal memuat produk');
      }
      const json = (await response.json()) as ApiResponse<Product[]>;
      setProducts(json.data);
    } catch (error) {
      console.error(error);
      setProductError('Tidak dapat menyegarkan produk.');
    }
  }, []);

  const saveMyInvoisSettings = useCallback(async () => {
    setMyInvoisSaving(true);
    setMyInvoisError(null);
    setMyInvoisSuccess(null);
    try {
      const response = await fetch('/api/settings/einvoice.myinvois', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: myInvoisConfig }),
      });
      if (!response.ok) {
        throw new Error('Gagal menyimpan konfigurasi MyInvois');
      }
      setMyInvoisSuccess('Konfigurasi MyInvois berjaya disimpan.');
    } catch (error) {
      console.error(error);
      setMyInvoisError('Tidak dapat menyimpan konfigurasi MyInvois.');
    } finally {
      setMyInvoisSaving(false);
    }
  }, [myInvoisConfig]);

  const downloadPortalAsset = useCallback(
    (type: 'zip' | 'xml' | 'json') => {
      if (!receipt?.einvoice?.portal) {
        return;
      }
      const portal = receipt.einvoice.portal;
      let blob: Blob;
      let filename = portal.zipFileName;

      if (type === 'zip') {
        const binary = atob(portal.zipBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        blob = new Blob([bytes], { type: 'application/zip' });
        filename = portal.zipFileName;
      } else if (type === 'xml') {
        blob = new Blob([portal.xml], { type: 'application/xml' });
        filename = portal.xmlFileName;
      } else {
        blob = new Blob([JSON.stringify(portal.json, null, 2)], {
          type: 'application/json',
        });
        filename = portal.jsonFileName;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [receipt],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(window.navigator.onLine);

    const stored = window.localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OfflineSale[];
        setOfflineQueue(parsed);
      } catch (error) {
        console.warn('Failed to parse offline queue', error);
      }
    }
    setQueueInitialised(true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!queueInitialised || typeof window === 'undefined') return;
    window.localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineQueue));
  }, [offlineQueue, queueInitialised]);

  const sendSale = useCallback(async (payload: SalePayload) => {
    const response = await fetch('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Gagal menghantar jualan');
    }

    const json = (await response.json()) as ApiResponse<InvoiceResponse>;
    return json.data;
  }, []);

  const enqueueOfflineSale = useCallback(
    (payload: SalePayload, message?: string) => {
      const offlineId = `offline-${Date.now().toString(36)}`;
      const enriched: SalePayload = {
        ...payload,
        offlineId,
        invoiceNumber: payload.invoiceNumber ?? buildSaleInvoiceNumber(),
      };

      const sale: OfflineSale = {
        id: offlineId,
        payload: enriched,
        createdAt: Date.now(),
        status: 'pending',
        error: message,
      };

      setOfflineQueue((prev) => [...prev, sale]);
    },
    [],
  );

  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0) return;

    const pending = offlineQueue.find((item) => item.status === 'pending' || item.status === 'failed');
    if (!pending) return;

    let cancelled = false;

    const sync = async () => {
      for (const sale of offlineQueue) {
        if (cancelled) break;
        if (sale.status === 'pending' || sale.status === 'failed') {
          setOfflineQueue((prev) =>
            prev.map((item) =>
              item.id === sale.id
                ? {
                    ...item,
                    status: 'syncing',
                    error: undefined,
                  }
                : item,
            ),
          );

          try {
            const result = await sendSale(sale.payload);
            setReceipt(result);
            setOfflineQueue((prev) => prev.filter((item) => item.id !== sale.id));
            await refreshProducts();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal sync';
            setOfflineQueue((prev) =>
              prev.map((item) =>
                item.id === sale.id
                  ? {
                      ...item,
                      status: 'failed',
                      error: message,
                    }
                  : item,
              ),
            );
          }
        }
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [isOnline, offlineQueue, refreshProducts, sendSale]);

  const addToCart = (product: SaleProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      const retailPrice = product.price ?? product.wholesale_price ?? 0;

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: retailPrice,
          discount: 0,
          useWholesale: false,
          type: product.type,
          wholesalePrice: product.wholesale_price,
          retailPrice,
          baseName: product.baseName,
        },
      ];
    });
    setSaleError(null);
  };

  const updateCartItem = (productId: string, changes: Partial<CartItem>) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                ...changes,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const resetSaleState = () => {
    setCart([]);
    setOverallDiscount('0');
    setTaxRate('0');
    setSaleNotes('');
  };

  const handleSubmitSale = async () => {
    if (cart.length === 0) {
      setSaleError('Tambah sekurang-kurangnya satu item ke dalam troli.');
      return;
    }

    const payload: SalePayload = {
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice.toFixed(2)),
        useWholesale: item.useWholesale || undefined,
        discount: item.discount ? Number(item.discount.toFixed(2)) : undefined,
        label: item.name,
      })),
      overallDiscount: parseNumberInput(overallDiscount) || undefined,
      taxRate: parseNumberInput(taxRate) ? parseNumberInput(taxRate) / 100 : undefined,
      notes: saleNotes || undefined,
    };

    setSubmittingSale(true);
    setSaleError(null);
    try {
      const invoice = await sendSale(payload);
      setReceipt(invoice);
      resetSaleState();
      await refreshProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal proses jualan. Disimpan untuk sync.';
      enqueueOfflineSale(payload, message);
      setSaleError('Jualan disimpan untuk dihantar semula apabila talian kembali.');
      resetSaleState();
    } finally {
      setSubmittingSale(false);
    }
  };

  const openCreateProduct = () => {
    setProductForm(emptyFormState);
    setProductFormError(null);
    setProductFormOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setProductForm({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      price: product.price !== null && product.price !== undefined ? String(product.price) : '',
      wholesale_price:
        product.wholesale_price !== null && product.wholesale_price !== undefined
          ? String(product.wholesale_price)
          : '',
      currency: product.currency ?? 'MYR',
      min_stock: String(product.min_stock ?? 0),
      type: product.type,
      is_active: product.is_active,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        price: variant.price !== null && variant.price !== undefined ? String(variant.price) : '',
        wholesale_price:
          variant.wholesale_price !== null && variant.wholesale_price !== undefined
            ? String(variant.wholesale_price)
            : '',
        min_stock: String(variant.min_stock ?? 0),
      })),
      bundle_items: product.bundle_items.map((item) => ({
        id: item.id,
        componentId: item.componentId,
        quantity: String(item.quantity),
      })),
    });
    setProductFormError(null);
    setProductFormOpen(true);
  };

  const closeProductForm = () => {
    setProductFormOpen(false);
    setProductFormError(null);
  };

  const submitProductForm = async () => {
    const payload = {
      sku: productForm.sku.trim(),
      name: productForm.name.trim(),
      description: productForm.description.trim() || undefined,
      price: toOptionalNumber(productForm.price),
      wholesale_price: toOptionalNumber(productForm.wholesale_price),
      currency: productForm.currency.trim() || undefined,
      min_stock: parseNumberInput(productForm.min_stock),
      type: productForm.type,
      is_active: productForm.is_active,
      variants:
        productForm.type === 'BUNDLE'
          ? []
          : productForm.variants
              .filter((variant) => variant.sku && variant.name)
              .map((variant) => ({
                sku: variant.sku.trim(),
                name: variant.name.trim(),
                price: toOptionalNumber(variant.price),
                wholesale_price: toOptionalNumber(variant.wholesale_price),
                min_stock: parseNumberInput(variant.min_stock),
              })),
      bundle_items:
        productForm.type === 'BUNDLE'
          ? productForm.bundle_items
              .filter((item) => item.componentId)
              .map((item) => ({
                componentId: item.componentId,
                quantity: Math.max(parseNumberInput(item.quantity) || 1, 1),
              }))
          : [],
    };

    setProductFormSaving(true);
    setProductFormError(null);

    try {
      const url = productForm.id ? `/api/stock/products/${productForm.id}` : '/api/stock/products';
      const method = productForm.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Gagal menyimpan produk');
      }

      closeProductForm();
      await refreshProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan produk';
      setProductFormError(message);
    } finally {
      setProductFormSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const confirmDelete = window.confirm('Padam produk ini?');
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/stock/products/${productId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Gagal memadam produk');
      }
      await refreshProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memadam produk';
      alert(message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Modul POS</h1>
        <p className="text-sm text-slate-600">
          Urus stok dan jalankan jualan pantas. Sistem akan menyimpan transaksi luar talian dan menyegerak apabila
          sambungan kembali tersedia.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 font-medium ${
              isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isOnline ? 'Dalam talian' : 'Mod luar talian aktif'}
          </span>
          {offlineQueue.length > 0 ? (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-700">
              {offlineQueue.length} transaksi menunggu sync
            </span>
          ) : null}
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Jualan Kaunter</h2>
            <Button onClick={openCreateProduct} size="sm">
              Tambah Produk
            </Button>
          </div>

          {saleError ? <p className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800">{saleError}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {flattenSaleProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className={`flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  product.low_stock ? 'ring-2 ring-amber-300' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-slate-900">
                    {product.name}
                    {product.baseName ? <span className="ml-1 text-xs text-slate-500">({product.baseName})</span> : null}
                  </p>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{product.sku}</span>
                </div>
                <p className="text-lg font-semibold text-indigo-600">
                  {product.price !== null ? formatCurrency(product.price) : 'Tiada harga'}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Stok: <strong>{product.stock_on_hand}</strong>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">
                    {product.type === 'BUNDLE'
                      ? 'Bundle'
                      : product.type === 'VARIANT'
                      ? 'Variasi'
                      : 'Produk' }
                  </span>
                </div>
                {product.low_stock ? (
                  <p className="text-xs font-semibold text-amber-600">Amaran stok rendah</p>
                ) : null}
              </button>
            ))}
            {flattenSaleProducts.length === 0 && !loadingProducts ? (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Tiada produk tersedia. Tambah produk untuk memulakan jualan.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Troli</h3>
            <div className="mt-3 flex flex-col gap-3">
              {cart.map((item) => (
                <div key={item.productId} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      {item.baseName ? (
                        <p className="text-xs text-slate-500">Daripada: {item.baseName}</p>
                      ) : null}
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.sku}</p>
                    </div>
                    <button
                      onClick={() => removeCartItem(item.productId)}
                      className="text-xs font-medium text-rose-500 hover:text-rose-600"
                    >
                      Buang
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <label className="flex flex-col gap-1">
                      <span>Kuantiti</span>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          updateCartItem(item.productId, {
                            quantity: Math.max(Number(event.target.value) || 1, 1),
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Harga seunit (RM)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateCartItem(item.productId, {
                            unitPrice: Math.max(Number(event.target.value) || 0, 0),
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Diskaun (RM)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.discount}
                        onChange={(event) =>
                          updateCartItem(item.productId, {
                            discount: Math.max(Number(event.target.value) || 0, 0),
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={item.useWholesale}
                        onChange={(event) =>
                          updateCartItem(item.productId, {
                            useWholesale: event.target.checked,
                            unitPrice: event.target.checked
                              ? item.wholesalePrice ?? item.unitPrice
                              : item.retailPrice,
                          })
                        }
                      />
                      <span>Harga borong</span>
                    </label>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    Jumlah: {formatCurrency(Math.max(item.unitPrice * item.quantity - item.discount, 0))}
                  </div>
                </div>
              ))}
              {cart.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
                  Tiada item dalam troli.
                </p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <label className="flex flex-col gap-1">
                <span>Diskaun keseluruhan (RM)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={overallDiscount}
                  onChange={(event) => setOverallDiscount(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Kadar cukai (%)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Nota resit</span>
                <textarea
                  value={saleNotes}
                  onChange={(event) => setSaleNotes(event.target.value)}
                  className="min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Contoh: jualan tunai"
                />
              </label>
            </div>
            <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Jumlah kasar</span>
                <span>{formatCurrency(cartTotals.gross)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Diskaun item</span>
                <span>-{formatCurrency(cartTotals.lineDiscount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Diskaun keseluruhan</span>
                <span>-{formatCurrency(cartTotals.overallDiscount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Cukai</span>
                <span>{formatCurrency(cartTotals.taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-slate-900">
                <span>Jumlah bayar</span>
                <span>{formatCurrency(cartTotals.total)}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={handleSubmitSale} disabled={submittingSale}>
                {submittingSale ? 'Memproses...' : 'Proses Jualan'}
              </Button>
              <Button variant="outline" onClick={resetSaleState} disabled={submittingSale}>
                Set Semula
              </Button>
            </div>
          </div>

          {receipt ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Resit Terkini</h3>
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  Cetak
                </Button>
              </div>
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <div>
                  <p className="font-semibold text-slate-900">Invois #{receipt.number}</p>
                  <p className="text-xs text-slate-500">{formatDate(receipt.issued_at)}</p>
                </div>
                <div className="space-y-1">
                  {receipt.items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity}x {item.description}
                      </span>
                      <span>{formatCurrency(item.total_price)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 pt-2 text-sm">
                  <div className="flex justify-between">
                    <span>Jumlah</span>
                    <span>{formatCurrency(receipt.totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Diskaun</span>
                    <span>-{formatCurrency(receipt.totals.discount_total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Cukai ({(receipt.totals.tax_rate * 100).toFixed(1)}%)</span>
                    <span>{formatCurrency(receipt.totals.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold text-slate-900">
                    <span>Jumlah Akhir</span>
                    <span>{formatCurrency(receipt.totals.total)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Pembayaran</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {receipt.payments.map((payment) => (
                      <li key={payment.id} className="flex justify-between">
                        <span>{payment.method ?? 'Tunai'} </span>
                        <span>{formatCurrency(payment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ShareableQRCode url={receipt.qr_url} label="Imbas untuk lihat invois" />
                {currentEinvoice ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Integrasi MyInvois</p>
                      <span className="text-[11px] text-slate-500">
                        Dikemas kini {formatDate(currentEinvoice.generatedAt)}
                      </span>
                    </div>
                    {currentEinvoice.mode === 'portal' && currentEinvoice.portal ? (
                      <div className="space-y-2 rounded-lg bg-indigo-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-indigo-900">Portal MyInvois</p>
                            <p className="text-[11px] text-indigo-700">
                              Muat turun pakej ZIP dan muat naik ke portal rasmi MyInvois.
                            </p>
                          </div>
                          <Button size="sm" onClick={() => downloadPortalAsset('zip')}>
                            Muat Naik ke Portal
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-indigo-800">
                          <span className="rounded-full bg-white px-3 py-1 font-medium">
                            Jumlah: {formatCurrency(currentEinvoice.portal.totals.payable, currentEinvoiceCurrency)}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 font-medium">
                            Mata wang: {currentEinvoiceCurrency}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 font-medium">
                            TIN: {currentEinvoice.configSummary?.supplierTin ?? 'Tidak ditetapkan'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadPortalAsset('xml')}>
                            Muat turun XML
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPortalAsset('json')}>
                            Muat turun JSON
                          </Button>
                        </div>
                        {currentEinvoice.warnings && currentEinvoice.warnings.length > 0 ? (
                          <ul className="space-y-1 rounded-lg bg-amber-100/70 p-2 text-[11px] font-medium text-amber-800">
                            {currentEinvoice.warnings.map((warning) => (
                              <li key={warning}>• {warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                    {currentEinvoice.mode === 'api' && currentEinvoice.api ? (
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-900">API MyInvois (Stub)</p>
                          {currentEinvoice.api.config?.environment ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                              {currentEinvoice.api.config.environment}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-600">{currentEinvoice.api.message}</p>
                        <div className="max-h-48 overflow-auto rounded-lg bg-slate-900/90 p-3 text-[11px] text-slate-100">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(currentEinvoice.api.payload, null, 2)}
                          </pre>
                        </div>
                        {currentEinvoice.api.warnings && currentEinvoice.api.warnings.length > 0 ? (
                          <ul className="list-disc space-y-1 pl-5 text-[11px] text-amber-700">
                            {currentEinvoice.api.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                    {currentEinvoice.mode === 'disabled' ? (
                      <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                        Integrasi MyInvois dinyahaktifkan. Aktifkan dalam tetapan di bawah untuk menjana fail portal atau payload
                        API.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Konfigurasi e-Invois (MyInvois)</h2>
          <p className="text-sm text-slate-500">
            Tetapkan butiran syarikat dan pilihan mod MyInvois untuk menjana fail portal atau payload API.
          </p>
        </div>
        {myInvoisError ? (
          <p className="rounded-lg bg-rose-100 px-4 py-2 text-sm text-rose-700">{myInvoisError}</p>
        ) : null}
        {myInvoisSuccess ? (
          <p className="rounded-lg bg-emerald-100 px-4 py-2 text-sm text-emerald-700">{myInvoisSuccess}</p>
        ) : null}
        {myInvoisLoading ? (
          <p className="text-sm text-slate-500">Memuat konfigurasi MyInvois...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <label className="flex flex-col gap-1">
                <span>Mod integrasi</span>
                <select
                  value={myInvoisConfig.mode}
                  onChange={(event) => {
                    const value = event.target.value as MyInvoisMode;
                    setMyInvoisConfig((prev) => ({ ...prev, mode: value }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="portal">Portal (muat naik manual)</option>
                  <option value="api">API (stub ujian)</option>
                  <option value="disabled">Nyahaktifkan integrasi</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>TIN Pembekal</span>
                <input
                  type="text"
                  value={myInvoisConfig.supplier.tin}
                  onChange={(event) => {
                    const next = event.target.value.toUpperCase();
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      supplier: { ...prev.supplier, tin: next },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Contoh: C1234567890"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Nama Perniagaan Berdaftar</span>
                <input
                  type="text"
                  value={myInvoisConfig.supplier.businessName}
                  onChange={(event) => {
                    const next = event.target.value;
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      supplier: { ...prev.supplier, businessName: next },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Nama syarikat"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Kod Cawangan</span>
                <input
                  type="text"
                  value={myInvoisConfig.supplier.branchCode}
                  onChange={(event) => {
                    const next = event.target.value;
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      supplier: { ...prev.supplier, branchCode: next },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Contoh: HQ"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Alamat Perniagaan</span>
                <textarea
                  rows={3}
                  value={myInvoisConfig.supplier.address}
                  onChange={(event) => {
                    const next = event.target.value;
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      supplier: { ...prev.supplier, address: next },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Alamat penuh"
                />
              </label>
            </div>
            <div className="space-y-3 text-sm">
              <label className="flex flex-col gap-1">
                <span>E-mel Perhubungan</span>
                <input
                  type="email"
                  value={myInvoisConfig.supplier.email}
                  onChange={(event) => {
                    const next = event.target.value;
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      supplier: { ...prev.supplier, email: next },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="akaun@syarikat.com"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>No. Telefon</span>
                <input
                  type="tel"
                  value={myInvoisConfig.supplier.phone}
                  onChange={(event) => {
                    const next = event.target.value;
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      supplier: { ...prev.supplier, phone: next },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="012-3456789"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Mata wang dokumen</span>
                <input
                  type="text"
                  value={myInvoisConfig.defaults.currency}
                  onChange={(event) => {
                    const next = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
                    setMyInvoisConfig((prev) => ({
                      ...prev,
                      defaults: { ...prev.defaults, currency: next || 'MYR' },
                    }));
                    setMyInvoisSuccess(null);
                  }}
                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="MYR"
                  maxLength={3}
                />
              </label>
              {myInvoisConfig.mode === 'api' ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">Butiran API (stub)</p>
                  <label className="flex flex-col gap-1">
                    <span>Base URL</span>
                    <input
                      type="url"
                      value={myInvoisConfig.api.baseUrl}
                      onChange={(event) => {
                        const next = event.target.value;
                        setMyInvoisConfig((prev) => ({
                          ...prev,
                          api: { ...prev.api, baseUrl: next },
                        }));
                        setMyInvoisSuccess(null);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="https://api.myinvois.gov.my"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Client ID</span>
                    <input
                      type="text"
                      value={myInvoisConfig.api.clientId}
                      onChange={(event) => {
                        const next = event.target.value;
                        setMyInvoisConfig((prev) => ({
                          ...prev,
                          api: { ...prev.api, clientId: next },
                        }));
                        setMyInvoisSuccess(null);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="ID aplikasi"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Client Secret</span>
                    <input
                      type="password"
                      value={myInvoisConfig.api.clientSecret}
                      onChange={(event) => {
                        const next = event.target.value;
                        setMyInvoisConfig((prev) => ({
                          ...prev,
                          api: { ...prev.api, clientSecret: next },
                        }));
                        setMyInvoisSuccess(null);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Rahsia aplikasi"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Persekitaran</span>
                    <input
                      type="text"
                      value={myInvoisConfig.api.environment}
                      onChange={(event) => {
                        const next = event.target.value;
                        setMyInvoisConfig((prev) => ({
                          ...prev,
                          api: { ...prev.api, environment: next },
                        }));
                        setMyInvoisSuccess(null);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="sandbox / production"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={saveMyInvoisSettings} disabled={myInvoisSaving || myInvoisLoading}>
            {myInvoisSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </Button>
          <p className="text-xs text-slate-500">
            Mod semasa: {myInvoisConfig.mode === 'portal'
              ? 'Portal (muat naik manual)'
              : myInvoisConfig.mode === 'api'
                ? 'API (stub ujian)'
                : 'Nyahaktif'}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Inventori &amp; Produk</h2>
        {productError ? (
          <p className="rounded-lg bg-rose-100 px-4 py-2 text-sm text-rose-700">{productError}</p>
        ) : null}
        {loadingProducts ? (
          <p className="text-sm text-slate-500">Memuat produk...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {products.map((product) => (
              <div key={product.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{product.name}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{product.sku}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditProduct(product)}>
                      Sunting
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteProduct(product.id)}>
                      Padam
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                    Stok: {product.stock_on_hand}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                    Min stok: {product.min_stock}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                    Jenis: {product.type === 'BUNDLE' ? 'Bundle' : 'Produk'}
                  </span>
                  {product.low_stock ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                      Amaran stok rendah
                    </span>
                  ) : null}
                </div>
                {product.variants.length > 0 ? (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Variasi</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {product.variants.map((variant) => (
                        <li key={variant.id} className="flex justify-between text-slate-600">
                          <span>
                            {variant.name} ({variant.sku})
                          </span>
                          <span>
                            {formatCurrency(variant.price ?? 0)} / stok {variant.stock_on_hand}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {product.bundle_items.length > 0 ? (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Komponen Bundle</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {product.bundle_items.map((item) => (
                        <li key={item.id} className="flex justify-between text-slate-600">
                          <span>
                            {item.quantity}x {item.component.name}
                          </span>
                          <span>Stok {item.component.stock_on_hand}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
            {products.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Tiada produk didaftarkan.
              </div>
            ) : null}
          </div>
        )}
      </section>

      {productFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {productForm.id ? 'Sunting Produk' : 'Produk Baharu'}
                </h3>
                <p className="text-sm text-slate-500">Urus maklumat produk, variasi dan bundle.</p>
              </div>
              <button className="text-sm text-slate-500 hover:text-slate-700" onClick={closeProductForm}>
                Tutup
              </button>
            </div>

            {productFormError ? (
              <p className="mt-3 rounded-lg bg-rose-100 px-4 py-2 text-sm text-rose-700">{productFormError}</p>
            ) : null}

            <div className="mt-4 grid gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span>SKU</span>
                <input
                  value={productForm.sku}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, sku: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="SKU unik"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Nama</span>
                <input
                  value={productForm.name}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Nama produk"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Deskripsi</span>
                <textarea
                  value={productForm.description}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Catatan ringkas"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span>Harga runcit (RM)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={productForm.price}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Harga borong (RM)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={productForm.wholesale_price}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, wholesale_price: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span>Min stok</span>
                  <input
                    type="number"
                    min={0}
                    value={productForm.min_stock}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, min_stock: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Jenis</span>
                  <select
                    value={productForm.type}
                    onChange={(event) =>
                      setProductForm((prev) => ({
                        ...prev,
                        type: event.target.value as 'SIMPLE' | 'BUNDLE',
                        variants: event.target.value === 'BUNDLE' ? [] : prev.variants,
                        bundle_items: event.target.value === 'BUNDLE' ? prev.bundle_items : [],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="SIMPLE">Produk tunggal</option>
                    <option value="BUNDLE">Bundle / Pek</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={productForm.is_active}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                <span>Aktifkan produk</span>
              </label>

              {productForm.type !== 'BUNDLE' ? (
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Variasi Produk</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setProductForm((prev) => ({
                          ...prev,
                          variants: [
                            ...prev.variants,
                            { sku: '', name: '', price: '', wholesale_price: '', min_stock: '0' },
                          ],
                        }))
                      }
                    >
                      Tambah Variasi
                    </Button>
                  </div>
                  {productForm.variants.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Tiada variasi. Tambah jika perlu.</p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {productForm.variants.map((variant, index) => (
                      <div key={index} className="rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Variasi #{index + 1}
                          </span>
                          <button
                            className="text-xs text-rose-500"
                            onClick={() =>
                              setProductForm((prev) => ({
                                ...prev,
                                variants: prev.variants.filter((_, idx) => idx !== index),
                              }))
                            }
                          >
                            Buang
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs">
                            <span>SKU</span>
                            <input
                              value={variant.sku}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((item, idx) =>
                                    idx === index ? { ...item, sku: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">
                            <span>Nama</span>
                            <input
                              value={variant.name}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((item, idx) =>
                                    idx === index ? { ...item, name: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">
                            <span>Harga (RM)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={variant.price}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((item, idx) =>
                                    idx === index ? { ...item, price: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">
                            <span>Harga borong (RM)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={variant.wholesale_price}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((item, idx) =>
                                    idx === index ? { ...item, wholesale_price: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">
                            <span>Min stok</span>
                            <input
                              type="number"
                              min={0}
                              value={variant.min_stock}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((item, idx) =>
                                    idx === index ? { ...item, min_stock: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Komponen Bundle</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setProductForm((prev) => ({
                          ...prev,
                          bundle_items: [
                            ...prev.bundle_items,
                            {
                              componentId: products.find((item) => item.id !== prev.id)?.id ?? '',
                              quantity: '1',
                            },
                          ],
                        }))
                      }
                    >
                      Tambah Komponen
                    </Button>
                  </div>
                  {productForm.bundle_items.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Tambah produk komponen untuk bundle ini.</p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {productForm.bundle_items.map((bundle, index) => (
                      <div key={index} className="rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Komponen #{index + 1}
                          </span>
                          <button
                            className="text-xs text-rose-500"
                            onClick={() =>
                              setProductForm((prev) => ({
                                ...prev,
                                bundle_items: prev.bundle_items.filter((_, idx) => idx !== index),
                              }))
                            }
                          >
                            Buang
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs">
                            <span>Produk</span>
                            <select
                              value={bundle.componentId}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  bundle_items: prev.bundle_items.map((item, idx) =>
                                    idx === index ? { ...item, componentId: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">Pilih produk</option>
                              {flattenSaleProducts
                                .filter((candidate) => candidate.id !== productForm.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name} ({candidate.sku})
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs">
                            <span>Kuantiti</span>
                            <input
                              type="number"
                              min={1}
                              value={bundle.quantity}
                              onChange={(event) =>
                                setProductForm((prev) => ({
                                  ...prev,
                                  bundle_items: prev.bundle_items.map((item, idx) =>
                                    idx === index ? { ...item, quantity: event.target.value } : item,
                                  ),
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeProductForm} disabled={productFormSaving}>
                Batal
              </Button>
              <Button onClick={submitProductForm} disabled={productFormSaving}>
                {productFormSaving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {offlineQueue.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Transaksi luar talian</h2>
          <p className="text-xs text-slate-500">
            Sistem akan cuba menyegerakkan secara automatik apabila sambungan tersedia. Boleh juga semak status di sini.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {offlineQueue.map((sale) => (
              <li key={sale.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>ID: {sale.id}</span>
                  <span
                    className={`text-xs font-semibold ${
                      sale.status === 'pending'
                        ? 'text-amber-600'
                        : sale.status === 'syncing'
                        ? 'text-indigo-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {sale.status === 'pending'
                      ? 'Menunggu'
                      : sale.status === 'syncing'
                      ? 'Menyegerak...'
                      : 'Gagal'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Dibuat pada {formatDate(new Date(sale.createdAt).toISOString())}
                </p>
                {sale.error ? <p className="mt-1 text-xs text-rose-600">{sale.error}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
