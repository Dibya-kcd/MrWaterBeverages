import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { TOAST_EVENT, ToastKind } from '../../utils/toast';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const STYLE: Record<ToastKind, { box: string; Icon: React.ElementType }> = {
  error: { box: 'bg-rose-50 border-rose-300 text-rose-900', Icon: AlertCircle },
  success: { box: 'bg-emerald-50 border-emerald-300 text-emerald-900', Icon: CheckCircle2 },
  info: { box: 'bg-sky-50 border-sky-300 text-sky-900', Icon: Info },
};

/** Replaces the browser's blocking alert() box with a message that fits the app and the phone. */
export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let next = 1;
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail || {};
      if (!message) return;
      const id = next++;
      setToasts((t) => [...t.slice(-2), { id, message: String(message), kind: kind || 'error' }]);
      const ms = Math.min(10000, 3500 + String(message).length * 45);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      role="status"
      aria-live="assertive"
    >
      {toasts.map((t) => {
        const { box, Icon } = STYLE[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-md flex items-start gap-2.5 rounded-2xl border-2 px-3.5 py-3 shadow-xl text-sm font-semibold whitespace-pre-line ${box}`}
          >
            <Icon size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 break-words">{t.message}</div>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="shrink-0 p-1 -m-1 rounded-lg hover:bg-black/5 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
