// Ensure React Fast Refresh preamble variables exist to avoid detection errors
if (typeof window !== 'undefined') {
  (window as any).$RefreshReg$ = (window as any).$RefreshReg$ || (() => {});
  (window as any).$RefreshSig$ = (window as any).$RefreshSig$ || (() => (type: any) => type);
  (window as any).__vite_plugin_react_preamble_installed__ = true;
}

import './utils/migrateLegacyKeys';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LedgerProvider } from './context/LedgerContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';
import './mobile-theme.css';
import './shell.css';
import './auth.css';
import registerServiceWorker from './registerServiceWorker';
import { installAuthFetch } from './lib/authFetch';

try {
  installAuthFetch();
} catch (e) {
  console.warn("installAuthFetch non-fatal initialization error:", e);
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Application Error">
        <LedgerProvider>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </LedgerProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

registerServiceWorker();

// Tapping a tab/chip in any horizontally scrolling strip brings it fully into view,
// so a partly hidden tab never stays cut off at the edge (matters at Large / Extra Large text).
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement | null)?.closest?.(
    '.hh-tabstrip > *, .overflow-x-auto.flex > :where(button, a, [role="tab"])',
  ) as HTMLElement | null;
  el?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
});
