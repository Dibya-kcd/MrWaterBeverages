import React, { Suspense, lazy, useEffect, useState, useSyncExternalStore } from "react";
import { installTabAutoCenter } from "./utils/tabAutoCenter";
import { installScrollLock } from "./utils/scrollLock";
import { installDialogA11y } from "./utils/dialogA11y";
import { ToastHost } from "./components/common/ToastHost";
import { AppHeader } from "./components/common/AppHeader";
import { AuthScreen } from "./components/common/AuthScreen";
import { MobileNav } from "./components/common/MobileNav";
import { Nav, DesktopSidebar } from "./components/common/Nav";
import { OfflineIndicator } from "./components/common/OfflineIndicator";
import { UpdatePrompt } from "./components/common/UpdatePrompt";
import { useLedger } from "./context/LedgerContext";
import { getSyncStatus, subscribeToSyncStatus, clearSyncStatus, reportSyncSuccess, flushPendingWrites, pendingWriteCount } from "./utils/storage";
import { CloudAlert, WifiOff, RefreshCw, X, ShieldCheck, Download, Info } from "lucide-react";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

// Statically import DashboardView so the default home tab renders instantly without dynamic module fetch failures
import DashboardView from "./components/views/DashboardView";

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default?: T; [key: string]: any }>,
  name?: string
): React.LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (retriesLeft: number, delayMs: number) => {
        factory()
          .then((m) => {
            const comp =
              m.default ||
              (name ? (m as any)[name] : undefined) ||
              Object.values(m).find((v) => typeof v === "function");
            if (!comp) {
              throw new Error(`Module ${name || "view"} has no exported component.`);
            }
            resolve({ default: comp as T });
          })
          .catch((err) => {
            const isImportError =
              err?.name === "TypeError" ||
              /Failed to fetch dynamically imported module/i.test(err?.message || "") ||
              /Loading chunk/i.test(err?.message || "");

            if (retriesLeft <= 0) {
              // If dynamic import failed, auto-reload once to fetch fresh assets if not reloaded recently
              if (typeof window !== "undefined" && isImportError) {
                const lastReload = Number(sessionStorage.getItem("last_chunk_reload") || "0");
                const now = Date.now();
                if (now - lastReload > 15000) {
                  sessionStorage.setItem("last_chunk_reload", String(now));
                  window.location.reload();
                  return;
                }
              }
              reject(err);
              return;
            }
            setTimeout(() => attempt(retriesLeft - 1, delayMs * 1.5), delayMs);
          });
      };
      attempt(4, 600);
    })
  );
}

// Screens load when first opened, so the app starts fast on phones.
const BillingView = lazyWithRetry(() => import("./components/views/BillingView"), "BillingView");
const CustomersView = lazyWithRetry(() => import("./components/views/CustomersView"), "CustomersView");
const InventoryView = lazyWithRetry(() => import("./components/views/InventoryView"), "InventoryView");
const PaymentsView = lazyWithRetry(() => import("./components/views/PaymentsView"), "PaymentsView");
const ProductsView = lazyWithRetry(() => import("./components/views/ProductsView"), "ProductsView");
const PromotionsView = lazyWithRetry(() => import("./components/views/PromotionsView"), "PromotionsView");
const SupplierSchemesView = lazyWithRetry(() => import("./components/views/SupplierSchemesView"), "SupplierSchemesView");
const ReportsView = lazyWithRetry(() => import("./components/views/ReportsView"), "ReportsView");
const SalesmanView = lazyWithRetry(() => import("./components/views/SalesmanView"), "SalesmanView");
const SettingsView = lazyWithRetry(() => import("./components/views/SettingsView"), "SettingsView");
const TripsView = lazyWithRetry(() => import("./components/views/TripsView"), "TripsView");
const CratesDepositsView = lazyWithRetry(() => import("./components/views/CratesDepositsView"), "CratesDepositsView");

const ScreenLoading: React.FC = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
    <div className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-[#0d4a3a] animate-spin" />
  </div>
);

