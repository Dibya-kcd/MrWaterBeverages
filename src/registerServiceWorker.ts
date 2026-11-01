import { registerSW } from 'virtual:pwa-register';

export const PWA_UPDATE_EVENT = 'mrwater-pwa-update-available';
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

/** Called by the "Update available" prompt. Activates the new version and reloads once. */
export function applyPwaUpdate() {
  if (applyUpdate) return applyUpdate(true);
  window.location.reload();
}

export default function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  // Inside an iframe (e.g. AI Studio development environment), service workers are prohibited
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }
  if (!('serviceWorker' in navigator)) return;

  // Older builds registered /service-worker.js (cache-first, also for /api GETs = stale trips). Remove it.
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) =>
      regs.forEach((r) => {
        const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || '';
        if (/\/service-worker\.js$/.test(url)) r.unregister().catch(() => {});
      }),
    )
    .catch(() => {});

  try {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Do NOT reload here: the user may be in the middle of a bill or a trip.
        window.dispatchEvent(new Event(PWA_UPDATE_EVENT));
      },
      onRegisterError(error) {
        console.debug('ServiceWorker registration skipped:', error);
      },
    });
  } catch (err) {
    console.debug('ServiceWorker initialization skipped:', err);
  }
}
