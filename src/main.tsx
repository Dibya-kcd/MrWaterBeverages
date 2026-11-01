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
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';
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
          <App />
        </LedgerProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

registerServiceWorker();
