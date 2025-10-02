'use client';

import { useEffect, useMemo, useState } from 'react';

import { ShareableQRCode } from '../../../../components/qr-code';
import {
  CustomerFormConfig,
  CustomerFormField,
  CustomerFormSection,
  CustomerFormStatePayload,
} from '../../../../lib/types/customer-form';

const PUBLIC_FORM_ENDPOINT = '/api/public/customer-form';
const SETTINGS_ENDPOINT = '/api/settings/customerForm';
const TOKEN_STORAGE_KEY = 'wa-pos-admin-token';

type ToggleKey = 'enabled' | 'required';

type RequestState = 'idle' | 'loading' | 'saving' | 'success' | 'error';

const sortFieldsBySection = (config: CustomerFormConfig) => {
  const sections = config.sections.reduce<Record<string, { section: CustomerFormSection; fields: CustomerFormField[] }>>(
    (acc, section) => {
      acc[section.id] = { section, fields: [] };
      return acc;
    },
    {},
  );

  config.fields.forEach((field) => {
    if (!sections[field.section]) {
      sections[field.section] = {
        section: { id: field.section, title: { en: field.section, ms: field.section } },
        fields: [],
      };
    }
    sections[field.section].fields.push(field);
  });

  return Object.values(sections);
};

export default function CustomerFormBuilderPage() {
  const [config, setConfig] = useState<CustomerFormConfig | null>(null);
  const [requestState, setRequestState] = useState<RequestState>('loading');
  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  const loadConfig = async () => {
    setRequestState('loading');
    setErrorMessage('');
    try {
      const response = await fetch(PUBLIC_FORM_ENDPOINT, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Gagal memuat konfigurasi (${response.status})`);
      }
      const data = (await response.json()) as { data: CustomerFormConfig };
      setConfig(data.data);
      setRequestState('idle');
    } catch (error) {
      setRequestState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat konfigurasi');
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleToggle = (fieldId: CustomerFormField['id'], key: ToggleKey, value: boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      fields: config.fields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              [key]: key === 'enabled' ? value : value && field.enabled,
              ...(key === 'enabled' && !value ? { required: false } : {}),
            }
          : field,
      ),
    });
  };

  const handleTokenChange = (value: string) => {
    setToken(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setRequestState('saving');
    setErrorMessage('');

    const payload: CustomerFormStatePayload = {
      value: {
        version: config.version,
        fields: config.fields.map((field) => ({
          id: field.id,
          enabled: field.enabled,
          required: field.required,
        })),
      },
    };

    try {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = response.status === 401 ? 'Token tidak sah atau telah tamat.' : 'Gagal menyimpan konfigurasi';
        throw new Error(message);
      }

      setRequestState('success');
      setTimeout(() => setRequestState('idle'), 2500);
    } catch (error) {
      setRequestState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi');
    }
  };

  const formUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/forms/customer`;
  }, []);

  const groupedSections = config ? sortFieldsBySection(config) : [];

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Borang Pelanggan</p>
            <h1 className="text-3xl font-bold text-slate-900">Konfigurasi Borang Intake</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Hidupkan, matikan atau wajibkan medan tanpa perlu deploy semula. Simpan untuk kemas kini serta-merta.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="admin-token">
                JWT Token Admin
              </label>
              <input
                id="admin-token"
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Bearer token untuk API"
                value={token}
                onChange={(event) => handleTokenChange(event.target.value)}
              />
            </div>
            <ShareableQRCode url={formUrl} label="Imbas untuk uji borang" />
          </div>
        </header>

        {requestState === 'loading' && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Memuat konfigurasi borang…
          </div>
        )}

        {requestState === 'error' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage || 'Berlaku ralat semasa memuat atau menyimpan konfigurasi.'}
          </div>
        )}

        {config && (
          <div className="flex flex-col gap-6">
            {groupedSections.map(({ section, fields }) => (
              <section key={section.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <header className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">{section.title.ms}</h2>
                  {section.description?.ms && <p className="text-sm text-slate-500">{section.description.ms}</p>}
                </header>
                <div className="divide-y divide-slate-100">
                  {fields.map((field) => (
                    <div key={field.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-800">{field.label.ms}</p>
                        {field.label.en !== field.label.ms && (
                          <p className="text-xs text-slate-400">{field.label.en}</p>
                        )}
                        {field.helperText?.ms && <p className="text-xs text-slate-500">{field.helperText.ms}</p>}
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={field.enabled}
                            onChange={(event) => handleToggle(field.id, 'enabled', event.target.checked)}
                          />
                          Aktif
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={field.required}
                            disabled={!field.enabled}
                            onChange={(event) => handleToggle(field.id, 'required', event.target.checked)}
                          />
                          Wajib
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={() => void loadConfig()}
                disabled={requestState === 'loading'}
              >
                Reset ke konfigurasi terkini
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                onClick={() => void handleSave()}
                disabled={requestState === 'saving'}
              >
                {requestState === 'saving' ? 'Menyimpan…' : 'Simpan perubahan'}
              </button>
            </div>
            {requestState === 'success' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                Konfigurasi berjaya dikemaskini. Cuba imbas QR untuk uji borang pelanggan.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