export const App: React.FC = () => {
  const {
    tab,
    palette,
    checkSupabaseConnection,
    pullFromCloud,
    currentUser,
    notice,
    dismissNotice,
  } = useLedger();
  const syncStatus = useSyncExternalStore(subscribeToSyncStatus, getSyncStatus);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  useEffect(() => installTabAutoCenter(), []);
  useEffect(() => installScrollLock(), []);
  useEffect(() => installDialogA11y(), []);

  const handleExportBackup = () => {
    try {
      const backup: Record<string, any> = {
        exportedAt: new Date().toISOString(),
        version: "mrwater-offline-backup-v1",
      };
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            !key.includes("session") &&
            (key.startsWith("mrwater_") ||
              key.includes("cache") ||
              key.includes("ledger"))
          ) {
            try {
              backup[key] = JSON.parse(localStorage.getItem(key) || "");
            } catch {
              backup[key] = localStorage.getItem(key);
            }
          }
        }
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mrwater-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Backup failed", err);
    }
  };

  const handleRetrySync = async () => {
    try {
      await checkSupabaseConnection();
      // Upload what is waiting on this device BEFORE pulling, so nothing is replaced by an older cloud copy.
      await flushPendingWrites();
      await pullFromCloud();
      if (pendingWriteCount() === 0) reportSyncSuccess();
    } catch {
      // Local cache remains safe
    }
  };

  return (
    <div
      id="app-root"
      className="app-shell antialiased"
      style={{
        color: "var(--ink)",
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
          #desktop-sidebar, #mobile-menu-sheet, #mobile-nav, #app-header, #accessibility-bar, #sync-alert-banner, button, .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Conditional Gate: Unauthenticated State */}
      {!currentUser ? (
        <AuthScreen />
      ) : currentUser.role === "salesman" ? (
        /* Dedicated Restricted Salesman View (No Admin Nav/Sidebars) */
        <div className="flex-1 flex flex-col overflow-y-auto">
          <Suspense fallback={<ScreenLoading />}>
            <SalesmanView />
          </Suspense>
        </div>
      ) : (
        /* Crate shell — desktop sidebar + mobile bottom nav */
        <div className="flex flex-col lg:flex-row min-h-dvh min-h-screen w-full max-w-[100vw] overflow-x-hidden">
          <DesktopSidebar />
          <Nav open={menuOpen} onClose={() => setMenuOpen(false)} />
          <div className="app-main flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0 overflow-x-hidden overflow-y-auto">
            <div className="lg:hidden">
              <AppHeader onMenuClick={() => setMenuOpen(true)} />
            </div>
            {syncStatus &&
              (!syncStatus.isOnline || syncStatus.pendingCount > 0 || (syncStatus.hasPersistentFailure && syncStatus.consecutiveFailures > 0)) && (
                <aside
                  id="sync-alert-banner"
                  aria-live="polite"
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold flex items-center justify-between border-b gap-2 sm:gap-3 transition-colors"
                  style={{
                    backgroundColor: !syncStatus.isOnline
                      ? "var(--warning-soft)"
                      : "#FEF2F2",
                    color: !syncStatus.isOnline ? "var(--warning)" : "#991B1B",
                    borderColor: !syncStatus.isOnline ? "#FDE68A" : "#FECACA",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {!syncStatus.isOnline ? (
                      <WifiOff className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                    )}
                    <span className="sm:hidden leading-tight">
                      {syncStatus.pendingCount > 0
                        ? `${syncStatus.pendingCount} item${syncStatus.pendingCount === 1 ? "" : "s"} waiting to upload`
                        : !syncStatus.isOnline ? "Offline — saved on this device" : "Sync paused — data is safe"}
                    </span>
                    <span className="hidden sm:inline truncate">
                      {syncStatus.pendingCount > 0
                        ? `${syncStatus.pendingCount} item${syncStatus.pendingCount === 1 ? "" : "s"} waiting to upload — saved on this device, retrying automatically. Keep the app open until this clears.`
                        : !syncStatus.isOnline
                        ? "Offline Mode — all transactions are saved locally on this device and will sync when reconnected."
                        : `Cloud sync notice (${syncStatus.consecutiveFailures}). Local data is completely safe and stored on this device.`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowSyncModal(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors shadow-xs"
                      title="Inspect sync status and download local backup"
                    >
                      <Info className="w-3 h-3 text-indigo-600" />
                      <span className="hidden sm:inline">Details & Backup</span><span className="sm:hidden">Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRetrySync}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors shadow-xs"
                      title="Retry connecting to cloud"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span className="hidden sm:inline">Retry</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSyncStatus()}
                      className="p-1 rounded-lg hover:bg-black/5 cursor-pointer text-slate-500 transition-colors"
                      title="Dismiss notice"
                      aria-label="Dismiss banner"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </aside>
              )}

            {/* Reassurance & Backup Modal */}
            {showSyncModal && (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
                onClick={() => setShowSyncModal(false)}
              >
                <div
                  className="w-full max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 sm:p-6 text-slate-800 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sticky top-0 z-10 -mt-1 bg-white pb-2 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Local Data is Completely Safe</h3>
                        <p className="text-xs text-slate-500">Offline-First Architecture Guarantee</p>
                      </div>
                    </div>
                    <button aria-label="Close"
                      type="button"
                      onClick={() => setShowSyncModal(false)}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs leading-relaxed text-emerald-950 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Why do you see "Cloud sync notice ({syncStatus?.consecutiveFailures})"?
                    </p>
                    <p className="text-slate-700">
                      MrWater Ledger writes every bill, crate modification, customer balance, and trip <strong>directly to your browser's persistent LocalStorage cache first</strong> before attempting any cloud push.
                    </p>
                    <p className="text-slate-700">
                      The counter <strong>({syncStatus?.consecutiveFailures})</strong> indicates background attempts to sync with the remote cloud database that were paused or timed out. <strong>Zero local records have been lost or overwritten.</strong>
                    </p>
                  </div>

                  {syncStatus?.lastError && (
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 break-words">
                      Last cloud response: {syncStatus.lastError}
                    </div>
                  )}

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleExportBackup}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Download Local Backup (JSON)
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          clearSyncStatus();
                          setShowSyncModal(false);
                        }}
                        className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                      >
                        Dismiss Notice
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleRetrySync();
                          setShowSyncModal(false);
                        }}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Sync
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <main
              id="main-content"
              role="main"
              className="app-content"
              tabIndex={-1}
            >
              <ErrorBoundary fallbackTitle="View Rendering Error">
                <div className="flex-1 w-full max-w-none lg:max-w-[1200px] mx-auto px-2.5 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-5">
                <Suspense fallback={<ScreenLoading />}>
                {tab === "dashboard" && <DashboardView />}
                {tab === "customers" && <CustomersView />}
                {tab === "payments" && <PaymentsView />}
                {tab === "grn" && (
                  <InventoryView initialSubTab="consignments" />
                )}
                {tab === "products" && <ProductsView />}
                {tab === "inventory" && (
                  <InventoryView initialSubTab="realtime" />
                )}
                {tab === "warehouses" && (
                  <SettingsView initialSection="warehouses" />
                )}
                {tab === "promotions" && <PromotionsView />}
                {tab === "supplierSchemes" && <SupplierSchemesView />}
                {tab === "billing" && <BillingView />}
                {tab === "salesman" && <SalesmanView />}
                {tab === "trips" && <TripsView />}
                {tab === "reports" && <ReportsView />}
                {tab === "audit" && <InventoryView initialSubTab="audit" />}
                {tab === "crates" && <CratesDepositsView />}
                {tab === "settings" && <SettingsView />}
                </Suspense>
                </div>
              </ErrorBoundary>
            </main>
            <div className="lg:hidden">
              <MobileNav onOpenMenu={() => setMenuOpen(true)} />
            </div>
          </div>
        </div>
      )}

      {/* PWA / Network Offline Floating Indicator */}
      <OfflineIndicator />
      <UpdatePrompt />

      {/* Compact floating notice — does not push page layout */}
      {notice && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed left-3 right-3 bottom-[4.5rem] sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-sm z-[9999] pointer-events-auto"
        >
          <div className="bg-slate-900/95 text-white border border-amber-400/80 rounded-xl shadow-2xl px-3 py-2.5 text-xs backdrop-blur-sm flex gap-2 items-start">
            <div className="whitespace-pre-line leading-snug flex-1 min-w-0 max-h-28 overflow-y-auto">
              {notice}
            </div>
            <button
              type="button"
              onClick={dismissNotice}
              className="shrink-0 px-2 py-1 rounded-lg bg-amber-400 text-slate-900 font-black text-[10px] uppercase cursor-pointer"
              aria-label="Dismiss"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <ToastHost />
    </div>
  );
};

export default App;
