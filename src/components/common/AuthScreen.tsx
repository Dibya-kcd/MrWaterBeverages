import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Delete,
  CheckCircle2,
  ChevronLeft,
  Sparkles,
  Hourglass,
  WifiOff,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { LandingIcon } from './LandingIcon';
import { useLandingContent } from '../../constants/landingContent';
import { useLedger } from '../../context/LedgerContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { speakAssistiveText } from '../../utils/speechRecognition';

type ViewMode = 'landing' | 'signin';

const LAST_SALESMAN_KEY = 'hh_last_salesman';
interface RememberedSalesman {
  phone: string;
  name: string;
}

const cleanPhone10 = (raw: string): string => {
  const digits = String(raw || '').trim().replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(2, 12);
  if (digits.length > 10 && digits.startsWith('0')) return digits.slice(1, 11);
  return digits.slice(-10) || String(raw || '').trim();
};

const readRememberedSalesman = (): RememberedSalesman | null => {
  try {
    const raw = localStorage.getItem(LAST_SALESMAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.phone === 'string' && parsed.phone.trim()) {
      return { phone: cleanPhone10(parsed.phone), name: typeof parsed.name === 'string' ? parsed.name : '' };
    }
  } catch {
    /* ignore storage issues */
  }
  return null;
};

