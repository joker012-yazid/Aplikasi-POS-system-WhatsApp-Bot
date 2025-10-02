'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '../../../../components/ui/button';

interface SettingRecord {
  id: string;
  key: string;
  value: unknown;
}

interface SettingsResponse {
  data: SettingRecord[];
}

interface ReleaseNote {
  version: string;
  tag: string;
  releasedAt: string;
  highlights: string[];
}

interface UpdatePanelStatus {
  currentTag: string;
  recommendedTag?: string;
  releases: ReleaseNote[];
  updatedAt?: string;
  lastCheckedAt: string;
}

interface UpdateSimulationStep {
  name: string;
  status: string;
  detail: string;
  durationMs: number;
}

interface UpdateSimulationResponse {
  data: {
    targetTag: string;
    startedAt: string;
    finishedAt: string;
    steps: UpdateSimulationStep[];
  };
}

interface UpdateStatusResponse {
  data: UpdatePanelStatus;
}

const STORE_SETTING_KEY = 'pos.store';
const TAX_SETTING_KEY = 'pos.taxes';
const INVOICE_SETTING_KEY = 'pos.invoice';
const TEMPLATE_SETTING_KEY = 'wa.templates';
const CAMPAIGN_SETTING_KEY = 'campaign.throttle';
const BACKUP_SETTING_KEY = 'system.backup';
const INTEGRATION_SETTING_KEY = 'integrations.credentials';
const MYINVOIS_SETTING_KEY = 'einvoice.myinvois';

const defaultStoreProfile = {
  name: '',
  phone: '',
  email: '',
  address: '',
  registration: '',
};

const defaultTaxConfig = {
  rate: '0',
  inclusive: true,
  notes: '',
};

const defaultInvoiceConfig = {
  prefix: 'INV',
  nextNumber: '1',
  padLength: '5',
  suffix: '',
};

const defaultTemplates = {
  acknowledgement: 'Terima kasih {{nama}}! Kami telah terima tiket/peranti anda dan akan maklum perkembangan terkini.',
  estimate:
    'Hai {{nama}}, anggaran kos servis untuk {{peranti}} ialah RM{{anggaran}} (ETA {{eta}}). Balas YA untuk teruskan atau TIDAK untuk batal.',
  ready:
    'Hai {{nama}}, peranti anda sudah siap! Sila datang ambil sebelum {{tarikh}}. Invois: {{pautan_invois}}.',
};

const defaultCampaignConfig = {
  throttlePerMinute: '60',
  jitterSeconds: '10',
  dailyCap: '200',
  timezone: 'Asia/Kuala_Lumpur',
  windowStartHour: '9',
  windowEndHour: '21',
};

const defaultBackupConfig = {
  frequency: 'daily',
  timeOfDay: '02:00',
  timezone: 'Asia/Kuala_Lumpur',
  retentionDays: '14',
};

const defaultIntegrationConfig = {
  openaiKey: '',
  postgresDsn: '',
  redisDsn: '',
};

const defaultMyInvoisConfig = {
  mode: 'portal' as 'portal' | 'api' | 'disabled',
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

type StoreProfileState = typeof defaultStoreProfile;
type TaxConfigState = typeof defaultTaxConfig;
type InvoiceConfigState = typeof defaultInvoiceConfig;
type TemplateState = typeof defaultTemplates;
type CampaignConfigState = typeof defaultCampaignConfig;
type BackupConfigState = typeof defaultBackupConfig;
type IntegrationConfigState = typeof defaultIntegrationConfig;
type MyInvoisConfigState = typeof defaultMyInvoisConfig;

type SettingsMap = Record<string, unknown>;

const toSettingsMap = (records: SettingRecord[]): SettingsMap => {
  return records.reduce<SettingsMap>((acc, record) => {
    acc[record.key] = record.value ?? null;
    return acc;
  }, {});
};

const normaliseString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const normaliseBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const normaliseNumberString = (value: unknown, fallback = '0'): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const normaliseStoreProfile = (value: unknown): StoreProfileState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultStoreProfile };
  }
  const record = value as Record<string, unknown>;
  return {
    name: normaliseString(record.name),
    phone: normaliseString(record.phone),
    email: normaliseString(record.email),
    address: normaliseString(record.address),
    registration: normaliseString(record.registration),
  };
};

