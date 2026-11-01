// Retired. The app now uses the generated sw.js (vite-plugin-pwa). Devices still running this old
// cache-first worker pick up this file, clear its caches and unregister it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mrwater-ledger')).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});
