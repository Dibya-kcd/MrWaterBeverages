import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Key,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { COMPLETE_SQL_SCHEMA_SCRIPT } from '../../lib/supabase';

export const DatabaseSettingsView: React.FC = () => {
  const {
    palette,
    fz,
    scale,
    supabaseConfig,
    supabaseStatus,
    checkSupabaseConnection,
    syncToCloud,
    pullFromCloud,
    saveCustomSupabaseCredentials,
    clearCustomSupabaseCredentials,
    products,
    bills,
    trips,
    deleteLocalDatabase,
  } = useLedger();

  const [copiedSql, setCopiedSql] = useState(false);
  const [syncingPush, setSyncingPush] = useState(false);
  const [syncingPull, setSyncingPull] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Custom credentials form state
  const [customUrl, setCustomUrl] = useState(supabaseConfig.url);
  const [customKey, setCustomKey] = useState(supabaseConfig.anonKey);
  const [savedCredsNotice, setSavedCredsNotice] = useState<string | null>(null);
  const [showSqlPreview, setShowSqlPreview] = useState(false);

  const handleCopySql = () => {
    navigator.clipboard.writeText(COMPLETE_SQL_SCHEMA_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleDownloadSql = () => {
    const blob = new Blob([COMPLETE_SQL_SCHEMA_SCRIPT], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `radhika_supabase_schema_${supabaseConfig.projectRef}.sql`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePush = async () => {
    setSyncingPush(true);
    setSyncFeedback(null);
    try {
      const res = await syncToCloud();
      if (res.success) {
        setSyncFeedback({ type: 'success', message: res.message });
      } else {
        setSyncFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setSyncFeedback({ type: 'error', message: err?.message || 'Sync failed.' });
    } finally {
      setSyncingPush(false);
    }
  };

  const handlePull = async () => {
    if (!window.confirm('Pull data from Supabase? This will update local records with data stored in the cloud.')) {
      return;
    }
    setSyncingPull(true);
    setSyncFeedback(null);
    try {
      const res = await pullFromCloud();
      if (res.success) {
        setSyncFeedback({ type: 'success', message: res.message });
      } else {
        setSyncFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setSyncFeedback({ type: 'error', message: err?.message || 'Pull failed.' });
    } finally {
      setSyncingPull(false);
    }
  };

  const handlePurgeLocalDatabase = () => {
    if (
      !window.confirm(
        'Purge local browser database cache? The app will operate strictly in direct Supabase Cloud mode and fetch all records from PostgreSQL.'
      )
    ) {
      return;
    }
    deleteLocalDatabase();
    setSyncFeedback({
      type: 'success',
      message: 'Local browser database purged. Operating purely in direct Supabase Cloud database mode.',
    });
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim() || !customKey.trim()) {
      alert('Please provide both a valid Supabase Project URL and Anon Key.');
      return;
    }
    await saveCustomSupabaseCredentials(customUrl.trim(), customKey.trim());
    setSavedCredsNotice('Supabase parameters updated and connection tested.');
    setTimeout(() => setSavedCredsNotice(null), 3500);
  };

  const handleResetCredentials = () => {
    clearCustomSupabaseCredentials();
    setCustomUrl('https://psizakmtxppariejawbd.supabase.co');
    setCustomKey('sb_publishable_3D3tfJOS10gkL0lJ6qQT1Q_Lvux1S9W');
    setSavedCredsNotice('Reset parameters to default project credentials.');
    setTimeout(() => setSavedCredsNotice(null), 3500);
  };

  const requiredTables = [
    { name: 'products', desc: 'Beverage catalog, wholesale/retail pricing, pack sizes, and opening stock' },
    { name: 'promotions', desc: 'BOGO trade schemes, seasonal percentage discounts, and flat case margins' },
    { name: 'bills', desc: 'GST tax invoices, retailer details, itemized lines, and payment balances' },
    { name: 'trips', desc: 'Vehicle delivery logs, loaded crates, returned empties/unsold, and assigned bills' },
    { name: 'audits', desc: 'Physical depot stock count verifications and discrepancy adjustments' },
    { name: 'organization_profile', desc: 'Business name, GSTIN, FSSAI, bank details, and invoice terms' },
    { name: 'billing_settings', desc: 'Invoice numbering prefix, default price type, and GST calculations' },
  ];

  const sqlDashboardUrl = `https://supabase.com/dashboard/project/${supabaseConfig.projectRef}/sql/new`;

  return (
    <div id="database-settings-view" className="space-y-6">
      {/* Top Banner: Connection Overview */}
      <div
        className="p-5 border-2 rounded shadow-xs"
        style={{
          borderColor: supabaseStatus.isConnected ? palette.good : palette.line,
          backgroundColor: palette.panel,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="p-3 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: supabaseStatus.isConnected ? `${palette.good}20` : `${palette.amber}20`,
                color: supabaseStatus.isConnected ? palette.good : palette.amber,
              }}
            >
              <Database size={Math.round(28 * scale)} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 style={fz(20, { fontWeight: 700, color: palette.ink })}>
                  Supabase Cloud Database
                </h2>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase"
                  style={{
                    backgroundColor: supabaseStatus.isConnected ? `${palette.good}20` : `${palette.amber}20`,
                    color: supabaseStatus.isConnected ? palette.good : palette.amber,
                    border: `1px solid ${supabaseStatus.isConnected ? palette.good : palette.amber}`,
                  }}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      supabaseStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {supabaseStatus.isConnected ? 'Connected & Live' : 'Connecting'}
                </span>
                {supabaseStatus.latencyMs > 0 && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium"
                    style={{ backgroundColor: palette.cream, color: palette.muted }}
                  >
                    <Activity size={12} />
                    {supabaseStatus.latencyMs} ms
                  </span>
                )}
              </div>
              <p className="mt-1" style={fz(14, { color: palette.muted })}>
                Project Reference:{' '}
                <code className="font-mono font-bold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-emerald-700 dark:text-emerald-300">
                  {supabaseConfig.projectRef}
                </code>{' '}
                · Endpoint:{' '}
                <span className="font-mono text-xs">{supabaseConfig.url}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-retest-supabase"
              type="button"
              onClick={() => checkSupabaseConnection()}
              disabled={supabaseStatus.isChecking}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border-2 font-bold cursor-pointer transition-all focus-ring shadow-xs"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.ink,
                ...fz(13),
              }}
            >
              <RefreshCw
                size={16}
                className={supabaseStatus.isChecking ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              {supabaseStatus.isChecking ? 'Testing...' : 'Test Connection'}
            </button>

            <a
              id="btn-open-supabase-dashboard"
              href={sqlDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border-2 font-bold cursor-pointer transition-all focus-ring text-white shadow-xs"
              style={{
                borderColor: palette.navy,
                backgroundColor: palette.navy,
                ...fz(13),
              }}
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open Supabase SQL
            </a>
          </div>
        </div>

        {/* Status Message */}
        <div
          className="mt-4 p-3 rounded border text-sm font-medium flex items-center gap-2"
          style={{
            borderColor: supabaseStatus.isConnected ? `${palette.good}50` : `${palette.amber}50`,
            backgroundColor: supabaseStatus.isConnected ? `${palette.good}08` : `${palette.amber}08`,
            color: supabaseStatus.isConnected ? palette.good : palette.amber,
          }}
        >
          {supabaseStatus.isConnected ? (
            <CheckCircle2 size={18} className="shrink-0" />
          ) : (
            <AlertCircle size={18} className="shrink-0" />
          )}
          <span>{supabaseStatus.message}</span>
        </div>
      </div>

      {/* Sync Action Feedback */}
      {syncFeedback && (
        <div
          role="status"
          className="p-3.5 border-2 flex items-center gap-2.5 font-bold rounded"
          style={{
            borderColor: syncFeedback.type === 'success' ? palette.good : palette.bad,
            backgroundColor: syncFeedback.type === 'success' ? `${palette.good}15` : `${palette.bad}15`,
            color: syncFeedback.type === 'success' ? palette.good : palette.bad,
            ...fz(14),
          }}
        >
          {syncFeedback.type === 'success' ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <AlertCircle size={18} aria-hidden="true" />
          )}
          {syncFeedback.message}
        </div>
      )}

      {/* Cloud Synchronization Section */}
      <div
        className="p-5 border-2 rounded shadow-xs"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Zap size={20} style={{ color: palette.amber }} aria-hidden="true" />
          <h3 style={fz(18, { fontWeight: 700, color: palette.ink })}>
            Cloud Data Synchronization
          </h3>
        </div>
        <p className="mb-4" style={fz(14, { color: palette.muted })}>
          Push your local records (catalog, invoices, trips, audits, organization profile) into Supabase PostgreSQL, or pull the latest database state onto this device.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            className="p-4 border rounded flex flex-col justify-between"
            style={{ borderColor: palette.line, backgroundColor: palette.cream }}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpCircle size={20} className="text-emerald-600" />
                <span className="font-bold" style={fz(15, { color: palette.ink })}>
                  Push Local Ledger to Supabase
                </span>
              </div>
              <p className="text-xs" style={{ color: palette.muted }}>
                Uploads {products.length} products, {bills.length} bills, {trips.length} delivery trips, and business settings into PostgreSQL tables.
              </p>
            </div>
            <button
              id="btn-push-to-supabase"
              type="button"
              onClick={handlePush}
              disabled={syncingPush || !supabaseStatus.isConnected}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded font-bold cursor-pointer text-white focus-ring transition-all disabled:opacity-50"
              style={{
                backgroundColor: palette.good,
                ...fz(14),
              }}
            >
              <RefreshCw size={16} className={syncingPush ? 'animate-spin' : ''} />
              {syncingPush ? 'Pushing Data...' : 'Push to Cloud'}
            </button>
          </div>

          <div
            className="p-4 border rounded flex flex-col justify-between"
            style={{ borderColor: palette.line, backgroundColor: palette.cream }}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownCircle size={20} className="text-blue-600" />
                <span className="font-bold" style={fz(15, { color: palette.ink })}>
                  Pull Remote Ledger from Supabase
                </span>
              </div>
              <p className="text-xs" style={{ color: palette.muted }}>
                Retrieves the latest dataset directly from Supabase tables to update this browser's active state.
              </p>
            </div>
            <button
              id="btn-pull-from-supabase"
              type="button"
              onClick={handlePull}
              disabled={syncingPull || !supabaseStatus.isConnected}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded font-bold cursor-pointer text-white focus-ring transition-all disabled:opacity-50"
              style={{
                backgroundColor: palette.navy,
                ...fz(14),
              }}
            >
              <RefreshCw size={16} className={syncingPull ? 'animate-spin' : ''} />
              {syncingPull ? 'Pulling Data...' : 'Pull from Cloud'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ borderColor: palette.line }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: palette.ink }}>
            <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Direct Cloud Database Mode Active:</strong> Local browser database storage has been disabled. All inward invoices (GRNs), products, inventory batches, and transactions are saved directly to Supabase PostgreSQL.
            </span>
          </div>
          <button
            type="button"
            id="btn-purge-local-db"
            onClick={handlePurgeLocalDatabase}
            className="px-3 py-1.5 border border-red-300 hover:bg-red-50 text-red-700 font-semibold rounded text-xs shrink-0 cursor-pointer transition-colors"
          >
            Purge Local Browser Cache
          </button>
        </div>
      </div>

      {/* SQL Setup Script & Database Schema Box */}
      <div
        className="p-5 border-2 rounded shadow-xs"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Terminal size={22} style={{ color: palette.amber }} aria-hidden="true" />
            <div>
              <h3 style={fz(18, { fontWeight: 700, color: palette.ink })}>
                PostgreSQL Schema & Tables Setup
              </h3>
              <p style={fz(13, { color: palette.muted })}>
                Execute this SQL schema script once in your Supabase SQL Editor to initialize all tables, constraints, and Row Level Security policies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-copy-sql-schema"
              type="button"
              onClick={handleCopySql}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border-2 font-bold cursor-pointer transition-all focus-ring shadow-xs"
              style={{
                borderColor: copiedSql ? palette.good : palette.line,
                backgroundColor: copiedSql ? `${palette.good}20` : palette.panel,
                color: copiedSql ? palette.good : palette.ink,
                ...fz(13),
              }}
            >
              {copiedSql ? <Check size={16} /> : <Copy size={16} />}
              {copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Script'}
            </button>

            <button
              id="btn-download-sql-file"
              type="button"
              onClick={handleDownloadSql}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border-2 font-bold cursor-pointer transition-all focus-ring shadow-xs"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.ink,
                ...fz(13),
              }}
            >
              Download .sql
            </button>
          </div>
        </div>

        {/* 3 Step Guide */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 border rounded text-xs" style={{ borderColor: palette.line, backgroundColor: palette.cream }}>
            <span className="font-bold text-amber-600 block mb-1">Step 1: Copy Script</span>
            Click <strong>Copy SQL Script</strong> above. It contains all 7 tables and beverage initial data.
          </div>
          <div className="p-3 border rounded text-xs" style={{ borderColor: palette.line, backgroundColor: palette.cream }}>
            <span className="font-bold text-amber-600 block mb-1">Step 2: Open SQL Editor</span>
            Click <a href={sqlDashboardUrl} target="_blank" rel="noopener noreferrer" className="underline font-bold text-blue-600">Open Supabase SQL</a> to open the query tab.
          </div>
          <div className="p-3 border rounded text-xs" style={{ borderColor: palette.line, backgroundColor: palette.cream }}>
            <span className="font-bold text-amber-600 block mb-1">Step 3: Click Run</span>
            Paste the script into the editor and hit <strong>Run</strong>. Return here and click Test Connection.
          </div>
        </div>

        {/* Required Tables Checklist */}
        <div className="border rounded overflow-hidden" style={{ borderColor: palette.line }}>
          <div
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between"
            style={{ backgroundColor: palette.cream, color: palette.muted }}
          >
            <span>Table Name & Purpose</span>
            <span>Schema Status</span>
          </div>
          <div className="divide-y" style={{ borderColor: palette.line }}>
            {requiredTables.map((tbl) => (
              <div key={tbl.name} className="px-4 py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono font-bold text-sm" style={{ color: palette.ink }}>
                    public.{tbl.name}
                  </div>
                  <div className="text-xs" style={{ color: palette.muted }}>
                    {tbl.desc}
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono"
                  style={{
                    backgroundColor: supabaseStatus.isConnected ? `${palette.good}15` : `${palette.amber}15`,
                    color: supabaseStatus.isConnected ? palette.good : palette.amber,
                  }}
                >
                  <Check size={14} />
                  Ready
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Toggleable SQL Code Preview */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowSqlPreview((v) => !v)}
            className="text-xs font-bold underline cursor-pointer"
            style={{ color: palette.muted }}
          >
            {showSqlPreview ? 'Hide SQL Code Preview' : 'Show SQL Code Preview'}
          </button>
          {showSqlPreview && (
            <pre
              className="mt-2 p-3 rounded font-mono text-xs overflow-x-auto max-h-64 border"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.cream,
                color: palette.ink,
              }}
            >
              {COMPLETE_SQL_SCHEMA_SCRIPT}
            </pre>
          )}
        </div>
      </div>

      {/* Authentication Roadmap / Future Auth Parameter Prep */}
      <div
        className="p-5 border-2 rounded shadow-xs"
        style={{
          borderColor: palette.line,
          backgroundColor: palette.panel,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${palette.navy}15`, color: palette.navy }}
          >
            <Lock size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 style={fz(17, { fontWeight: 700, color: palette.ink })}>
                Stage 2 Authentication Preparation
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                Queued for Later
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: palette.muted }}>
              Per your directive, user authentication will be added in stage 2. The database is currently set up with permissive pre-auth Row Level Security (RLS) policies allowing all operations without requiring login tokens.
            </p>
            <div className="mt-3 p-3 rounded border text-xs leading-relaxed" style={{ borderColor: palette.line, backgroundColor: palette.cream }}>
              <strong>When authentication is added:</strong> We will configure email/password or phone OTP logins, assign user roles (Depot Owner, Sales Representative, Delivery Driver), and restrict row modifications so each user only manages their designated territory or bills.
            </div>
          </div>
        </div>
      </div>

      {/* Advanced / Custom Credentials Configuration */}
      <div
        className="p-5 border-2 rounded shadow-xs"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Key size={20} style={{ color: palette.amber }} aria-hidden="true" />
          <h3 style={fz(17, { fontWeight: 700, color: palette.ink })}>
            Custom Connection Parameters
          </h3>
        </div>
        <p className="mb-4 text-xs" style={{ color: palette.muted }}>
          The application is pre-configured with your Supabase endpoint. If you ever switch projects or rotate keys, you can update credentials below.
        </p>

        {savedCredsNotice && (
          <div
            role="status"
            className="mb-4 p-3 rounded border text-sm font-bold flex items-center gap-2"
            style={{
              borderColor: palette.good,
              backgroundColor: `${palette.good}15`,
              color: palette.good,
            }}
          >
            <Check size={16} />
            {savedCredsNotice}
          </div>
        )}

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: palette.ink }}>
              Supabase Project URL
            </label>
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              required
              className="w-full px-3 py-2 border rounded font-mono text-sm focus-ring"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.ink,
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: palette.ink }}>
              Supabase Publishable / Anon Key
            </label>
            <input
              type="text"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder="sb_publishable_..."
              required
              className="w-full px-3 py-2 border rounded font-mono text-xs focus-ring"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.ink,
              }}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded font-bold cursor-pointer text-white focus-ring transition-all"
              style={{
                backgroundColor: palette.navy,
                ...fz(13),
              }}
            >
              Save Parameters
            </button>

            <button
              type="button"
              onClick={handleResetCredentials}
              className="px-3 py-2 rounded border font-bold cursor-pointer focus-ring transition-all"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.muted,
                ...fz(13),
              }}
            >
              Reset to Provided Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