const writeRememberedSalesman = (entry: RememberedSalesman | null): void => {
  try {
    if (!entry) localStorage.removeItem(LAST_SALESMAN_KEY);
    else localStorage.setItem(LAST_SALESMAN_KEY, JSON.stringify({ phone: cleanPhone10(entry.phone), name: entry.name }));
  } catch {
    /* ignore storage issues */
  }
};

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

  const content = useLandingContent();
  const isPhone = useIsMobile(767);
  const [view, setView] = useState<ViewMode>('landing');
  const [showDemo, setShowDemo] = useState(false);
  const [showOwnerDemo, setShowOwnerDemo] = useState(false);
  const [authMode, setAuthMode] = useState<'salesman' | 'admin'>(() => (readRememberedSalesman() ? 'salesman' : 'admin'));
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [rememberedSalesman, setRememberedSalesman] = useState<RememberedSalesman | null>(() => readRememberedSalesman());
  const [switchUserMode, setSwitchUserMode] = useState(false);

  // Salesman PIN Form State
  const [salesmanPhone, setSalesmanPhone] = useState(() => readRememberedSalesman()?.phone || '');
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
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

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
        const matched = salesmen.find((s) => cleanPhone10(s.phone) === cleanPhone10(phone));
        const remembered = { phone: cleanPhone10(phone), name: matched?.name || phone };
        writeRememberedSalesman(remembered);
        setRememberedSalesman(remembered);
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
      } else {
        writeRememberedSalesman(null);
        setRememberedSalesman(null);
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

  const legacyName = orgProfile?.name && orgProfile.name !== 'MrWater' ? orgProfile.name : '';
  const brand = content.brandName.trim() || legacyName || 'Hydrate Hub';
  const brandLetter = brand.charAt(0).toUpperCase() || 'H';

  // ─── LANDING ───────────────────────────────────────────────────────────
  if (view === 'landing') {
    if (isPhone) {
      return (
        <div id="auth-landing" className="hh-land-phone">
          {demoOverlay}
          <section className="hh-land-phone__hero">
            <header className="hh-land-phone__bar">
              <div className="hh-land-phone__brand">
                <span className="hh-auth-spark" aria-hidden="true">
                  <Sparkles size={14} strokeWidth={2.5} />
                </span>
                <span>{brand}</span>
              </div>
              <button type="button" onClick={() => setView('signin')} className="hh-land-phone__topbtn">
                {content.signInButton}
              </button>
            </header>

            {content.badge.trim() && <span className="hh-land-phone__badge">{content.badge}</span>}
            <h1 className="hh-land-phone__h1">
              {content.headlineLine1}
              <br />
              {content.headlineLine2}
              <br />
              <span className="hh-land-phone__accent">{content.headlineAccent}</span>
            </h1>
            <p className="hh-land-phone__sub">{content.subtitle}</p>

            <button
              type="button"
              id="btn-goto-signin"
              onClick={() => setView('signin')}
              className="hh-land-phone__cta"
            >
              {content.signInButton}
            </button>

            <div className="hh-land-phone__links">
              <button
                type="button"
                id="btn-open-salesman-demo"
                onClick={() => setShowDemo(true)}
                className="hh-land-phone__link"
              >
                {content.salesmanDemoButton}
              </button>
              <button
                type="button"
                id="btn-open-owner-demo"
                onClick={() => setShowOwnerDemo(true)}
                className="hh-land-phone__link"
              >
                {content.ownerDemoButton}
              </button>
            </div>
          </section>

          <section className="hh-land-phone__body">
            <div className="hh-land-phone__grid" aria-label="Features">
              {content.features.map((f, i) => (
                <div key={i} className="hh-land-phone__feat">
                  <span className="hh-land-phone__featicon" aria-hidden="true">
                    <LandingIcon name={f.icon} size={18} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
            <footer className="hh-land-phone__foot">
              {brand}
              {content.footer.trim() ? ` · ${content.footer}` : ''}
            </footer>
          </section>
        </div>
      );
    }

    return (
      <div id="auth-landing" className="hh-land">
        {demoOverlay}
        <div className="hh-land__blob hh-land__blob--a" aria-hidden="true" />
        <div className="hh-land__blob hh-land__blob--b" aria-hidden="true" />
        <div className="hh-land__wrap">
          <header className="hh-land__bar">
            <div className="hh-land__brand">
              <BrandMark letter={brandLetter} className="size-10 text-base" />
              <span>{brand}</span>
            </div>
            <div className="hh-land__barright">
              <button type="button" onClick={() => setView('signin')} className="hh-cta hh-cta--ghost" style={{ minHeight: 40, padding: '8px 16px' }}>
                {content.signInButton}
              </button>
            </div>
          </header>

          <main className="hh-land__hero">
            <div>
              {content.badge.trim() && <span className="hh-badge">{content.badge}</span>}
              <h1 className="hh-land__h1">
                {content.headlineLine1}
                <br />
                {content.headlineLine2}{' '}
                <span className="hh-land__accent">{content.headlineAccent}</span>
              </h1>
              <p className="hh-land__sub">{content.subtitle}</p>

              <div className="hh-land__cta">
                <button type="button" id="btn-goto-signin" onClick={() => setView('signin')} className="hh-cta hh-cta--primary">
                  {content.signInButton}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="hh-land__links">
                <button type="button" id="btn-open-salesman-demo" onClick={() => setShowDemo(true)} className="hh-link">
                  {content.salesmanDemoButton}
                </button>
                <button type="button" id="btn-open-owner-demo" onClick={() => setShowOwnerDemo(true)} className="hh-link">
                  {content.ownerDemoButton}
                </button>
              </div>
            </div>

            {/* Decorative preview: sample figures only */}
            <div className="hh-phone" aria-hidden="true">
              <div className="hh-phone__screen">
                <div className="hh-phone__head">
                  <span>{brand}</span>
                  <span className="hh-phone__chip">Sample</span>
                </div>
                <div className="hh-phone__hero">
                  <small>Today's sales</small>
                  <b>₹48,250</b>
                  <div className="hh-phone__bars">
                    {[40, 62, 48, 80, 58, 94, 70].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
                  </div>
                </div>
                <div className="hh-phone__row">
                  <div className="hh-phone__tile"><small>Collected</small><b>₹31,900</b></div>
                  <div className="hh-phone__tile"><small>Crates out</small><b>126</b></div>
                </div>
                <div className="hh-phone__bill"><span>Sharma General Store</span><span>Paid</span></div>
              </div>
            </div>
          </main>

          <section className="hh-land__features" aria-label="Features">
            {content.features.map((f, i) => (
              <div key={i} className="hh-feat">
                <span className="hh-feat__icon"><LandingIcon name={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </section>

          <footer className="hh-land__foot">
            {brand}{content.footer.trim() ? ` · ${content.footer}` : ''}
          </footer>
        </div>
      </div>
    );
  }

  // ─── SIGN-IN ───────────────────────────────────────────────────────────
  const errorBox = (id: string, msg: string) => (
    <div id={id} className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2" role="alert">
      <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
      <span>{msg}</span>
    </div>
  );
  const demoHint = (id: string, onClick: () => void, text: string) => (
    <button type="button" id={id} onClick={onClick} className="hh-cta hh-cta--ghost w-full" style={{ minHeight: 44, fontSize: '0.875rem' }}>
      {text}
    </button>
  );

  if (isPhone) {
    const targetClean = cleanPhone10(salesmanPhone);
    const matchedSm = targetClean ? salesmen.find((x) => cleanPhone10(x.phone) === targetClean) : undefined;
    const isReturningView = Boolean(
      rememberedSalesman &&
      !switchUserMode &&
      targetClean &&
      targetClean === cleanPhone10(rememberedSalesman.phone),
    );
    const returningName = matchedSm?.name || rememberedSalesman?.name || salesmanPhone;
    const returningFirst = (returningName.split(' ')[0] || returningName).trim();
    const formattedPhone = targetClean.length === 10 ? `${targetClean.slice(0, 5)} ${targetClean.slice(5)}` : salesmanPhone;
    const dotCount = Math.max(4, salesmanPin.length);

    return (
      <div id="auth-screen" className="hh-sign-phone">
        {demoOverlay}

        <header className="hh-sign-phone__top">
          <button type="button" onClick={() => setView('landing')} className="hh-sign-phone__back">
            <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
            <span>Back to home</span>
          </button>
          <span className="hh-auth-spark" aria-hidden="true">
            <Sparkles size={14} strokeWidth={2.5} />
          </span>
        </header>

        <main className="hh-sign-phone__sheet">
          <div className="hh-sign-phone__inner">
            <h1 className="hh-sign-phone__title">{content.signInTitle}</h1>
            {authMode === 'admin' && <p className="hh-sign-phone__sub">{content.signInSubtitle}</p>}

            <div className="hh-sign-phone__seg" role="tablist" aria-label="Sign in as">
              <button
                type="button"
                id="tab-admin-login"
                role="tab"
                aria-selected={authMode === 'admin'}
                className="hh-sign-phone__segbtn"
                onClick={() => {
                  setAuthMode('admin');
                  setAdminError(null);
                }}
              >
                Admin
              </button>
              <button
                type="button"
                id="tab-salesman-login"
                role="tab"
                aria-selected={authMode === 'salesman'}
                className="hh-sign-phone__segbtn"
                onClick={() => {
                  setAuthMode('salesman');
                  setSalesmanError(null);
                }}
              >
                Salesman
              </button>
            </div>

            {!isOnline && (
              <div className="hh-sign-phone__offline mb-3" role="status">
                <WifiOff size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>You are offline. Connect to the internet to sign in the first time.</span>
              </div>
            )}

            {authMode === 'admin' ? (
              <form id="admin-login-form" onSubmit={handleAdminSubmit} className="space-y-3">
                {adminError && (
                  <div id="admin-error-alert" role="alert" className="hh-sign-phone__err">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{adminError}</span>
                  </div>
                )}

                <div className={`rt-in ${adminError && !adminEmail.trim() ? 'rt-in--err' : ''}`}>
                  <label htmlFor="input-admin-email" className="rt-in__label">EMAIL</label>
                  <input
                    type="email"
                    id="input-admin-email"
                    required
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={adminEmail}
                    onChange={(e) => {
                      setAdminEmail(e.target.value);
                      setAdminError(null);
                    }}
                    className="rt-in__control"
                  />
                </div>

                <div className={`rt-in ${adminError && (!!adminEmail.trim() || !adminPassword.trim()) ? 'rt-in--err' : ''}`}>
                  <div className="rt-in__head">
                    <label htmlFor="input-admin-password" className="rt-in__label">PASSWORD</label>
                    <button
                      type="button"
                      onClick={() => setShowAdminPass(!showAdminPass)}
                      className="hh-sign-phone__toggle"
                    >
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
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setAdminError(null);
                    }}
                    className="rt-in__control"
                  />
                </div>

                <button
                  type="submit"
                  id="btn-admin-login-submit"
                  disabled={adminLoading}
                  className="hh-sign-phone__primary"
                >
                  {adminLoading ? (
                    <>
                      <Hourglass size={15} aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>

                <button
                  type="button"
                  id="btn-continue-google"
                  onClick={() =>
                    setAdminError('Google sign-in is not configured in this build. Use email & password or demo login.')
                  }
                  className="hh-sign-phone__outline"
                >
                  <span className="font-extrabold">G</span>
                  <span>Continue with Google</span>
                </button>

                {DEMO_LOGIN_ENABLED && (
                  <button
                    type="button"
                    id="btn-explore-demo"
                    onClick={handleQuickDemoAdmin}
                    className="hh-sign-phone__outline"
                    style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#bbf7d0' }}
                  >
                    Explore with demo login
                  </button>
                )}

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setAdminError('Accounts are provisioned by the owner. Use demo login or contact your admin.')
                    }
                    className="hh-sign-phone__link"
                  >
                    Request access
                  </button>
                </div>
              </form>
            ) : isReturningView ? (
              <div id="salesman-login-card" className="space-y-3">
                <div className="text-center pb-1">
                  <div className="hh-sign-phone__avatar" aria-hidden="true">
                    {returningName.charAt(0).toUpperCase() || 'S'}
                  </div>
                  <div className="text-base font-extrabold text-[var(--text)]">{returningName}</div>
                  <div className="text-xs font-medium text-[var(--text-2)]">{formattedPhone} · Salesman</div>
                </div>

                {matchedSm && matchedSm.hasPin === false && (
                  <div className="hh-sign-phone__err" role="alert">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Please ask the Administrator to set a 4-digit PIN in Staff Settings.</span>
                  </div>
                )}

                {salesmanError && (
                  <div id="salesman-error-alert" role="alert" className="hh-sign-phone__err">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{salesmanError}</span>
                  </div>
                )}

                <div>
                  <div className="hh-sign-phone__dots" aria-label={`${salesmanPin.length} PIN digits entered`}>
                    {Array.from({ length: dotCount }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`hh-sign-phone__dot ${idx < salesmanPin.length ? 'hh-sign-phone__dot--on' : ''}`}
                      />
                    ))}
                  </div>
                  <input
                    id="input-salesman-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={salesmanPin}
                    onChange={(e) => {
                      setSalesmanPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setSalesmanError(null);
                    }}
                    className="sr-only"
                    aria-label="Security PIN"
                  />
                </div>

                <div className="hh-sign-phone__keypad">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button key={d} type="button" onClick={() => handleKeypadPress(d)} className="hh-sign-phone__key">
                      {d}
                    </button>
                  ))}
                  <button type="button" onClick={handleKeypadClear} className="hh-sign-phone__key hh-sign-phone__key--soft">
                    Clear
                  </button>
                  <button type="button" onClick={() => handleKeypadPress('0')} className="hh-sign-phone__key">
                    0
                  </button>
                  <button type="button" onClick={handleKeypadBackspace} className="hh-sign-phone__key hh-sign-phone__key--soft">
                    Delete
                  </button>
                </div>

                <button
                  type="button"
                  id="btn-salesman-login-submit"
                  onClick={() => handleSalesmanSubmit()}
                  disabled={salesmanLoading || !salesmanPhone || salesmanPin.length < 4}
                  className="hh-sign-phone__primary"
                >
                  {salesmanLoading ? (
                    <>
                      <Hourglass size={15} aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    'Sign in to van route'
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSwitchUserMode(true);
                      setRememberedSalesman(null);
                      writeRememberedSalesman(null);
                      setSalesmanPhone('');
                      setSalesmanPin('');
                      setSalesmanError(null);
                    }}
                    className="hh-sign-phone__link"
                  >
                    Not {returningFirst}? Switch user
                  </button>
                </div>
              </div>
            ) : (
              <div id="salesman-login-card" className="space-y-3">
                {matchedSm && matchedSm.hasPin === false && (
                  <div className="hh-sign-phone__err" role="alert">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Please ask the Administrator to set a 4-digit PIN in Staff Settings.</span>
                  </div>
                )}

                {salesmanError && (
                  <div id="salesman-error-alert" role="alert" className="hh-sign-phone__err">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{salesmanError}</span>
                  </div>
                )}

                {salesmen.length > 0 && (
                  <div>
                    <span className="rt-in__label mb-1.5">QUICK SELECT</span>
                    <div className="flex flex-wrap gap-1.5">
                      {salesmen.map((sm) => {
                        const isSelected = targetClean !== '' && targetClean === cleanPhone10(sm.phone);
                        return (
                          <button
                            key={sm.phone}
                            type="button"
                            data-selected={isSelected}
                            onClick={() => handleSelectSalesman(sm.phone)}
                            className="hh-sign-phone__quickchip"
                          >
                            {sm.name || sm.phone}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rt-in">
                  <label htmlFor="input-salesman-phone" className="rt-in__label">MOBILE NUMBER</label>
                  <input
                    type="tel"
                    id="input-salesman-phone"
                    inputMode="numeric"
                    placeholder="10-digit mobile number"
                    value={salesmanPhone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      let normalized = digits;
                      if (digits.length > 10 && digits.startsWith('91')) normalized = digits.slice(2, 12);
                      else if (digits.length > 10 && digits.startsWith('0')) normalized = digits.slice(1, 11);
                      else if (digits.length > 10) normalized = digits.slice(-10);
                      setSalesmanPhone(normalized);
                      setSalesmanError(null);
                    }}
                    className="rt-in__control"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="input-salesman-pin" className="rt-in__label">SECURITY PIN</label>
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="hh-sign-phone__toggle"
                    >
                      {showPin ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showPin ? (
                    <div className="rt-in">
                      <input
                        id="input-salesman-pin"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••"
                        value={salesmanPin}
                        onChange={(e) => {
                          setSalesmanPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setSalesmanError(null);
                        }}
                        className="rt-in__control tracking-widest text-center"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="hh-sign-phone__dots" aria-label={`${salesmanPin.length} PIN digits entered`}>
                        {Array.from({ length: dotCount }).map((_, idx) => (
                          <span
                            key={idx}
                            className={`hh-sign-phone__dot ${idx < salesmanPin.length ? 'hh-sign-phone__dot--on' : ''}`}
                          />
                        ))}
                      </div>
                      <input
                        id="input-salesman-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={salesmanPin}
                        onChange={(e) => {
                          setSalesmanPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setSalesmanError(null);
                        }}
                        className="sr-only"
                        aria-label="Security PIN"
                      />
                    </>
                  )}
                </div>

                <div className="hh-sign-phone__keypad">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button key={d} type="button" onClick={() => handleKeypadPress(d)} className="hh-sign-phone__key">
                      {d}
                    </button>
                  ))}
                  <button type="button" onClick={handleKeypadClear} className="hh-sign-phone__key hh-sign-phone__key--soft">
                    Clear
                  </button>
                  <button type="button" onClick={() => handleKeypadPress('0')} className="hh-sign-phone__key">
                    0
                  </button>
                  <button type="button" onClick={handleKeypadBackspace} className="hh-sign-phone__key hh-sign-phone__key--soft">
                    Delete
                  </button>
                </div>

                <button
                  type="button"
                  id="btn-salesman-login-submit"
                  onClick={() => handleSalesmanSubmit()}
                  disabled={salesmanLoading || !salesmanPhone || salesmanPin.length < 4}
                  className="hh-sign-phone__primary"
                >
                  {salesmanLoading ? (
                    <>
                      <Hourglass size={15} aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    'Sign in to van route'
                  )}
                </button>

                {DEMO_LOGIN_ENABLED && (
                  <button
                    type="button"
                    onClick={handleQuickDemoAdmin}
                    className="hh-sign-phone__outline"
                    style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#bbf7d0' }}
                  >
                    Explore with demo login (Admin)
                  </button>
                )}

                <div className="text-center">
                  <button
                    type="button"
                    id="btn-open-salesman-demo-signin"
                    onClick={() => setShowDemo(true)}
                    className="hh-sign-phone__link"
                  >
                    {content.salesmanDemoButton}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="auth-screen" className="hh-sign">
      {demoOverlay}

      <aside className="hh-sign__panel" aria-hidden="true">
        <div className="flex items-center gap-3 relative z-[1]">
          <BrandMark letter={brandLetter} className="size-11 text-lg" />
          <span className="font-extrabold text-xl">{brand}</span>
        </div>
        <div className="relative z-[1]">
          <h2>{content.panelHeadline}</h2>
          <ul>
            {content.panelPoints.filter((p) => p.trim()).map((p, i) => (
              <li key={i}><CheckCircle2 size={18} /><span>{p}</span></li>
            ))}
          </ul>
        </div>
        <div className="relative z-[1] text-sm text-white/70">{content.footer}</div>
      </aside>

      <main className="hh-sign__main">
        <div className="hh-sign__card">
          <div className="hh-sign__mobilebrand">
            <BrandMark letter={brandLetter} className="size-10 text-base" />
            <span>{brand}</span>
          </div>

          <h1 className="hh-sign__title">{content.signInTitle}</h1>
          <p className="hh-sign__sub">{content.signInSubtitle}</p>

          <div className="hh-seg" role="tablist" aria-label="Sign in as">
            <button type="button" id="tab-admin-login" role="tab" aria-selected={authMode === 'admin'}
              onClick={() => { setAuthMode('admin'); setAdminError(null); }}>
              <ShieldCheck size={16} aria-hidden="true" />Owner / Admin
            </button>
            <button type="button" id="tab-salesman-login" role="tab" aria-selected={authMode === 'salesman'}
              onClick={() => { setAuthMode('salesman'); setSalesmanError(null); }}>
              <UserCheck size={16} aria-hidden="true" />Staff / Salesman
            </button>
          </div>

          {authMode === 'admin' ? (
            <form id="admin-login-form" onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label htmlFor="input-admin-email" className="hh-label">Email</label>
                <input type="email" id="input-admin-email" required autoComplete="username" placeholder="you@company.com"
                  value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="hh-input" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-admin-password" className="hh-label" style={{ marginBottom: 0 }}>Password</label>
                  <button type="button" onClick={() => setShowAdminPass(!showAdminPass)}
                    className="text-xs font-semibold text-[var(--text-2)] hover:text-[var(--primary)] flex items-center gap-1 cursor-pointer">
                    {showAdminPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showAdminPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input type={showAdminPass ? 'text' : 'password'} id="input-admin-password" required autoComplete="current-password"
                  placeholder="••••••••" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="hh-input" />
              </div>

              {adminError && errorBox('admin-error-alert', adminError)}

              <button type="submit" id="btn-admin-login-submit" disabled={adminLoading}
                className="hh-cta hh-cta--primary w-full disabled:opacity-60">
                {adminLoading ? 'Signing in…' : 'Sign in'}
              </button>

              <button type="button" id="btn-continue-google"
                onClick={() => setAdminError('Google sign-in is not configured in this build. Use email & password or demo login.')}
                className="hh-cta hh-cta--ghost w-full">
                Continue with Google
              </button>

              {DEMO_LOGIN_ENABLED && (
                <button type="button" id="btn-explore-demo" onClick={handleQuickDemoAdmin}
                  className="hh-cta w-full" style={{ background: '#e8f5e9', color: '#1b5e20', border: 0 }}>
                  Explore with demo login
                </button>
              )}

              {demoHint('btn-open-owner-demo-signin', () => setShowOwnerDemo(true), content.ownerDemoButton)}

              <p className="text-center text-sm text-[var(--text-2)] pt-1">
                New here?{' '}
                <button type="button" className="font-bold text-[var(--primary)] hover:underline cursor-pointer"
                  onClick={() => setAdminError('Accounts are provisioned by the owner. Use demo login or contact your admin.')}>
                  Create an account
                </button>
              </p>
            </form>
          ) : (
            <div id="salesman-login-card" className="space-y-4">
              <p className="text-xs text-[var(--text-2)]">Field staff sign in with registered mobile &amp; 4–6 digit PIN.</p>

              {salesmen.length > 0 && (
                <div>
                  <span className="hh-label">Quick select</span>
                  <div className="flex flex-wrap gap-2">
                    {salesmen.map((sm) => {
                      const isSelected = salesmanPhone === sm.phone;
                      return (
                        <button key={sm.phone} type="button" onClick={() => handleSelectSalesman(sm.phone)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            isSelected ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                       : 'bg-white text-[var(--text-2)] border-[var(--border)] hover:border-[var(--primary)]'}`}>
                          {sm.name || sm.phone}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="input-salesman-phone" className="hh-label">Mobile number</label>
                <input type="tel" id="input-salesman-phone" inputMode="numeric" placeholder="10-digit mobile number"
                  value={salesmanPhone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    let normalized = digits;
                    if (digits.length > 10 && digits.startsWith('91')) normalized = digits.slice(2, 12);
                    else if (digits.length > 10 && digits.startsWith('0')) normalized = digits.slice(1, 11);
                    else if (digits.length > 10) normalized = digits.slice(-10);
                    setSalesmanPhone(normalized);
                    setSalesmanError(null);
                  }}
                  className="hh-input" />
                {(() => {
                  const targetClean = salesmanPhone.replace(/\D/g, '').slice(-10);
                  if (!targetClean) return null;
                  const sm = salesmen.find((x) => x.phone.replace(/\D/g, '').slice(-10) === targetClean);
                  if (sm && sm.hasPin === false) {
                    return (
                      <div className="hh-notice mt-2 flex items-start gap-2">
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">{sm.name}</span> does not have a PIN configured yet.
                          <span className="block text-[11px] mt-0.5">Please ask the Administrator to set a 4-digit PIN in Staff Settings.</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-salesman-pin" className="hh-label" style={{ marginBottom: 0 }}>Security PIN</label>
                  <button type="button" onClick={() => setShowPin(!showPin)}
                    className="text-xs font-semibold text-[var(--text-2)] hover:text-[var(--primary)] flex items-center gap-1 cursor-pointer">
                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPin ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input id="input-salesman-pin" type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={6} placeholder="••••"
                    value={salesmanPin}
                    onChange={(e) => { setSalesmanPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setSalesmanError(null); }}
                    className="hh-input tracking-widest" style={{ paddingLeft: 42 }} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button key={d} type="button" onClick={() => handleKeypadPress(d)} className="hh-key">{d}</button>
                ))}
                <button type="button" onClick={handleKeypadClear} className="hh-key hh-key--soft"><RotateCcw size={16} />Clear</button>
                <button type="button" onClick={() => handleKeypadPress('0')} className="hh-key">0</button>
                <button type="button" onClick={handleKeypadBackspace} className="hh-key hh-key--soft"><Delete size={18} />Delete</button>
              </div>

              {salesmanError && errorBox('salesman-error-alert', salesmanError)}

              <button type="button" id="btn-salesman-login-submit" onClick={() => handleSalesmanSubmit()}
                disabled={salesmanLoading || !salesmanPhone || salesmanPin.length < 4}
                className="hh-cta hh-cta--primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {salesmanLoading ? 'Verifying…' : (<>Sign in to van route<ArrowRight size={16} /></>)}
              </button>

              {DEMO_LOGIN_ENABLED && (
                <button type="button" onClick={handleQuickDemoAdmin} className="hh-cta w-full"
                  style={{ background: '#e8f5e9', color: '#1b5e20', border: 0 }}>
                  Explore with demo login (Admin)
                </button>
              )}

              {demoHint('btn-open-salesman-demo-signin', () => setShowDemo(true), content.salesmanDemoButton)}
            </div>
          )}

          <button type="button" onClick={() => setView('landing')}
            className="mt-8 w-full text-center text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer">
            ← Back to home
          </button>
        </div>
      </main>
    </div>
  );
};
