# Radhika Distribution Ledger — Production PWA & Android Ready

A high-performance, accessible wholesale beverage distribution ledger and field salesman billing application with full offline-first capabilities, Supabase cloud sync, and vehicle trip reconciliation.

---

## 🚀 Quick Start for Git & Production Deployment

Clone this repository and launch the app in two simple steps:

```bash
# 1. Install dependencies
npm install

# 2. Build for production (Vite + Node Server)
npm run build

# 3. Start the production server
npm start
```

For local development with live hot-reloading:
```bash
npm run dev
```

---

## 📱 Progressive Web App (PWA) Features

The application is built with `@vite-plugin-pwa` and configured for full offline durability:

- **Web App Manifest (`public/manifest.json` & `/dist/manifest.webmanifest`)**:
  - `theme_color`: `#16324F` (Depot Navy)
  - `background_color`: `#FBF8F2` (Warm Canvas)
  - `display`: `standalone` (Full-screen native experience without browser address bar)
  - `orientation`: `portrait-primary`
  - High-resolution standard icons (`192x192`, `512x512`) and adaptive `maskable` icon for Android launchers.
- **Service Worker & Workbox Pre-Caching**:
  - Automatically caches core application bundles, stylesheets, fonts, and icons for offline operation.
  - Runtime cache strategy (`CacheFirst`) for web fonts.
  - Automatic updates (`registerType: 'autoUpdate'`) so field devices receive changes seamlessly.
- **In-App Install Prompt**:
  - **Android / Chrome / Edge / Desktop**: Native 1-tap install button in the top bar and user session modal.
  - **iOS (iPhone & iPad)**: Guided 3-step modal explaining "Share → Add to Home Screen".
- **Offline Indicator**:
  - Real-time network monitor providing unobtrusive feedback when disconnected and confirming synchronization upon reconnecting.

---

## 🤖 Turning into an Android APK / Google Play App

Because the app adheres strictly to PWA standards and manifest specifications, you can package it into a native Android application using either of the following standard tools:

### Option A: PWABuilder (Fastest, No Android Studio Required)
1. Deploy this web app to your domain with HTTPS (or Cloud Run / Vercel / Netlify).
2. Visit [pwabuilder.com](https://www.pwabuilder.com/).
3. Enter your live URL. PWABuilder reads `manifest.json` and verifies service worker compliance.
4. Click **Package for Android** to generate a signed APK or Google Play Store AAB bundle.

### Option B: Google Bubblewrap CLI (Official Trusted Web Activity - TWA)
```bash
# Install Bubblewrap globally
npm install -g @bubblewrap/cli

# Initialize Android project from your live PWA URL
bubblewrap init --manifest https://YOUR-DOMAIN.com/manifest.json

# Build the Android APK / App Bundle
bubblewrap build
```

---

## 📦 Project Structure

- `server.ts` — Production Express server serving API endpoints and static Vite assets on port 3000.
- `src/`
  - `components/views/SalesmanView.tsx` — Field billing, vehicle stock runs, bill history, customer payment lookup.
  - `components/common/AccessibilityBar.tsx` — Top bar with contrast toggles, font scaling, user profile, and PWA install button.
  - `components/common/PWAInstallButton.tsx` — Smart cross-platform install button (Android/iOS).
  - `components/common/OfflineIndicator.tsx` — Visual network status indicator.
  - `context/LedgerContext.tsx` — Central application state with local persistence and Supabase sync.
- `public/` — Vector icons, PWA PNG icons (`pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`), `apple-touch-icon.png`, and `manifest.json`.

