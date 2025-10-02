'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '../../../../components/ui/button';

type WorkTicketStatus = 'NEW' | 'IN_PROGRESS' | 'READY' | 'CLOSED';
type WorkTicketEventType =
  | 'CREATED'
  | 'NOTE'
  | 'PHOTO'
  | 'ESTIMATE_SET'
  | 'CUSTOMER_APPROVED'
  | 'CUSTOMER_DECLINED'
  | 'READY'
  | 'PICKED_UP';

interface WorkTicketEvent {
  id: string;
  type: WorkTicketEventType;
  created_at: string;
  note?: string | null;
  payload?: Record<string, unknown> | null;
}

interface WorkTicketCustomer {
  id: string;
  name: string;
  phone?: string | null;
}

interface WorkTicketDevice {
  id: string;
  label?: string | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
}

interface WorkTicket {
  id: string;
  title: string;
  description?: string | null;
  status: WorkTicketStatus;
  price_estimate?: string | number | null;
  eta_ready_at?: string | null;
  created_at: string;
  customer?: WorkTicketCustomer | null;
  device?: WorkTicketDevice | null;
  events?: WorkTicketEvent[];
}

type KanbanBoard = Record<WorkTicketStatus, WorkTicket[]>;

type QuickAction = 'estimate' | 'approval' | 'note' | 'ready';

const TOKEN_STORAGE_KEY = 'wa-pos-admin-token';
const STATUSES: WorkTicketStatus[] = ['NEW', 'IN_PROGRESS', 'READY'];

const statusLabels: Record<WorkTicketStatus, string> = {
  NEW: 'Baru',
  IN_PROGRESS: 'Sedang Dibaiki',
  READY: 'Sedia Diambil',
  CLOSED: 'Ditutup',
};

const formatCurrency = (value?: string | number | null) => {
  if (value === null || value === undefined) return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const normalisePhone = (phone?: string | null) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

const attachmentsFromEvents = (events?: WorkTicketEvent[]) => {
  if (!events?.length) return [] as string[];
  const attachments = new Set<string>();
  events.forEach((event) => {
    if (event.type === 'PHOTO' || event.type === 'READY') {
      const raw = event.payload?.photos;
      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          if (typeof item === 'string') attachments.add(item);
        });
      }
    }
    if (event.type === 'ESTIMATE_SET') {
      const doc = event.payload?.estimate_document;
      if (typeof doc === 'string') attachments.add(doc);
    }
  });
  return Array.from(attachments);
};

const slaBadge = (ticket: WorkTicket) => {
  if (!ticket.eta_ready_at) return null;
  const eta = new Date(ticket.eta_ready_at);
  if (Number.isNaN(eta.getTime())) return null;
  const now = new Date();
  const diff = eta.getTime() - now.getTime();
  const fourHours = 1000 * 60 * 60 * 4;

  if (diff <= 0) {
    return { label: 'Lewat ETA', tone: 'danger' as const };
  }
  if (diff <= fourHours) {
    return { label: 'Hampir ETA', tone: 'warning' as const };
  }
  return null;
};

interface TicketCardProps {
  ticket: WorkTicket;
  onAction: (ticket: WorkTicket, action: QuickAction) => void;
  disableDrag?: boolean;
}

