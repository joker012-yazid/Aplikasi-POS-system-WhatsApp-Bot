'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false });

type QRCodeProps = {
  url: string;
  label?: string;
};

export function ShareableQRCode({ url, label }: QRCodeProps) {
  const normalized = useMemo(() => url.trim(), [url]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-lg bg-white p-2 shadow">
        <QRCode value={normalized} size={180} bgColor="#ffffff" fgColor="#020817" />
      </div>
      <p className="text-center text-sm text-slate-600">
        {label ?? 'Imbas untuk buka borang pelanggan'}
      </p>
      <p className="break-all text-center text-xs font-mono text-slate-400">{normalized}</p>
    </div>
  );
}
