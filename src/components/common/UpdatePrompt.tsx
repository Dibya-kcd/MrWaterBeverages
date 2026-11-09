import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PWA_UPDATE_EVENT, applyPwaUpdate } from '../../registerServiceWorker';

/** Small bottom bar shown when a new version is ready. The page only reloads when the user taps Update. */
export const UpdatePrompt: React.FC = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const on = () => setReady(true);
    window.addEventListener(PWA_UPDATE_EVENT, on);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, on);
  }, []);
  if (!ready) return null;
  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-sm flex items-center justify-between gap-3 rounded-2xl bg-[var(--primary)] px-4 py-3 text-white shadow-xl">
      <span className="text-[13px] font-semibold leading-tight">New version ready</span>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={() => setReady(false)} className="px-2 py-1.5 text-xs font-semibold text-white/70 cursor-pointer">Later</button>
        <button type="button" onClick={() => applyPwaUpdate()} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[var(--primary)] cursor-pointer">
          <RefreshCw size={13} /> Update
        </button>
      </div>
    </div>
  );
};
