import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { DIALOG_EVENT, DialogRequest, registerDialogHost } from '../../utils/dialogs';

/** Shows the dialogs asked for by confirmDialog() / promptDialog() (see utils/dialogs.ts). One at a time, in order. */
export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const unregister = registerDialogHost();
    const onRequest = (e: Event) => {
      const req = (e as CustomEvent<DialogRequest>).detail;
      if (req) setQueue((q) => [...q, req]);
    };
    window.addEventListener(DIALOG_EVENT, onRequest);
    return () => {
      window.removeEventListener(DIALOG_EVENT, onRequest);
      unregister();
    };
  }, []);

  // Escape closes the top-most pop-up that is marked data-esc-close (the same thing as tapping outside it).
  // It never fires while typing in a field or a drop-down, so those keep their own Escape behaviour.
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      const overlays = document.querySelectorAll<HTMLElement>('[data-esc-close]');
      const top = overlays[overlays.length - 1];
      if (top) top.click();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  const current = queue[0];

  // New dialog: reset the typed text and put focus somewhere safe (the text box, otherwise Cancel).
  useEffect(() => {
    if (!current) return;
    setTyped(current.kind === 'prompt' ? current.options.defaultValue || '' : '');
    setBusy(false);
    const id = window.setTimeout(() => (inputRef.current || cancelRef.current)?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [current]);

  const finish = (ok: boolean) => {
    if (!current) return;
    if (current.kind === 'confirm') current.resolve(ok);
    else current.resolve(ok ? typed : null);
    setQueue((q) => q.slice(1));
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!current) return null;
  const o = current.options;
  const tone = o.tone || 'primary';
  const needWord = (o.typeToConfirm || '').trim();
  const wordOk = !needWord || typed.trim().toLowerCase() === needWord.toLowerCase();
  const canConfirm = wordOk && !busy;
  const confirmCls =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : tone === 'warning'
        ? 'bg-amber-500 hover:bg-amber-600 text-white'
        : 'bg-indigo-600 hover:bg-indigo-700 text-white';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={o.title}
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60"
      onClick={() => finish(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-5 py-4 flex items-start gap-3 border-b border-slate-100 ${tone === 'danger' ? 'bg-rose-50/60' : 'bg-slate-50/60'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone === 'danger' ? 'bg-rose-100 text-rose-600' : tone === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="flex-1 text-base font-semibold text-slate-900 leading-snug pt-1.5">{o.title}</h3>
          <button type="button" aria-label="Close" onClick={() => finish(false)} className="p-2 -m-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {o.message && <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{o.message}</p>}
          {o.details && o.details.length > 0 && (
            <ul className="text-sm text-slate-700 rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100">
              {o.details.map((d, i) => (
                <li key={i} className="px-3 py-1.5">{d}</li>
              ))}
            </ul>
          )}
          {o.extraAction && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await o.extraAction!.onClick();
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
            >
              {o.extraAction.label}
            </button>
          )}
          {needWord && (
            <label className="block text-xs font-semibold text-slate-700">
              Type <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-900">{needWord}</span> to continue
              <input
                ref={(el) => { inputRef.current = el; }}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm font-mono focus:outline-hidden focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </label>
          )}
          {current.kind === 'prompt' && !needWord &&
            (current.options.multiline ? (
              <textarea
                ref={(el) => { inputRef.current = el; }}
                rows={3}
                value={typed}
                placeholder={current.options.placeholder}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            ) : (
              <input
                ref={(el) => { inputRef.current = el; }}
                value={typed}
                placeholder={current.options.placeholder}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') finish(true); }}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            ))}
        </div>

        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => finish(false)}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {o.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => canConfirm && finish(true)}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${confirmCls}`}
          >
            {o.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