const normaliseTaxConfig = (value: unknown): TaxConfigState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultTaxConfig };
  }
  const record = value as Record<string, unknown>;
  return {
    rate: normaliseNumberString(record.rate, defaultTaxConfig.rate),
    inclusive: normaliseBoolean(record.inclusive, defaultTaxConfig.inclusive),
    notes: normaliseString(record.notes, defaultTaxConfig.notes),
  };
};

const normaliseInvoiceConfig = (value: unknown): InvoiceConfigState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultInvoiceConfig };
  }
  const record = value as Record<string, unknown>;
  return {
    prefix: normaliseString(record.prefix, defaultInvoiceConfig.prefix),
    nextNumber: normaliseNumberString(record.nextNumber, defaultInvoiceConfig.nextNumber),
    padLength: normaliseNumberString(record.padLength, defaultInvoiceConfig.padLength),
    suffix: normaliseString(record.suffix, defaultInvoiceConfig.suffix),
  };
};

const normaliseTemplates = (value: unknown): TemplateState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultTemplates };
  }
  const record = value as Record<string, unknown>;
  return {
    acknowledgement: normaliseString(record.acknowledgement, defaultTemplates.acknowledgement),
    estimate: normaliseString(record.estimate, defaultTemplates.estimate),
    ready: normaliseString(record.ready, defaultTemplates.ready),
  };
};

const normaliseCampaignConfig = (value: unknown): CampaignConfigState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultCampaignConfig };
  }
  const record = value as Record<string, unknown>;
  return {
    throttlePerMinute: normaliseNumberString(record.throttlePerMinute, defaultCampaignConfig.throttlePerMinute),
    jitterSeconds: normaliseNumberString(record.jitterSeconds, defaultCampaignConfig.jitterSeconds),
    dailyCap: normaliseNumberString(record.dailyCap, defaultCampaignConfig.dailyCap),
    timezone: normaliseString(record.timezone, defaultCampaignConfig.timezone),
    windowStartHour: normaliseNumberString(record.windowStartHour, defaultCampaignConfig.windowStartHour),
    windowEndHour: normaliseNumberString(record.windowEndHour, defaultCampaignConfig.windowEndHour),
  };
};

const normaliseBackupConfig = (value: unknown): BackupConfigState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultBackupConfig };
  }
  const record = value as Record<string, unknown>;
  return {
    frequency: normaliseString(record.frequency, defaultBackupConfig.frequency),
    timeOfDay: normaliseString(record.timeOfDay, defaultBackupConfig.timeOfDay),
    timezone: normaliseString(record.timezone, defaultBackupConfig.timezone),
    retentionDays: normaliseNumberString(record.retentionDays, defaultBackupConfig.retentionDays),
  };
};

const normaliseIntegrationConfig = (value: unknown): IntegrationConfigState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultIntegrationConfig };
  }
  const record = value as Record<string, unknown>;
  return {
    openaiKey: normaliseString(record.openaiKey, defaultIntegrationConfig.openaiKey),
    postgresDsn: normaliseString(record.postgresDsn, defaultIntegrationConfig.postgresDsn),
    redisDsn: normaliseString(record.redisDsn, defaultIntegrationConfig.redisDsn),
  };
};

const normaliseMyInvoisConfig = (value: unknown): MyInvoisConfigState => {
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

  const rawMode = typeof record.mode === 'string' ? record.mode.toLowerCase() : defaultMyInvoisConfig.mode;
  const mode: 'portal' | 'api' | 'disabled' =
    rawMode === 'api' || rawMode === 'disabled' ? (rawMode as 'api' | 'disabled') : 'portal';

  return {
    mode,
    supplier: {
      tin: normaliseString(supplier.tin),
      businessName: normaliseString(supplier.businessName),
      branchCode: normaliseString(supplier.branchCode),
      address: normaliseString(supplier.address),
      email: normaliseString(supplier.email),
      phone: normaliseString(supplier.phone),
    },
    defaults: {
      currency: normaliseString(defaults.currency, defaultMyInvoisConfig.defaults.currency),
    },
    api: {
      baseUrl: normaliseString(api.baseUrl),
      clientId: normaliseString(api.clientId),
      clientSecret: normaliseString(api.clientSecret),
      environment: normaliseString(api.environment),
    },
  };
};

