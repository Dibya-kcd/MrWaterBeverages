import { registerSW } from 'virtual:pwa-register';

export default function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('MrWater Ledger is ready for full offline use.');
    },
    onNeedRefresh() {
      console.log('New content available, refreshing...');
    },
  });
}

