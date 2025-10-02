'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { CustomerFormConfig, CustomerFormField } from '../../../lib/types/customer-form';

type FormStatus = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

const PUBLIC_FORM_ENDPOINT = '/api/public/customer-form';

const EMPTY_FORM: Record<string, unknown> = {};

const isStringValueEmpty = (value: unknown) => {
  if (typeof value !== 'string') return true;
  return value.trim().length === 0;
};

const isPhotoValueEmpty = (value: unknown) => !Array.isArray(value) || value.length === 0;

export default function CustomerIntakeFormPage() {
  const [config, setConfig] = useState<CustomerFormConfig | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>(EMPTY_FORM);
  const [status, setStatus] = useState<FormStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [ticketId, setTicketId] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchConfig = async () => {
    setStatus('loading');
    setErrorMessage('');
    try {
      const response = await fetch(PUBLIC_FORM_ENDPOINT, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Tidak dapat memuat borang. Sila cuba lagi.');
      }
      const data = (await response.json()) as { data: CustomerFormConfig };
      setConfig(data.data);
      const initialValues: Record<string, unknown> = {};
      data.data.fields.forEach((field) => {
        if (!field.enabled) return;
        switch (field.type) {
          case 'checkbox':
            initialValues[field.id] = false;
            break;
          case 'photos':
            initialValues[field.id] = [];
            break;
          default:
            initialValues[field.id] = '';
        }
      });
      setFormValues(initialValues);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Berlaku ralat tidak dijangka.');
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  const updateField = (fieldId: CustomerFormField['id'], value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const readers = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca fail.'));
          reader.readAsDataURL(file);
        }),
    );

    try {
      const results = await Promise.all(readers);
      setFormValues((prev) => ({
        ...prev,
        photos: [...(Array.isArray(prev.photos) ? prev.photos : []), ...results.filter(Boolean)],
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Tidak dapat memproses foto.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removePhoto = (index: number) => {
    setFormValues((prev) => {
      if (!Array.isArray(prev.photos)) return prev;
      const nextPhotos = prev.photos.filter((_, idx) => idx !== index);
      return { ...prev, photos: nextPhotos };
    });
  };

  const validateSubmission = () => {
    if (!config) return 'Konfigurasi borang tidak tersedia.';
    const missingFields: string[] = [];

    config.fields.forEach((field) => {
      if (!field.enabled || !field.required) return;
      const value = formValues[field.id];
      if (field.type === 'checkbox' && !value) {
        missingFields.push(field.label.ms);
        return;
      }
      if (field.type === 'photos') {
        if (isPhotoValueEmpty(value)) {
          missingFields.push(field.label.ms);
        }
        return;
      }
      if (isStringValueEmpty(value)) {
        missingFields.push(field.label.ms);
      }
    });

    if (missingFields.length) {
      return `Sila lengkapkan medan wajib: ${missingFields.join(', ')}`;
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config) return;

    const validationError = validateSubmission();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    const payload: Record<string, unknown> = {};

    config.fields.forEach((field) => {
      if (!field.enabled) return;
      const value = formValues[field.id];

      if (field.type === 'checkbox') {
        payload[field.id] = Boolean(value);
        return;
      }

      if (field.type === 'photos') {
        if (Array.isArray(value) && value.length > 0) {
          payload[field.id] = value;
        }
        return;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed || field.required) {
          payload[field.id] = trimmed;
        }
      }
    });

    try {
      const response = await fetch(PUBLIC_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      if (!response.ok) {
        const message = typeof body?.error === 'string' ? body.error : 'Gagal menghantar borang. Cuba lagi.';
        throw new Error(message);
      }

      setTicketId(body?.data?.ticketId ?? '');
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Gagal menghantar borang.');
    }
  };

  const resetForm = () => {
    if (!config) return;
    const resetValues: Record<string, unknown> = {};
    config.fields.forEach((field) => {
      if (!field.enabled) return;
      resetValues[field.id] = field.type === 'checkbox' ? false : field.type === 'photos' ? [] : '';
    });
    setFormValues(resetValues);
    setTicketId('');
    setStatus('ready');
  };

  const enabledSections = useMemo(() => {
    if (!config) return [] as CustomerFormConfig['sections'];
    return config.sections.filter((section) =>
      config.fields.some((field) => field.section === section.id && field.enabled),
    );
  }, [config]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="animate-pulse text-sm uppercase tracking-[0.4em]">Memuat borang pelanggan…</p>
      </div>
    );
  }

  if (status === 'success' && ticketId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 p-8 text-white">
        <div className="w-full max-w-lg rounded-3xl bg-white/10 p-8 shadow-xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.4em] text-emerald-100">Terima kasih!</p>
          <h1 className="mt-3 text-3xl font-semibold">Borang diterima</h1>
          <p className="mt-2 text-sm text-emerald-50">
            Pasukan kami sedang menyemak tiket anda. Simpan ID tiket ini untuk rujukan:
          </p>
          <div className="mt-6 rounded-2xl border border-white/40 bg-white/20 p-6 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-100">ID Tiket</p>
            <p className="mt-2 text-2xl font-bold tracking-wide">{ticketId}</p>
          </div>
          <button
            type="button"
            className="mt-8 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-emerald-600 shadow-lg transition hover:bg-emerald-50"
            onClick={resetForm}
          >
            Hantar borang baru
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error' && !config) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-rose-50 p-6 text-rose-700">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Borang tidak tersedia</h1>
          <p className="mt-2 text-sm">{errorMessage || 'Sila cuba lagi kemudian atau hubungi kami.'}</p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-rose-700"
            onClick={() => void fetchConfig()}
          >
            Cuba muat semula
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">WA-POS-CRM</p>
          <h1 className="mt-3 text-3xl font-semibold">Borang Intake Pelanggan</h1>
          <p className="mt-2 text-sm text-slate-300">
            Isikan maklumat di bawah untuk memulakan proses servis. Ruang bertanda * adalah wajib.
          </p>
        </header>

        {errorMessage && status !== 'submitting' && (
          <div className="rounded-2xl border border-amber-400 bg-amber-100/10 p-4 text-sm text-amber-200">
            {errorMessage}
          </div>
        )}

        <form
          className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur"
          onSubmit={handleSubmit}
        >
          {enabledSections.map((section) => (
            <section key={section.id} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{section.title.ms}</h2>
                {section.description?.ms && <p className="text-xs text-slate-300">{section.description.ms}</p>}
              </div>
              <div className="grid gap-4">
                {config?.fields
                  .filter((field) => field.section === section.id && field.enabled)
                  .map((field) => {
                    const value = formValues[field.id];
                    const label = `${field.label.ms}${field.required ? ' *' : ''}`;
                    const placeholder = field.placeholder?.ms ?? '';

                    if (field.type === 'checkbox') {
                      return (
                        <label
                          key={field.id}
                          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 rounded border-white/40 bg-transparent text-emerald-400 focus:ring-emerald-300"
                            checked={Boolean(value)}
                            onChange={(event) => updateField(field.id, event.target.checked)}
                          />
                          <span>
                            <span className="font-medium text-white">{label}</span>
                            {field.helperText?.ms && <p className="text-xs text-slate-300">{field.helperText.ms}</p>}
                          </span>
                        </label>
                      );
                    }

                    if (field.type === 'textarea') {
                      return (
                        <label key={field.id} className="flex flex-col gap-2 text-sm text-slate-200">
                          <span className="font-medium text-white">{label}</span>
                          <textarea
                            className="min-h-[120px] rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                            placeholder={placeholder}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) => updateField(field.id, event.target.value)}
                          />
                          {field.helperText?.ms && <p className="text-xs text-slate-400">{field.helperText.ms}</p>}
                        </label>
                      );
                    }

                    if (field.type === 'select') {
                      return (
                        <label key={field.id} className="flex flex-col gap-2 text-sm text-slate-200">
                          <span className="font-medium text-white">{label}</span>
                          <select
                            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) => updateField(field.id, event.target.value)}
                          >
                            <option value="">Pilih satu</option>
                            {field.options?.map((option) => (
                              <option key={option.value} value={option.value} className="text-slate-900">
                                {option.label.ms}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }

                    if (field.type === 'photos') {
                      const photos = Array.isArray(value) ? (value as string[]) : [];
                      return (
                        <div key={field.id} className="space-y-3 text-sm text-slate-200">
                          <p className="font-medium text-white">{label}</p>
                          <div className="flex flex-wrap gap-3">
                            {photos.map((photo, index) => (
                              <div key={index} className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10">
                                <img src={photo} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
                                <button
                                  type="button"
                                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white"
                                  onClick={() => removePhoto(index)}
                                >
                                  buang
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              hidden
                              onChange={(event) => void handleFileUpload(event.target.files)}
                            />
                            <button
                              type="button"
                              className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-white transition hover:border-emerald-300 hover:text-emerald-200"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              Tambah foto
                            </button>
                            {field.helperText?.ms && <p className="text-xs text-slate-400">{field.helperText.ms}</p>}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <label key={field.id} className="flex flex-col gap-2 text-sm text-slate-200">
                        <span className="font-medium text-white">{label}</span>
                        <input
                          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                          placeholder={placeholder}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(event) => updateField(field.id, event.target.value)}
                        />
                      </label>
                    );
                  })}
              </div>
            </section>
          ))}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Dengan menekan hantar, anda bersetuju dengan terma servis kami dan menerima pengesahan melalui WhatsApp jika dipilih.
            </p>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-600/60"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Menghantar…' : 'Hantar Borang'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