const formatDateTime = (value?: string) => {
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

const formatDuration = (milliseconds: number) => {
  const seconds = Math.round(milliseconds / 100) / 10;
  return `${seconds.toFixed(1)}s`;
};

const putSetting = async (key: string, value: unknown) => {
  const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    throw new Error(`Gagal menyimpan tetapan (${response.status})`);
  }

  return (await response.json()) as { data: SettingRecord };
};

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [storeProfile, setStoreProfile] = useState<StoreProfileState>(defaultStoreProfile);
  const [taxConfig, setTaxConfig] = useState<TaxConfigState>(defaultTaxConfig);
  const [invoiceConfig, setInvoiceConfig] = useState<InvoiceConfigState>(defaultInvoiceConfig);
  const [templates, setTemplates] = useState<TemplateState>(defaultTemplates);
  const [campaignConfig, setCampaignConfig] = useState<CampaignConfigState>(defaultCampaignConfig);
  const [backupConfig, setBackupConfig] = useState<BackupConfigState>(defaultBackupConfig);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfigState>(defaultIntegrationConfig);
  const [myInvoisConfig, setMyInvoisConfig] = useState<MyInvoisConfigState>(defaultMyInvoisConfig);

  const [storeSaving, setStoreSaving] = useState(false);
  const [storeMessage, setStoreMessage] = useState<string | null>(null);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState<string | null>(null);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [myInvoisSaving, setMyInvoisSaving] = useState(false);
  const [myInvoisMessage, setMyInvoisMessage] = useState<string | null>(null);

  const [updateStatus, setUpdateStatus] = useState<UpdatePanelStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(true);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [targetTag, setTargetTag] = useState('');
  const [simulateState, setSimulateState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [simulateMessage, setSimulateMessage] = useState<string | null>(null);
  const [simulateSteps, setSimulateSteps] = useState<UpdateSimulationStep[]>([]);
  const [simulateWindowOpened, setSimulateWindowOpened] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/settings', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Gagal memuat tetapan (${response.status})`);
      }
      const payload = (await response.json()) as SettingsResponse;
      const map = toSettingsMap(payload.data);

      setStoreProfile(normaliseStoreProfile(map[STORE_SETTING_KEY]));
      setTaxConfig(normaliseTaxConfig(map[TAX_SETTING_KEY]));
      setInvoiceConfig(normaliseInvoiceConfig(map[INVOICE_SETTING_KEY]));
      setTemplates(normaliseTemplates(map[TEMPLATE_SETTING_KEY]));
      setCampaignConfig(normaliseCampaignConfig(map[CAMPAIGN_SETTING_KEY]));
      setBackupConfig(normaliseBackupConfig(map[BACKUP_SETTING_KEY]));
      setIntegrationConfig(normaliseIntegrationConfig(map[INTEGRATION_SETTING_KEY]));
      setMyInvoisConfig(normaliseMyInvoisConfig(map[MYINVOIS_SETTING_KEY]));

      setLoading(false);
    } catch (error) {
      setLoading(false);
      setLoadError(error instanceof Error ? error.message : 'Gagal memuat tetapan');
    }
  }, []);

  const loadUpdateStatus = useCallback(async () => {
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const response = await fetch('/api/settings/update-panel/status', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Gagal memuat status kemas kini (${response.status})`);
      }
      const payload = (await response.json()) as UpdateStatusResponse;
      setUpdateStatus(payload.data);
      setTargetTag((prev) => prev || payload.data.recommendedTag || payload.data.currentTag);
      setUpdateLoading(false);
    } catch (error) {
      setUpdateLoading(false);
      setUpdateError(error instanceof Error ? error.message : 'Gagal memuat status kemas kini');
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadUpdateStatus();
  }, [loadSettings, loadUpdateStatus]);

  const saveStore = async () => {
    setStoreSaving(true);
    setStoreMessage(null);
    setTaxMessage(null);
    try {
      await putSetting(STORE_SETTING_KEY, storeProfile);
      await putSetting(INVOICE_SETTING_KEY, {
        prefix: invoiceConfig.prefix,
        suffix: invoiceConfig.suffix,
        nextNumber: Number(invoiceConfig.nextNumber) || 1,
        padLength: Number(invoiceConfig.padLength) || Number(defaultInvoiceConfig.padLength),
      });
      setStoreMessage('Maklumat kedai & penomboran invois berjaya disimpan.');
    } catch (error) {
      setStoreMessage(error instanceof Error ? error.message : 'Gagal menyimpan maklumat kedai');
    } finally {
      setStoreSaving(false);
    }
  };

  const saveTaxes = async () => {
    setTaxSaving(true);
    setTaxMessage(null);
    try {
      await putSetting(TAX_SETTING_KEY, {
        rate: Number(taxConfig.rate) || 0,
        inclusive: taxConfig.inclusive,
        notes: taxConfig.notes,
      });
      setTaxMessage('Konfigurasi cukai berjaya dikemaskini.');
    } catch (error) {
      setTaxMessage(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi cukai');
    } finally {
      setTaxSaving(false);
    }
  };

  const saveTemplates = async () => {
    setTemplateSaving(true);
    setTemplateMessage(null);
    try {
      await putSetting(TEMPLATE_SETTING_KEY, templates);
      setTemplateMessage('Templat mesej WhatsApp berjaya disimpan.');
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : 'Gagal menyimpan templat mesej');
    } finally {
      setTemplateSaving(false);
    }
  };

  const saveCampaignConfig = async () => {
    setCampaignSaving(true);
    setCampaignMessage(null);
    try {
      await putSetting(CAMPAIGN_SETTING_KEY, {
        throttlePerMinute: Number(campaignConfig.throttlePerMinute) || Number(defaultCampaignConfig.throttlePerMinute),
        jitterSeconds: Number(campaignConfig.jitterSeconds) || Number(defaultCampaignConfig.jitterSeconds),
        dailyCap: Number(campaignConfig.dailyCap) || 0,
        timezone: campaignConfig.timezone || defaultCampaignConfig.timezone,
        windowStartHour: campaignConfig.windowStartHour ? Number(campaignConfig.windowStartHour) : null,
        windowEndHour: campaignConfig.windowEndHour ? Number(campaignConfig.windowEndHour) : null,
      });
      setCampaignMessage('Kadar throttle kempen berjaya disimpan.');
    } catch (error) {
      setCampaignMessage(error instanceof Error ? error.message : 'Gagal menyimpan kadar throttle kempen');
    } finally {
      setCampaignSaving(false);
    }
  };

  const saveBackupConfig = async () => {
    setBackupSaving(true);
    setBackupMessage(null);
    try {
      await putSetting(BACKUP_SETTING_KEY, {
        frequency: backupConfig.frequency,
        timeOfDay: backupConfig.timeOfDay,
        timezone: backupConfig.timezone,
        retentionDays: Number(backupConfig.retentionDays) || Number(defaultBackupConfig.retentionDays),
      });
      setBackupMessage('Jadual backup berjaya disimpan.');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Gagal menyimpan jadual backup');
    } finally {
      setBackupSaving(false);
    }
  };

  const saveIntegrationConfig = async () => {
    setIntegrationSaving(true);
    setIntegrationMessage(null);
    try {
      await putSetting(INTEGRATION_SETTING_KEY, integrationConfig);
      setIntegrationMessage('Kredensial API berjaya dikemaskini.');
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : 'Gagal menyimpan kredensial API');
    } finally {
      setIntegrationSaving(false);
    }
  };

  const saveMyInvoisConfig = async () => {
    setMyInvoisSaving(true);
    setMyInvoisMessage(null);
    try {
      await putSetting(MYINVOIS_SETTING_KEY, myInvoisConfig);
      setMyInvoisMessage('Konfigurasi MyInvois berjaya disimpan.');
    } catch (error) {
      setMyInvoisMessage(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi MyInvois');
    } finally {
      setMyInvoisSaving(false);
    }
  };

  const runUpdateSimulation = async () => {
    if (!targetTag) {
      setSimulateMessage('Sila pilih tag imej docker terlebih dahulu.');
      setSimulateState('error');
      return;
    }

    setSimulateWindowOpened(false);
    setSimulateState('running');
    setSimulateMessage(null);
    setSimulateSteps([]);
    try {
      const response = await fetch('/api/settings/update-panel/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetTag }),
      });
      if (!response.ok) {
        throw new Error(`Gagal mensimulasikan kemas kini (${response.status})`);
      }
      const payload = (await response.json()) as UpdateSimulationResponse;
      setSimulateSteps(payload.data.steps);
      setSimulateState('success');
      setSimulateMessage(`Tag ${payload.data.targetTag} berjaya digunakan secara mock.`);
      setSimulateWindowOpened(true);
      await loadUpdateStatus();
    } catch (error) {
      setSimulateState('error');
      setSimulateMessage(error instanceof Error ? error.message : 'Gagal mensimulasikan kemas kini');
    }
  };

  const releases = useMemo(() => updateStatus?.releases ?? [], [updateStatus]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pentadbiran</p>
          <h1 className="text-3xl font-bold text-slate-900">Tetapan Sistem</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Ubah konfigurasi kedai, kempen, integrasi dan e-Invois tanpa perlu deploy semula. Semua perubahan akan
            disimpan ke pangkalan data tetapan.
          </p>
        </header>

        {loadError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Memuat tetapan...
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Maklumat Kedai &amp; Penomboran Invois</h2>
                <p className="text-sm text-slate-600">
                  Simpan identiti kedai, maklumat cukai dan format penomboran invois yang konsisten.
                </p>
              </div>
              {storeMessage ? (
                <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{storeMessage}</p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Nama Kedai</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={storeProfile.name}
                    onChange={(event) => setStoreProfile({ ...storeProfile, name: event.target.value })}
                    placeholder="Contoh: WA Gadget Repair"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>No. Telefon</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={storeProfile.phone}
                    onChange={(event) => setStoreProfile({ ...storeProfile, phone: event.target.value })}
                    placeholder="Contoh: +6012-3456789"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Email Rasmi</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={storeProfile.email}
                    onChange={(event) => setStoreProfile({ ...storeProfile, email: event.target.value })}
                    placeholder="hello@kedai.com"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>No. Pendaftaran/TIN</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={storeProfile.registration}
                    onChange={(event) => setStoreProfile({ ...storeProfile, registration: event.target.value })}
                    placeholder="Contoh: C1234567-A"
                  />
                </label>
                <label className="md:col-span-2 flex flex-col gap-1 text-sm">
                  <span>Alamat</span>
                  <textarea
                    className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={storeProfile.address}
                    onChange={(event) => setStoreProfile({ ...storeProfile, address: event.target.value })}
                    placeholder="Alamat penuh kedai"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Kadar Cukai (%)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={taxConfig.rate}
                    onChange={(event) => setTaxConfig({ ...taxConfig, rate: event.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={taxConfig.inclusive}
                    onChange={(event) => setTaxConfig({ ...taxConfig, inclusive: event.target.checked })}
                  />
                  <span>Harga termasuk cukai</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Catatan Cukai</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={taxConfig.notes}
                    onChange={(event) => setTaxConfig({ ...taxConfig, notes: event.target.value })}
                    placeholder="Contoh: SST 6% untuk servis"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Prefix Invois</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={invoiceConfig.prefix}
                    onChange={(event) => setInvoiceConfig({ ...invoiceConfig, prefix: event.target.value })}
                    placeholder="INV"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Sufiks Invois</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={invoiceConfig.suffix}
                    onChange={(event) => setInvoiceConfig({ ...invoiceConfig, suffix: event.target.value })}
                    placeholder="/2024"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Nombor Seterusnya</span>
                  <input
                    type="number"
                    min={1}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={invoiceConfig.nextNumber}
                    onChange={(event) => setInvoiceConfig({ ...invoiceConfig, nextNumber: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Panjang Pad</span>
                  <input
                    type="number"
                    min={1}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={invoiceConfig.padLength}
                    onChange={(event) => setInvoiceConfig({ ...invoiceConfig, padLength: event.target.value })}
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button onClick={saveStore} disabled={storeSaving}>
                  {storeSaving ? 'Menyimpan...' : 'Simpan Maklumat Kedai'}
                </Button>
                <Button variant="outline" onClick={saveTaxes} disabled={taxSaving}>
                  {taxSaving ? 'Mengemas kini...' : 'Simpan Cukai'}
                </Button>
              </div>
              {taxMessage ? (
                <p className="mt-3 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{taxMessage}</p>
              ) : null}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Templat WhatsApp</h2>
                <p className="text-sm text-slate-600">
                  Gunakan pemboleh ubah seperti{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{'{{nama}}'}</code>,{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{'{{produk}}'}</code> atau{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{'{{eta}}'}</code> untuk mesej dinamik.
                </p>
              </div>
              {templateMessage ? (
                <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{templateMessage}</p>
              ) : null}
              <div className="grid gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Terima (acknowledgement)</span>
                  <textarea
                    className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={templates.acknowledgement}
                    onChange={(event) => setTemplates({ ...templates, acknowledgement: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Anggaran (estimate)</span>
                  <textarea
                    className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={templates.estimate}
                    onChange={(event) => setTemplates({ ...templates, estimate: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Siap (ready)</span>
                  <textarea
                    className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={templates.ready}
                    onChange={(event) => setTemplates({ ...templates, ready: event.target.value })}
                  />
                </label>
              </div>
              <div className="mt-4">
                <Button onClick={saveTemplates} disabled={templateSaving}>
                  {templateSaving ? 'Menyimpan...' : 'Simpan Templat'}
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Kadar Throttle Kempen &amp; Backup</h2>
                <p className="text-sm text-slate-600">
                  Tetapkan had penghantaran kempen serta jadual backup automatik untuk keselamatan data.
                </p>
              </div>
              {campaignMessage ? (
                <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{campaignMessage}</p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Hantar per minit</span>
                  <input
                    type="number"
                    min={1}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={campaignConfig.throttlePerMinute}
                    onChange={(event) => setCampaignConfig({ ...campaignConfig, throttlePerMinute: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Jitter (saat)</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={campaignConfig.jitterSeconds}
                    onChange={(event) => setCampaignConfig({ ...campaignConfig, jitterSeconds: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Had harian</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={campaignConfig.dailyCap}
                    onChange={(event) => setCampaignConfig({ ...campaignConfig, dailyCap: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Zon masa</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={campaignConfig.timezone}
                    onChange={(event) => setCampaignConfig({ ...campaignConfig, timezone: event.target.value })}
                    placeholder="Asia/Kuala_Lumpur"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Jam mula (0-23)</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={campaignConfig.windowStartHour}
                    onChange={(event) => setCampaignConfig({ ...campaignConfig, windowStartHour: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Jam tamat (0-23)</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={campaignConfig.windowEndHour}
                    onChange={(event) => setCampaignConfig({ ...campaignConfig, windowEndHour: event.target.value })}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={saveCampaignConfig} disabled={campaignSaving}>
                  {campaignSaving ? 'Menyimpan...' : 'Simpan Throttle'}
                </Button>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-6">
                {backupMessage ? (
                  <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{backupMessage}</p>
                ) : null}
                <div className="grid gap-4 md:grid-cols-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Kekerapan</span>
                    <select
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={backupConfig.frequency}
                      onChange={(event) => setBackupConfig({ ...backupConfig, frequency: event.target.value })}
                    >
                      <option value="daily">Harian</option>
                      <option value="hourly">Setiap jam</option>
                      <option value="weekly">Mingguan</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Masa (24 jam)</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={backupConfig.timeOfDay}
                      onChange={(event) => setBackupConfig({ ...backupConfig, timeOfDay: event.target.value })}
                      placeholder="02:00"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Zon masa</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={backupConfig.timezone}
                      onChange={(event) => setBackupConfig({ ...backupConfig, timezone: event.target.value })}
                      placeholder="Asia/Kuala_Lumpur"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Retensi (hari)</span>
                    <input
                      type="number"
                      min={1}
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={backupConfig.retentionDays}
                      onChange={(event) => setBackupConfig({ ...backupConfig, retentionDays: event.target.value })}
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <Button onClick={saveBackupConfig} disabled={backupSaving}>
                    {backupSaving ? 'Menyimpan...' : 'Simpan Jadual Backup'}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Integrasi API &amp; Pangkalan Data</h2>
                <p className="text-sm text-slate-600">Simpan kunci akses OpenAI serta sambungan Postgres/Redis.</p>
              </div>
              {integrationMessage ? (
                <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{integrationMessage}</p>
              ) : null}
              <div className="grid gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span>OpenAI API Key</span>
                  <input
                    type="password"
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={integrationConfig.openaiKey}
                    onChange={(event) => setIntegrationConfig({ ...integrationConfig, openaiKey: event.target.value })}
                    placeholder="sk-..."
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Postgres DSN</span>
                  <input
                    type="text"
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={integrationConfig.postgresDsn}
                    onChange={(event) => setIntegrationConfig({ ...integrationConfig, postgresDsn: event.target.value })}
                    placeholder="postgresql://user:pass@host:5432/db"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Redis DSN</span>
                  <input
                    type="text"
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={integrationConfig.redisDsn}
                    onChange={(event) => setIntegrationConfig({ ...integrationConfig, redisDsn: event.target.value })}
                    placeholder="redis://:pass@host:6379"
                  />
                </label>
              </div>
              <div className="mt-4">
                <Button onClick={saveIntegrationConfig} disabled={integrationSaving}>
                  {integrationSaving ? 'Menyimpan...' : 'Simpan Kredensial'}
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Konfigurasi e-Invois MyInvois</h2>
                <p className="text-sm text-slate-600">
                  Pilih mod portal atau API (stub) dan lengkapkan butiran pembekal untuk eksport invois.
                </p>
              </div>
              {myInvoisMessage ? (
                <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{myInvoisMessage}</p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Mod</span>
                  <select
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.mode}
                    onChange={(event) =>
                      setMyInvoisConfig({ ...myInvoisConfig, mode: event.target.value as MyInvoisConfigState['mode'] })
                    }
                  >
                    <option value="portal">Portal (muat naik manual)</option>
                    <option value="api">API (stub ujian)</option>
                    <option value="disabled">Nyahaktif</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>TIN Pembekal</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.supplier.tin}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        supplier: { ...myInvoisConfig.supplier, tin: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Nama Perniagaan</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.supplier.businessName}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        supplier: { ...myInvoisConfig.supplier, businessName: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Kod Cawangan</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.supplier.branchCode}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        supplier: { ...myInvoisConfig.supplier, branchCode: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="md:col-span-2 flex flex-col gap-1 text-sm">
                  <span>Alamat Pembekal</span>
                  <textarea
                    className="min-h-[80px] rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.supplier.address}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        supplier: { ...myInvoisConfig.supplier, address: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Email</span>
                  <input
                    type="email"
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.supplier.email}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        supplier: { ...myInvoisConfig.supplier, email: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>No. Telefon</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.supplier.phone}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        supplier: { ...myInvoisConfig.supplier, phone: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Mata Wang</span>
                  <input
                    className="uppercase rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={myInvoisConfig.defaults.currency}
                    onChange={(event) =>
                      setMyInvoisConfig({
                        ...myInvoisConfig,
                        defaults: { ...myInvoisConfig.defaults, currency: event.target.value.toUpperCase() },
                      })
                    }
                  />
                </label>
              </div>

              {myInvoisConfig.mode === 'api' ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Base URL API</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={myInvoisConfig.api.baseUrl}
                      onChange={(event) =>
                        setMyInvoisConfig({
                          ...myInvoisConfig,
                          api: { ...myInvoisConfig.api, baseUrl: event.target.value },
                        })
                      }
                      placeholder="https://api.myinvois.gov.my"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Client ID</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={myInvoisConfig.api.clientId}
                      onChange={(event) =>
                        setMyInvoisConfig({
                          ...myInvoisConfig,
                          api: { ...myInvoisConfig.api, clientId: event.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Client Secret</span>
                    <input
                      type="password"
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={myInvoisConfig.api.clientSecret}
                      onChange={(event) =>
                        setMyInvoisConfig({
                          ...myInvoisConfig,
                          api: { ...myInvoisConfig.api, clientSecret: event.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Persekitaran</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={myInvoisConfig.api.environment}
                      onChange={(event) =>
                        setMyInvoisConfig({
                          ...myInvoisConfig,
                          api: { ...myInvoisConfig.api, environment: event.target.value },
                        })
                      }
                      placeholder="sandbox / production"
                    />
                  </label>
                </div>
              ) : null}

              <div className="mt-6">
                <Button onClick={saveMyInvoisConfig} disabled={myInvoisSaving}>
                  {myInvoisSaving ? 'Menyimpan...' : 'Simpan Konfigurasi MyInvois'}
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Update Panel</h2>
                <p className="text-sm text-slate-600">
                  Semak versi terkini, changelog dan jalankan pre-flight untuk menukar tag Docker secara selamat.
                </p>
              </div>
              {updateError ? (
                <p className="mb-4 rounded-lg bg-rose-100 px-4 py-2 text-sm text-rose-700">{updateError}</p>
              ) : null}
              {simulateMessage ? (
                <p
                  className={`mb-4 rounded-lg px-4 py-2 text-sm ${
                    simulateState === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {simulateMessage}
                </p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tag Semasa</p>
                  <p className="mt-1 font-mono text-sm text-slate-800">
                    {updateStatus?.currentTag ?? 'Tidak diketahui'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Dikemaskini: {formatDateTime(updateStatus?.updatedAt) || 'Belum pernah'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Cadangan</p>
                  <p className="mt-1 font-mono text-sm text-slate-800">
                    {updateStatus?.recommendedTag ?? 'Tiada cadangan'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Last checked: {formatDateTime(updateStatus?.lastCheckedAt) || 'Tidak pasti'}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Senarai Release</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {updateLoading ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      Memuat changelog...
                    </div>
                  ) : releases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      Tiada data changelog.
                    </div>
                  ) : (
                    releases.map((release) => (
                      <div key={release.tag} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900">{release.version}</p>
                          <span className="font-mono text-xs text-slate-500">{release.tag}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Dikeluarkan: {formatDateTime(release.releasedAt)}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                          {release.highlights.map((highlight, index) => (
                            <li key={index}>{highlight}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Pilih tag Docker</span>
                  <input
                    className="font-mono rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={targetTag}
                    onChange={(event) => setTargetTag(event.target.value)}
                    list="update-tags"
                    placeholder="wa-pos:v1.4.2"
                  />
                  <datalist id="update-tags">
                    {releases.map((release) => (
                      <option key={release.tag} value={release.tag}>
                        {release.version}
                      </option>
                    ))}
                  </datalist>
                </label>
                <Button onClick={runUpdateSimulation} disabled={simulateState === 'running'}>
                  {simulateState === 'running' ? 'Menjalankan...' : 'Jalankan Pre-flight'}
                </Button>
              </div>

              {simulateSteps.length > 0 ? (
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-900 p-4 text-slate-100">
                  <p className="text-sm font-semibold">Log Pre-flight</p>
                  <ol className="mt-3 space-y-2 text-sm">
                    {simulateSteps.map((step) => (
                      <li key={step.name} className="rounded border border-slate-700 bg-slate-800 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{step.name}</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-emerald-300">{step.status}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-300">{step.detail}</p>
                        <p className="mt-1 text-xs text-slate-500">Tempoh: {formatDuration(step.durationMs)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : simulateWindowOpened ? (
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Pre-flight selesai tanpa log terperinci.
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