function TicketCard({ ticket, onAction, disableDrag }: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: disableDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const attachments = attachmentsFromEvents(ticket.events);
  const sla = slaBadge(ticket);
  const phone = normalisePhone(ticket.customer?.phone);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 ${
        isDragging ? 'ring-2 ring-indigo-500' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">#{ticket.id.slice(0, 8)}</p>
          <h3 className="text-lg font-semibold text-slate-900">{ticket.title}</h3>
        </div>
        {sla ? (
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              sla.tone === 'danger'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {sla.label}
          </span>
        ) : null}
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <p className="font-medium text-slate-700">{ticket.customer?.name ?? 'Tanpa Nama'}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Peranti</p>
        <p>
          {[ticket.device?.brand, ticket.device?.model].filter(Boolean).join(' ')}
          {ticket.device?.serial ? (
            <span className="ml-2 text-xs text-slate-400">SN: {ticket.device.serial}</span>
          ) : null}
        </p>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Masalah</p>
        <p>{ticket.description ?? 'Tiada catatan'}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            ETA: <strong className="text-slate-700">{formatDateTime(ticket.eta_ready_at)}</strong>
          </span>
          <span>
            Anggaran:{' '}
            <strong className="text-slate-700">{formatCurrency(ticket.price_estimate)}</strong>
          </span>
        </div>
        {attachments.length ? (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Lampiran</p>
            <ul className="flex flex-wrap gap-2">
              {attachments.slice(0, 3).map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-indigo-600 hover:border-indigo-300 hover:text-indigo-700"
                  >
                    Lihat
                  </a>
                </li>
              ))}
              {attachments.length > 3 ? (
                <li className="text-xs text-slate-500">+{attachments.length - 3} lagi</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {phone ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">
              Chat WA
            </Link>
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => onAction(ticket, 'estimate')}>
          Set Anggaran
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onAction(ticket, 'approval')}>
          Minta Kelulusan
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onAction(ticket, 'note')}>
          Nota / Gambar
        </Button>
        <Button variant="default" size="sm" onClick={() => onAction(ticket, 'ready')}>
          Tanda Siap
        </Button>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  status: WorkTicketStatus;
  tickets: WorkTicket[];
  onAction: (ticket: WorkTicket, action: QuickAction) => void;
}

function KanbanColumn({ status, tickets, onAction }: KanbanColumnProps) {
  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-2xl border border-slate-200 bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Status</p>
          <h2 className="text-lg font-semibold text-slate-900">{statusLabels[status]}</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
          {tickets.length} tiket
        </span>
      </header>
      <DndDroppable id={status}>
        <SortableContext items={tickets.map((ticket) => ticket.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            {tickets.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
                Tiada tiket
              </div>
            ) : (
              tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onAction={onAction} />)
            )}
          </div>
        </SortableContext>
      </DndDroppable>
    </div>
  );
}

interface DndDroppableProps {
  id: string;
  children: ReactNode;
}

