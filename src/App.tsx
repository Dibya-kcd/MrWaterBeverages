import React, { useSyncExternalStore } from 'react';
import { AccessibilityBar } from './components/common/AccessibilityBar';
import { AuthScreen } from './components/common/AuthScreen';
import { MobileNav } from './components/common/MobileNav';
import { Nav } from './components/common/Nav';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { BillingView } from './components/views/BillingView';
import { DashboardView } from './components/views/DashboardView';
import { InventoryView } from './components/views/InventoryView';
import { ProductsView } from './components/views/ProductsView';
import { PromotionsView } from './components/views/PromotionsView';
import { ReportsView } from './components/views/ReportsView';
import { SalesmanView } from './components/views/SalesmanView';
import { SettingsView } from './components/views/SettingsView';
import { TripsView } from './components/views/TripsView';
import { useLedger } from './context/LedgerContext';
import { getSyncStatus, subscribeToSyncStatus } from './utils/storage';
import { CloudAlert, WifiOff, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const { tab, palette, highContrast, checkSupabaseConnection, pullFromCloud, currentUser } = useLedger();
  const syncStatus = useSyncExternalStore(subscribeToSyncStatus, getSyncStatus);

  const handleRetrySync = async () => {
    await checkSupabaseConnection();
    await pullFromCloud();
  };

  return (
    <div
      id="app-root"
      className="min-h-screen flex flex-col antialiased"
      style={{
        backgroundColor: palette.cream,
        color: palette.ink,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <style>{`
        :focus-visible, .focus-ring:focus-visible {
          outline: 3px solid ${palette.focus} !important;
          outline-offset: 2px !important;
        }
        input, select, button {
          font-family: inherit;
        }
        @media print {
          #desktop-nav, #mobile-nav, #accessibility-bar, #sync-alert-banner, button, .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Accessibility Header */}
      <AccessibilityBar />

      {/* Sync Warning Banner if persistent failure or offline */}
      {syncStatus && (!syncStatus.isOnline || syncStatus.hasPersistentFailure) && (
        <aside
          id="sync-alert-banner"
          aria-live="polite"
          className="px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-inner border-b transition-colors"
          style={{
            backgroundColor: !syncStatus.isOnline ? '#FFFBEB' : '#FEF2F2',
            color: !syncStatus.isOnline ? '#B45309' : '#991B1B',
            borderColor: !syncStatus.isOnline ? '#FDE68A' : '#FECACA',
          }}
        >
          <div className="flex items-center gap-2">
            {!syncStatus.isOnline ? (
              <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
            ) : (
              <CloudAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>
              {!syncStatus.isOnline
                ? 'Offline Mode — You are currently disconnected. All transactions are preserved locally and will sync once online.'
                : `Cloud Persistence Warning: ${syncStatus.consecutiveFailures} cloud sync attempt${syncStatus.consecutiveFailures === 1 ? '' : 's'} failed. Local cache is safe.${syncStatus.lastError ? ` Last error: ${syncStatus.lastError}` : ' Verify your Supabase connection.'}`}
            </span>
          </div>
          <button
            onClick={handleRetrySync}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white shadow-xs border text-xs font-medium cursor-pointer hover:bg-neutral-50 transition-colors"
            style={{ borderColor: 'currentColor' }}
          >
            <RefreshCw className="w-3 h-3" />
            Retry Sync
          </button>
        </aside>
      )}

      {/* Conditional Gate: Unauthenticated State */}
      {!currentUser ? (
        <div className="flex-1 flex flex-col justify-center items-center py-6 px-4">
          <AuthScreen />
        </div>
      ) : currentUser.role === 'salesman' ? (
        /* Dedicated Restricted Salesman View (No Admin Nav/Sidebars) */
        <div className="flex-1 flex flex-col overflow-y-auto">
          <SalesmanView />
        </div>
      ) : (
        /* Admin View (Full Sidebar & Multi-Module Workspace) */
        <>
          <div className="flex-1 flex flex-row">
            {/* Desktop Sidebar Navigation */}
            <Nav />

            {/* Main Content Area */}
            <main
              id="main-content"
              role="main"
              className="flex-1 overflow-y-auto pb-20 md:pb-8"
              tabIndex={-1}
            >
              {tab === 'dashboard' && <DashboardView />}
              {tab === 'grn' && <InventoryView initialSubTab="consignments" />}
              {tab === 'products' && <ProductsView />}
              {tab === 'inventory' && <InventoryView initialSubTab="realtime" />}
              {tab === 'warehouses' && <SettingsView initialSection="warehouses" />}
              {tab === 'promotions' && <PromotionsView />}
              {tab === 'billing' && <BillingView />}
              {tab === 'salesman' && <SalesmanView />}
              {tab === 'trips' && <TripsView />}
              {tab === 'reports' && <ReportsView />}
              {tab === 'audit' && <InventoryView initialSubTab="audit" />}
              {tab === 'settings' && <SettingsView />}
            </main>
          </div>

          {/* Mobile Bottom Navigation */}
          <MobileNav />
        </>
      )}

      {/* PWA / Network Offline Floating Indicator */}
      <OfflineIndicator />
    </div>
  );
};

export default App;
