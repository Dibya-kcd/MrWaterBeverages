import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LedgerProvider } from './context/LedgerContext';
import './index.css';
import registerServiceWorker from './registerServiceWorker';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <LedgerProvider>
        <App />
      </LedgerProvider>
    </React.StrictMode>
  );
}

registerServiceWorker();
