// Registers /service-worker.js so the app installs as a PWA and keeps
// working (from cache) with a flaky or absent connection.
// Call registerServiceWorker() once from src/index.js — see README.md.
export default function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production") return; // dev server + SW don't mix well
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const swUrl = new URL('service-worker.js', import.meta.env.BASE_URL).href;
    navigator.serviceWorker
      .register(swUrl)
      .catch((err) => console.error("Service worker registration failed:", err));
  });
}