function DndDroppable({ id, children }: DndDroppableProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto rounded-b-2xl ${isOver ? 'bg-indigo-50/80' : ''}`}
    >
      {children}
    </div>
  );
}

function DragPreview({ ticket }: { ticket: WorkTicket | null }) {
  if (!ticket) return null;
  return (
    <div className="w-72 rounded-xl border border-indigo-300 bg-white p-4 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">#{ticket.id.slice(0, 8)}</p>
      <h3 className="text-lg font-semibold text-slate-900">{ticket.title}</h3>
      <p className="mt-2 text-sm text-slate-600">{ticket.customer?.name ?? 'Tanpa Nama'}</p>
    </div>
  );
}

interface BannerMessage {
  tone: 'success' | 'error';
  message: string;
}

interface ActionState {
  ticket: WorkTicket;
  type: QuickAction;
}

export default function TicketKanbanPage() {
  const [board, setBoard] = useState<KanbanBoard>({ NEW: [], IN_PROGRESS: [], READY: [], CLOSED: [] });
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionState | null>(null);
  const [pendingReadyTarget, setPendingReadyTarget] = useState<WorkTicketStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (saved) {
      setToken(saved);
    }
  }, []);

  const buildHeaders = useCallback(
    (extras?: Record<string, string>) => ({
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extras ?? {}),
    }),
    [token],
  );

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tickets/kanban', {
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'Sesi tamat atau token tidak sah.' : 'Gagal memuat tiket.');
      }
      const payload = (await response.json()) as { data: KanbanBoard };
      setBoard(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat tiket.');
    } finally {
      setLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);

  const ticketLookup = useMemo(() => {
    const map = new Map<string, { ticket: WorkTicket; status: WorkTicketStatus }>();
    STATUSES.forEach((status) => {
      board[status]?.forEach((ticket) => {
        map.set(ticket.id, { ticket, status });
      });
    });
    return map;
  }, [board]);

  const handleTokenChange = (value: string) => {
    setToken(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
    }
  };

  const resolveStatusFromDrop = (id: string | number | symbol | null) => {
    if (!id) return null;
    const asString = String(id);
    if (STATUSES.includes(asString as WorkTicketStatus)) {
      return asString as WorkTicketStatus;
    }
    const ticket = ticketLookup.get(asString);
    return ticket?.status ?? null;
  };

  const persistStatusChange = async (ticketId: string, to: WorkTicketStatus) => {
    const response = await fetch(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: to }),
    });
    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Token tidak sah.' : 'Gagal mengemas kini status.');
    }
    const payload = (await response.json()) as { data: WorkTicket };
    return payload.data;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTicketId(null);
    if (!over) return;

    const ticketMeta = ticketLookup.get(String(active.id));
    if (!ticketMeta) return;

    const targetStatus = resolveStatusFromDrop(over.id);
    if (!targetStatus || targetStatus === ticketMeta.status) {
      return;
    }

    if (targetStatus === 'READY') {
      setPendingReadyTarget(targetStatus);
      setPendingAction({ ticket: ticketMeta.ticket, type: 'ready' });
      return;
    }

    try {
      await persistStatusChange(ticketMeta.ticket.id, targetStatus);
      await fetchBoard();
      setBanner({ tone: 'success', message: 'Status tiket dikemas kini.' });
    } catch (err) {
      await fetchBoard();
      setBanner({ tone: 'error', message: err instanceof Error ? err.message : 'Gagal mengemas kini status.' });
    }
  };

  const handleDragStart = (event: { active: { id: string | number } }) => {
    setActiveTicketId(String(event.active.id));
  };

  const handleAction = (ticket: WorkTicket, action: QuickAction) => {
    setPendingReadyTarget(null);
    setPendingAction({ ticket, type: action });
  };

  const closeAction = () => {
    setPendingAction(null);
    setPendingReadyTarget(null);
  };

  const submitEstimate = async (ticket: WorkTicket, formData: FormData) => {
    const amount = formData.get('price_estimate');
    const eta = formData.get('eta_ready_at') as string | null;
    if (!amount) {
      throw new Error('Sila masukkan anggaran harga.');
    }

    const response = await fetch(`/api/tickets/${ticket.id}/estimate`, {
      method: 'PATCH',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        price_estimate: Number(amount),
        eta_ready_at: eta || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Token tidak sah.' : 'Gagal menetapkan anggaran.');
    }
  };

  const submitApproval = async (ticket: WorkTicket) => {
    const response = await fetch(`/api/tickets/${ticket.id}/request-approval`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Token tidak sah.' : 'Gagal memaklumkan bot.');
    }
  };

  const submitNote = async (ticket: WorkTicket, formData: FormData) => {
    const type = (formData.get('event_type') as WorkTicketEventType) || 'NOTE';
    const note = formData.get('note');
    const photos = (formData.get('photos') as string | null)?.split('\n').map((item) => item.trim()).filter(Boolean) ?? [];

    if (type === 'NOTE' && !note) {
      throw new Error('Nota diperlukan untuk acara jenis NOTE.');
    }

    const payload: Record<string, unknown> = {};
    if (photos.length) {
      payload.photos = photos;
    }

    const response = await fetch(`/api/repairs/${ticket.id}/note`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        type,
        note: note || undefined,
        payload: Object.keys(payload).length ? payload : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Token tidak sah.' : 'Gagal menambah nota.');
    }
  };

  const submitReady = async (ticket: WorkTicket, formData: FormData) => {
    const note = formData.get('note');
    const photos = (formData.get('photos') as string | null)?.split('\n').map((item) => item.trim()).filter(Boolean) ?? [];

    const response = await fetch(`/api/tickets/${ticket.id}/ready`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        note: note || undefined,
        photos: photos.length ? photos : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Token tidak sah.' : 'Gagal menandakan tiket siap.');
    }
  };

  const handleActionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction) return;

    const formData = new FormData(event.currentTarget);
    try {
      switch (pendingAction.type) {
        case 'estimate':
          await submitEstimate(pendingAction.ticket, formData);
          break;
        case 'approval':
          await submitApproval(pendingAction.ticket);
          break;
        case 'note':
          await submitNote(pendingAction.ticket, formData);
          break;
        case 'ready':
          await submitReady(pendingAction.ticket, formData);
          break;
      }
      await fetchBoard();
      setBanner({ tone: 'success', message: 'Tindakan berjaya.' });
      closeAction();
    } catch (err) {
      setBanner({ tone: 'error', message: err instanceof Error ? err.message : 'Tindakan gagal.' });
    }
  };

  const activeTicket = activeTicketId ? ticketLookup.get(activeTicketId)?.ticket ?? null : null;

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Operasi Bengkel</p>
            <h1 className="text-3xl font-bold text-slate-900">Tiket Kerja</h1>
            <p className="text-sm text-slate-600">
              Susun tiket mengikut status, lakukan tindakan pantas dan pantau SLA secara langsung.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <label className="text-xs font-medium uppercase tracking-[0.3em] text-slate-500">Token Admin</label>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-72"
              placeholder="Bearer token"
              value={token}
              onChange={(event) => handleTokenChange(event.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => fetchBoard()} className="self-start sm:self-end">
              Muat Semula
            </Button>
          </div>
        </header>

        {banner ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              banner.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {banner.message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <DndContext
          sensors={sensors}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          modifiers={[restrictToWindowEdges]}
        >
          <div className="grid gap-6 lg:grid-cols-3">
            {STATUSES.map((status) => (
              <KanbanColumn key={status} status={status} tickets={board[status] ?? []} onAction={handleAction} />
            ))}
          </div>
          <DragOverlay>
            <DragPreview ticket={activeTicket} />
          </DragOverlay>
        </DndContext>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Memuat tiket...
          </div>
        ) : null}
      </div>

      <ActionDialog
        state={pendingAction}
        onClose={closeAction}
        onSubmit={handleActionSubmit}
        readyTarget={pendingReadyTarget}
      />
    </div>
  );
}

interface ActionDialogProps {
  state: ActionState | null;
  readyTarget: WorkTicketStatus | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function ActionDialog({ state, onClose, onSubmit, readyTarget }: ActionDialogProps) {
  if (!state) return null;

  const { ticket, type } = state;

  const titleMap: Record<QuickAction, string> = {
    estimate: 'Tetapkan anggaran & ETA',
    approval: 'Minta kelulusan pelanggan',
    note: 'Tambah nota / gambar',
    ready: 'Tanda tiket siap',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{titleMap[type]}</h2>
          <p className="text-sm text-slate-500">#{ticket.id.slice(0, 8)} · {ticket.customer?.name ?? 'Tanpa Nama'}</p>
        </header>
        <form onSubmit={onSubmit} className="space-y-5 px-6 py-5">
          {type === 'estimate' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Anggaran Harga (RM)</label>
                <input
                  name="price_estimate"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={ticket.price_estimate ? Number(ticket.price_estimate) : ''}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">ETA Siap</label>
                <input
                  name="eta_ready_at"
                  type="datetime-local"
                  defaultValue={ticket.eta_ready_at ? ticket.eta_ready_at.slice(0, 16) : ''}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </>
          ) : null}

          {type === 'approval' ? (
            <p className="text-sm text-slate-600">
              Bot WhatsApp akan menghantar mesej kepada pelanggan dengan maklumat anggaran dan ETA terkini.
            </p>
          ) : null}

          {type === 'note' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Jenis Acara</label>
                <select
                  name="event_type"
                  defaultValue="NOTE"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="NOTE">Nota</option>
                  <option value="PHOTO">Gambar</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nota</label>
                <textarea
                  name="note"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Kemaskini status atau maklumat tambahan"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">URL Gambar (satu setiap baris)</label>
                <textarea
                  name="photos"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="https://contoh.com/gambar-1.jpg"
                />
              </div>
            </>
          ) : null}

          {type === 'ready' ? (
            <>
              {readyTarget === 'READY' ? (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  Sahkan maklumat sebelum tiket dipindahkan ke status <strong>READY</strong> dan gambar akan dikongsi bersama pelanggan.
                </p>
              ) : null}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nota Penyerahan</label>
                <textarea
                  name="note"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Peranti siap, sedia untuk diambil"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">URL Gambar Siap (satu setiap baris)</label>
                <textarea
                  name="photos"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="https://contoh.com/siap-1.jpg"
                />
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="default">
              Simpan
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
