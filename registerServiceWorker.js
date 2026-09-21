// Registers /service-worker.js so the app installs as a PWA and keeps
// working (from cache) with a flaky or absent connection.
// Call registerServiceWorker() once from src/index.js — see README.md.
export default function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production") return; // dev server + SW don't mix well
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => console.error("Service worker registration failed:", err));
  });
}
