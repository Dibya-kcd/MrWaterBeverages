import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Truck,
  RotateCcw,
  Delete,
  Package,
  Receipt,
  Tag,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { speakAssistiveText } from '../../utils/speechRecognition';

type ViewMode = 'landing' | 'signin';

// The guided demo is loaded only when someone opens it. It uses sample data only and never touches the app's data.
const SalesmanDemo = lazy(() => import('./SalesmanDemo'));
const OwnerDemo = lazy(() => import('./OwnerDemo'));

export const AuthScreen: React.FC = () => {
  const {
    loginAdmin,
    loginSalesman,
    salesmen,
    orgProfile,
  } = useLedger();

  const [view, setView] = useState<ViewMode>('landing');
  const [showDemo, setShowDemo] = useState(false);
  const [showOwnerDemo, setShowOwnerDemo] = useState(false);
  const [authMode, setAuthMode] = useState<'salesman' | 'admin'>('admin');

  // Salesman PIN Form State
  const [salesmanPhone, setSalesmanPhone] = useState('');
  const [salesmanPin, setSalesmanPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [voiceAssist, setVoiceAssist] = useState(false);
  const [salesmanLoading, setSalesmanLoading] = useState(false);
  const [salesmanError, setSalesmanError] = useState<string | null>(null);

  // Admin Form State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (voiceAssist && view === 'signin') {
      if (authMode === 'salesman') {
        speakAssistiveText('Salesman login screen. Enter phone number and 4 digit PIN.');
      } else {
        speakAssistiveText('Administrator login screen. Enter admin email and password.');
      }
    }
  }, [authMode, voiceAssist, view]);

  const handleKeypadPress = (digit: string) => {
    if (salesmanPin.length >= 6) return;
    const next = salesmanPin + digit;
    setSalesmanPin(next);
    setSalesmanError(null);
    if (voiceAssist) speakAssistiveText(digit);
  };

  const handleKeypadBackspace = () => {
    if (salesmanPin.length === 0) return;
    const next = salesmanPin.slice(0, -1);
    setSalesmanPin(next);
    setSalesmanError(null);
    if (voiceAssist) speakAssistiveText('Delete');
  };

  const handleKeypadClear = () => {
    setSalesmanPin('');
    setSalesmanError(null);
    if (voiceAssist) speakAssistiveText('PIN cleared');
  };

  const handleSalesmanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSalesmanError(null);

    const raw = salesmanPhone.trim();
    const digits = raw.replace(/\D/g, '');
    const phone = digits.length > 10 && digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10) || raw;
    const pin = salesmanPin.trim();

    if (!phone) {
      setSalesmanError('Please enter or select your registered mobile number.');
      if (voiceAssist) speakAssistiveText('Please enter your mobile number.');
      return;
    }

    if (pin.length < 4) {
      setSalesmanError('Please enter your 4 to 6 digit security PIN.');
      if (voiceAssist) speakAssistiveText('Please enter your 4 to 6 digit PIN.');
      return;
    }

    setSalesmanLoading(true);
    try {
      const res = await loginSalesman(phone, pin);
      if (!res.success) {
        setSalesmanError(res.error || 'Authentication failed. Please check your credentials.');
        if (voiceAssist) speakAssistiveText(res.error || 'Invalid PIN. Please try again.');
      } else {
        if (voiceAssist) speakAssistiveText('Login successful. Welcome to Sales Route.');
      }
    } catch (err: any) {
      setSalesmanError(err?.message || 'Verification error. Check internet connection.');
      if (voiceAssist) speakAssistiveText('Connection error. Please try again.');
    } finally {
      setSalesmanLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);

    if (!adminEmail.trim() || !adminPassword.trim()) {
      setAdminError('Please enter both administrator email and password.');
      return;
    }

    setAdminLoading(true);
    try {
      const res = await loginAdmin(adminEmail, adminPassword);
      if (!res.success) {
        setAdminError(res.error || 'Invalid administrator credentials.');
      }
    } catch (err: any) {
      setAdminError(err?.message || 'Login error occurred.');
    } finally {
      setAdminLoading(false);
    }
  };

  // One-click demo login exists only in builds that explicitly enable it (never in production).
  const DEMO_LOGIN_ENABLED = (import.meta as any).env?.VITE_ENABLE_DEMO_LOGIN === 'true';
  const handleQuickDemoAdmin = () => {
    setAdminEmail('admin@mrwater.internal');
    setAdminPassword('admin1234');
    setAuthMode('admin');
    setAdminError(null);
  };

  const handleSelectSalesman = (phone: string) => {
    const raw = String(phone || '').trim();
    const digits = raw.replace(/\D/g, '');
    const clean = digits.length > 10 && digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10) || raw;
    setSalesmanPhone(clean);
    setSalesmanPin('');
    setSalesmanError(null);
    if (voiceAssist) {
      const target = salesmen.find((s) => s.phone.replace(/\D/g, '').slice(-10) === clean);
      speakAssistiveText(`Selected salesman ${target?.name || clean}`);
    }
  };

  const demoOverlay = showDemo ? (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[100] flex items-center justify-center text-sm text-white/80" style={{ background: '#0F1F1A' }}>
          Opening the demo…
        </div>
      }
    >
      <SalesmanDemo onClose={() => setShowDemo(false)} />
    </Suspense>
  ) : showOwnerDemo ? (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[100] flex items-center justify-center text-sm text-white/80" style={{ background: '#0F1F1A' }}>
          Opening the demo…
        </div>
      }
    >
      <OwnerDemo onClose={() => setShowOwnerDemo(false)} />
    </Suspense>
  ) : null;

  // ─── LANDING (marketing) ───────────────────────────────────────────────
  if (view === 'landing') {
    return (
      <div
        id="auth-landing"
        className="min-h-screen w-full flex flex-col relative overflow-hidden"
        style={{
          background: 'linear-gradient(165deg, #0a3d32 0%, #0d4f3c 40%, #0f5c45 100%)',
        }}
      >
        {demoOverlay}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px),
                              radial-gradient(circle at 80% 70%, #fff 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-10 sm:py-14">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8 sm:mb-10">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-xl shadow-lg"
              style={{ backgroundColor: '#F59E0B' }}
            >
              C
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">Crate</span>
          </div>

          {/* Headline */}
          <h1
            className="text-center font-black leading-[1.15] tracking-tight text-white mb-4"
            style={{ fontSize: 'clamp(2rem, 6vw, 3.25rem)', maxWidth: '18ch' }}
          >
            Every crate,
            <br />
            every rupee,{' '}
            <span style={{ color: '#F59E0B' }}>accounted.</span>
          </h1>

          <p className="text-center text-white/80 text-sm sm:text-base max-w-md mb-10 leading-relaxed">
            The distribution app for beverage wholesalers — from
            supplier invoice to the last shop on the beat.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mb-12">
            {[
              {
                icon: <Receipt size={20} />,
                title: 'GST & non-GST billing',
                desc: 'Tax invoice, bill of supply, CGST/SGST/IGST auto.',
              },
              {
                icon: <Package size={20} />,
                title: 'Batch & expiry stock',
                desc: 'FEFO picking and expiry alerts.',
              },
              {
                icon: <Tag size={20} />,
                title: 'Promotions & BOGO',
                desc: 'Group offers applied at billing.',
              },
              {
                icon: <Truck size={20} />,
                title: 'Trips',
                desc: 'Load, sell on route, settle at day end.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-4 border border-white/10 backdrop-blur-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm mb-0.5">{f.title}</div>
                    <div className="text-white/60 text-xs leading-snug">{f.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            type="button"
            id="btn-goto-signin"
            onClick={() => setView('signin')}
            className="w-full max-w-xs py-3.5 rounded-2xl font-bold text-base text-white shadow-xl transition-all active:scale-[0.98] hover:brightness-110 cursor-pointer"
            style={{ backgroundColor: '#0B3D32', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            Sign in
          </button>

          <button
            type="button"
            id="btn-open-salesman-demo"
            onClick={() => setShowDemo(true)}
            className="mt-3 w-full max-w-xs py-3 rounded-2xl font-semibold text-sm text-white/90 transition-all active:scale-[0.98] hover:bg-white/10 cursor-pointer"
            style={{ border: '1px solid rgba(255,255,255,0.25)' }}
          >
            New here? See how the salesman app works
          </button>

          <button
            type="button"
            id="btn-open-owner-demo"
            onClick={() => setShowOwnerDemo(true)}
            className="mt-3 w-full max-w-xs py-3 rounded-2xl font-semibold text-sm text-white/90 transition-all active:scale-[0.98] hover:bg-white/10 cursor-pointer"
            style={{ border: '1px solid rgba(255,255,255,0.25)' }}
          >
            Owner? See how the whole app works
          </button>

          <p className="mt-5 text-white/50 text-xs">
            {orgProfile?.name || 'Crate'} · Route sales & cloud invoicing
          </p>
        </div>
      </div>
    );
  }

  // ─── SIGN-IN FORM ─────────────────────────────────────────────────────
  return (
    <div
      id="auth-screen"
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-8 select-none"
      style={{ backgroundColor: '#F7F5F0' }}
    >
      {demoOverlay}
      <div className="w-full max-w-[400px] mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-lg shadow-sm"
            style={{ backgroundColor: '#F59E0B' }}
          >
            C
          </div>
          <span className="text-xl font-bold tracking-tight" style={{ color: '#1a2e1f' }}>
            Crate
          </span>
        </div>

        {/* Header */}
        <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight mb-1.5" style={{ color: '#1a2e1f' }}>
          Welcome back
        </h1>
        <p className="text-sm text-slate-500 mb-7 leading-relaxed">
          The first account becomes the owner. Staff sign up, then the owner gives them a role.
        </p>

        {/* Role switcher */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            id="tab-admin-login"
            onClick={() => {
              setAuthMode('admin');
              setAdminError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer border ${
              authMode === 'admin'
                ? 'bg-[#0B3D32] text-white border-[#0B3D32] shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <ShieldCheck size={16} />
            Owner / Admin
          </button>
          <button
            type="button"
            id="tab-salesman-login"
            onClick={() => {
              setAuthMode('salesman');
              setSalesmanError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer border ${
              authMode === 'salesman'
                ? 'bg-[#0B3D32] text-white border-[#0B3D32] shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <UserCheck size={16} />
            Staff / Salesman
          </button>
        </div>

        {authMode === 'admin' ? (
          <form id="admin-login-form" onSubmit={handleAdminSubmit} className="space-y-4">
            <button
              type="button"
              id="btn-open-owner-demo-signin"
              onClick={() => setShowOwnerDemo(true)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border cursor-pointer transition-colors hover:bg-amber-50"
              style={{ borderColor: '#F59E0B', color: '#92400E', backgroundColor: '#FFFBEB' }}
            >
              New here? See how the whole app works
            </button>
            <div>
              <label
                htmlFor="input-admin-email"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5"
              >
                Email
              </label>
              <input
                type="email"
                id="input-admin-email"
                required
                autoComplete="username"
                placeholder="you@company.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D32]/30 focus:border-[#0B3D32] transition-shadow"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="input-admin-password"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowAdminPass(!showAdminPass)}
                  className="text-xs font-medium text-slate-500 hover:text-[#0B3D32] flex items-center gap-1 cursor-pointer"
                >
                  {showAdminPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showAdminPass ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showAdminPass ? 'text' : 'password'}
                id="input-admin-password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D32]/30 focus:border-[#0B3D32] transition-shadow"
              />
            </div>

            {adminError && (
              <div
                id="admin-error-alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2"
                role="alert"
              >
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{adminError}</span>
              </div>
            )}

            <button
              type="submit"
              id="btn-admin-login-submit"
              disabled={adminLoading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 shadow-sm"
              style={{ backgroundColor: '#0B3D32' }}
            >
              {adminLoading ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              id="btn-continue-google"
              onClick={() => {
                setAdminError('Google sign-in is not configured in this build. Use email & password or demo login.');
              }}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Continue with Google
            </button>

            {DEMO_LOGIN_ENABLED && (
            <button
              type="button"
              id="btn-explore-demo"
              onClick={handleQuickDemoAdmin}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
              style={{
                backgroundColor: '#E8F5E9',
                color: '#1B5E20',
              }}
            >
              Explore with demo login
            </button>
            )}

            <p className="text-center text-sm text-slate-500 pt-1">
              New here?{' '}
              <button
                type="button"
                className="font-semibold text-[#0B3D32] hover:underline cursor-pointer"
                onClick={() => {
                  setAdminError(
                    'Accounts are provisioned by the owner. Use demo login or contact your admin.'
                  );
                }}
              >
                Create an account
              </button>
            </p>
          </form>
        ) : (
          <div id="salesman-login-card" className="space-y-4">
            <p className="text-xs text-slate-500 -mt-1 mb-1">
              Field staff sign in with registered mobile &amp; 4–6 digit PIN.
            </p>

            <button
              type="button"
              id="btn-open-salesman-demo-signin"
              onClick={() => setShowDemo(true)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border cursor-pointer transition-colors hover:bg-amber-50"
              style={{ borderColor: '#F59E0B', color: '#92400E', backgroundColor: '#FFFBEB' }}
            >
              New here? See how the app works
            </button>

            {salesmen.length > 0 && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Quick select
                </label>
                <div className="flex flex-wrap gap-2">
                  {salesmen.map((sm) => {
                    const isSelected = salesmanPhone === sm.phone;
                    return (
                      <button
                        key={sm.phone}
                        type="button"
                        onClick={() => handleSelectSalesman(sm.phone)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#0B3D32] text-white border-[#0B3D32]'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {sm.name || sm.phone}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="input-salesman-phone"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5"
              >
                Mobile number
              </label>
              <input
                type="tel"
                id="input-salesman-phone"
                inputMode="numeric"
                placeholder="10-digit mobile (e.g. 9606987658)"
                value={salesmanPhone}
                onChange={(e) => {
                  const raw = e.target.value;
                  const digits = raw.replace(/\D/g, '');
                  let normalized = digits;
                  if (digits.length > 10 && digits.startsWith('91')) {
                    normalized = digits.slice(2, 12);
                  } else if (digits.length > 10 && digits.startsWith('0')) {
                    normalized = digits.slice(1, 11);
                  } else if (digits.length > 10) {
                    normalized = digits.slice(-10);
                  }
                  setSalesmanPhone(normalized);
                  setSalesmanError(null);
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D32]/30 focus:border-[#0B3D32]"
              />
              {(() => {
                const targetClean = salesmanPhone.replace(/\D/g, '').slice(-10);
                if (!targetClean) return null;
                const sm = salesmen.find((s) => s.phone.replace(/\D/g, '').slice(-10) === targetClean);
                if (sm && sm.hasPin === false) {
                  return (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold">{sm.name}</span> does not have a PIN configured yet.
                        <span className="block text-[11px] text-amber-700 mt-0.5">Please ask the Administrator to set a 4-digit PIN in Staff Settings.</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Security PIN
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-xs font-medium text-slate-500 hover:text-[#0B3D32] flex items-center gap-1 cursor-pointer"
                >
                  {showPin ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showPin ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                  value={salesmanPin}
                  onChange={(e) => {
                    setSalesmanPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setSalesmanError(null);
                  }}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium tracking-widest text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D32]/30 focus:border-[#0B3D32]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleKeypadPress(d)}
                  className="h-14 rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-800 hover:bg-slate-50 active:bg-[#0B3D32] active:text-white transition-colors cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={handleKeypadClear}
                className="h-14 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors flex flex-col items-center justify-center cursor-pointer"
              >
                <RotateCcw size={16} />
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="h-14 rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-800 hover:bg-slate-50 active:bg-[#0B3D32] active:text-white transition-colors cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="h-14 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-amber-50 hover:text-amber-800 transition-colors flex flex-col items-center justify-center cursor-pointer"
              >
                <Delete size={18} />
                Delete
              </button>
            </div>

            {salesmanError && (
              <div
                id="salesman-error-alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2"
                role="alert"
              >
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{salesmanError}</span>
              </div>
            )}

            <button
              type="button"
              id="btn-salesman-login-submit"
              onClick={() => handleSalesmanSubmit()}
              disabled={salesmanLoading || !salesmanPhone || salesmanPin.length < 4}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              style={{ backgroundColor: '#0B3D32' }}
            >
              {salesmanLoading ? (
                'Verifying…'
              ) : (
                <>
                  Sign in to van route
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {DEMO_LOGIN_ENABLED && (
            <button
              type="button"
              onClick={handleQuickDemoAdmin}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
              style={{ backgroundColor: '#E8F5E9', color: '#1B5E20' }}
            >
              Explore with demo login (Admin)
            </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setView('landing')}
          className="mt-8 w-full text-center text-xs font-medium text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          ← Back to home
        </button>
      </div>
    </div>
  );
};
