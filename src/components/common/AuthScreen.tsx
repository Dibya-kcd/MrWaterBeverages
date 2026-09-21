import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  UserCheck,
  Phone,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Volume2,
  VolumeX,
  ArrowRight,
  Sparkles,
  Truck,
  RotateCcw,
  Delete,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { speakAssistiveText } from '../../utils/speechRecognition';

export const AuthScreen: React.FC = () => {
  const {
    palette,
    fz,
    loginAdmin,
    loginSalesman,
    salesmen,
    orgProfile,
  } = useLedger();

  const [authMode, setAuthMode] = useState<'salesman' | 'admin'>('salesman');

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
  const [showAdminDocs, setShowAdminDocs] = useState(false);

  // Speak announcement on mode change if voiceAssist is on
  useEffect(() => {
    if (voiceAssist) {
      if (authMode === 'salesman') {
        speakAssistiveText('Salesman login screen. Enter phone number and 4 digit PIN.');
      } else {
        speakAssistiveText('Administrator login screen. Enter admin email and password.');
      }
    }
  }, [authMode, voiceAssist]);

  // Handle Keypad tap for Salesman
  const handleKeypadPress = (digit: string) => {
    if (salesmanPin.length >= 6) return;
    const next = salesmanPin + digit;
    setSalesmanPin(next);
    setSalesmanError(null);
    if (voiceAssist) {
      speakAssistiveText(digit);
    }
  };

  const handleKeypadBackspace = () => {
    if (salesmanPin.length === 0) return;
    const next = salesmanPin.slice(0, -1);
    setSalesmanPin(next);
    setSalesmanError(null);
    if (voiceAssist) {
      speakAssistiveText('Delete');
    }
  };

  const handleKeypadClear = () => {
    setSalesmanPin('');
    setSalesmanError(null);
    if (voiceAssist) {
      speakAssistiveText('PIN cleared');
    }
  };

  const handleSalesmanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSalesmanError(null);

    const phone = salesmanPhone.trim();
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

  const handleQuickDemoAdmin = () => {
    setAdminEmail('admin@mrwater.internal');
    setAdminPassword('admin123');
  };

  const handleSelectSalesman = (phone: string, defaultPin: string = '1234') => {
    setSalesmanPhone(phone);
    setSalesmanPin(defaultPin);
    setSalesmanError(null);
    if (voiceAssist) {
      const target = salesmen.find((s) => s.phone === phone);
      speakAssistiveText(`Selected salesman ${target?.name || phone}`);
    }
  };

  return (
    <div
      id="auth-screen"
      className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 select-none"
      style={{
        backgroundColor: palette.cream,
        color: palette.ink,
      }}
    >
      <div className="w-full max-w-md mx-auto">
        {/* Brand Banner */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-900 text-amber-400 shadow-lg mb-3">
            <Truck size={32} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: palette.navy }}>
            {orgProfile?.name || 'MrWater Distribution'}
          </h1>
          <p className="text-xs sm:text-sm font-medium mt-1 text-slate-600">
            Route Sales, Van Stock & Cloud Invoicing
          </p>
        </div>

        {/* Role Switcher Tabs */}
        <div
          id="auth-role-tabs"
          className="flex p-1.5 rounded-xl border-2 mb-5 bg-white shadow-sm"
          style={{ borderColor: palette.line }}
        >
          <button
            type="button"
            id="tab-salesman-login"
            onClick={() => {
              setAuthMode('salesman');
              setSalesmanError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm sm:text-base font-black transition-all cursor-pointer ${
              authMode === 'salesman'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-slate-700 hover:text-blue-900 hover:bg-slate-50'
            }`}
          >
            <UserCheck size={18} />
            <span>Salesman PIN Login</span>
          </button>
          <button
            type="button"
            id="tab-admin-login"
            onClick={() => {
              setAuthMode('admin');
              setAdminError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm sm:text-base font-black transition-all cursor-pointer ${
              authMode === 'admin'
                ? 'bg-blue-900 text-white shadow-md'
                : 'text-slate-700 hover:text-blue-900 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck size={18} />
            <span>Admin Sign-In</span>
          </button>
        </div>

        {/* Card Container */}
        <div
          className="bg-white border-2 rounded-2xl shadow-xl p-5 sm:p-7 overflow-hidden"
          style={{ borderColor: palette.line }}
        >
          {authMode === 'salesman' ? (
            /* SALESMAN PIN LOGIN MODE */
            <div id="salesman-login-card" className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <KeyRound size={20} className="text-amber-500" />
                    <span>Salesman Authentication</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Field salesmen sign in via Phone &amp; secure 4-digit PIN
                  </p>
                </div>

                {/* Voice Assist Button for Accessibility */}
                <button
                  type="button"
                  id="btn-toggle-voice-assist"
                  onClick={() => {
                    const next = !voiceAssist;
                    setVoiceAssist(next);
                    if (next) speakAssistiveText('Voice audio assistance activated.');
                  }}
                  className={`p-2.5 rounded-xl border-2 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                    voiceAssist
                      ? 'bg-amber-100 text-amber-900 border-amber-400 ring-2 ring-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                  title={voiceAssist ? 'Audio feedback ON' : 'Turn on audio feedback'}
                >
                  {voiceAssist ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  <span className="hidden sm:inline">{voiceAssist ? 'Audio ON' : 'Audio Assist'}</span>
                </button>
              </div>

              {/* Quick Select Salesman Chips */}
              {salesmen.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                    Quick Select Salesman:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {salesmen.map((sm) => {
                      const isSelected = salesmanPhone === sm.phone;
                      const defaultPin = sm.phone === '9876543210' ? '1234' : sm.phone === '9823456789' ? '4321' : '1234';
                      return (
                        <button
                          key={sm.id}
                          type="button"
                          id={`quick-sm-${sm.phone}`}
                          onClick={() => handleSelectSalesman(sm.phone, defaultPin)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          } ${!sm.active ? 'opacity-50' : ''}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              sm.active ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span>{sm.name}</span>
                          {!sm.active && <span className="text-[10px] text-rose-300">(Inactive)</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Phone Input */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Registered Mobile Number
                </label>
                <div className="relative">
                  <Phone
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="tel"
                    id="input-salesman-phone"
                    placeholder="Enter 10-digit mobile number"
                    value={salesmanPhone}
                    onChange={(e) => setSalesmanPhone(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border-2 rounded-xl text-base font-semibold focus:outline-none focus:border-blue-900"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  />
                </div>
              </div>

              {/* PIN Display Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Security PIN (4 to 6 Digits)</label>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="text-xs font-bold text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showPin ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showPin ? 'Hide PIN' : 'Show PIN'}</span>
                  </button>
                </div>

                {/* Masked PIN Box Display */}
                <div
                  className="flex items-center justify-center gap-3 py-2 px-3 bg-slate-50 border-2 rounded-xl"
                  style={{ borderColor: palette.line }}
                >
                  {[0, 1, 2, 3].map((idx) => {
                    const char = salesmanPin[idx];
                    const isFilled = Boolean(char);
                    return (
                      <div
                        key={idx}
                        className={`w-11 h-13 rounded-lg border-2 flex items-center justify-center text-2xl font-black transition-all ${
                          isFilled
                            ? 'bg-blue-900 text-white border-blue-900 shadow-sm scale-105'
                            : 'bg-white text-slate-300 border-slate-300'
                        }`}
                      >
                        {isFilled ? (showPin ? char : '●') : ''}
                      </div>
                    );
                  })}
                  {salesmanPin.length > 4 && (
                    <div className="px-2 py-1 rounded bg-blue-100 text-blue-900 text-xs font-black">
                      +{salesmanPin.length - 4}
                    </div>
                  )}
                </div>
              </div>

              {/* Error Banner */}
              {salesmanError && (
                <div
                  id="salesman-error-alert"
                  className="p-3 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-800 text-xs sm:text-sm font-bold flex items-start gap-2 animate-in fade-in duration-150"
                  role="alert"
                >
                  <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{salesmanError}</span>
                </div>
              )}

              {/* Large Touch Keypad (>=64px touch targets for Low Vision / Accessibility) */}
              <div
                id="accessible-numeric-keypad"
                aria-label="Accessible Numeric Keypad"
                className="grid grid-cols-3 gap-2.5 pt-2"
              >
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    id={`keypad-${digit}`}
                    onClick={() => handleKeypadPress(digit)}
                    className="h-16 rounded-xl border-2 text-2xl font-black bg-white hover:bg-slate-100 active:bg-blue-900 active:text-white transition-all shadow-sm flex items-center justify-center cursor-pointer select-none text-slate-900 focus-ring"
                    style={{ borderColor: palette.line }}
                  >
                    {digit}
                  </button>
                ))}

                {/* Bottom Row: Clear, 0, Backspace */}
                <button
                  type="button"
                  id="keypad-clear"
                  onClick={handleKeypadClear}
                  className="h-16 rounded-xl border-2 text-xs sm:text-sm font-black bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 transition-all shadow-sm flex flex-col items-center justify-center cursor-pointer select-none border-slate-300 focus-ring"
                  title="Clear all digits"
                >
                  <RotateCcw size={18} />
                  <span>Clear</span>
                </button>

                <button
                  type="button"
                  id="keypad-0"
                  onClick={() => handleKeypadPress('0')}
                  className="h-16 rounded-xl border-2 text-2xl font-black bg-white hover:bg-slate-100 active:bg-blue-900 active:text-white transition-all shadow-sm flex items-center justify-center cursor-pointer select-none text-slate-900 focus-ring"
                  style={{ borderColor: palette.line }}
                >
                  0
                </button>

                <button
                  type="button"
                  id="keypad-backspace"
                  onClick={handleKeypadBackspace}
                  className="h-16 rounded-xl border-2 text-xs sm:text-sm font-black bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 transition-all shadow-sm flex flex-col items-center justify-center cursor-pointer select-none border-slate-300 focus-ring"
                  title="Delete last digit"
                >
                  <Delete size={20} />
                  <span>Delete</span>
                </button>
              </div>

              {/* Login Button */}
              <button
                type="button"
                id="btn-salesman-login-submit"
                onClick={() => handleSalesmanSubmit()}
                disabled={salesmanLoading || !salesmanPhone || salesmanPin.length < 4}
                className={`w-full py-3.5 rounded-xl font-black text-base transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                  salesmanLoading || !salesmanPhone || salesmanPin.length < 4
                    ? 'bg-slate-200 text-slate-400 border-2 border-slate-200 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700 active:scale-[0.98]'
                }`}
              >
                {salesmanLoading ? (
                  <span>Verifying PIN...</span>
                ) : (
                  <>
                    <span>Sign In to Van Route</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          ) : (
            /* ADMIN EMAIL/PASSWORD LOGIN MODE */
            <form id="admin-login-form" onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <ShieldCheck size={20} className="text-blue-900" />
                    <span>Administrator Sign-In</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supabase Auth standard credentials for depot owners
                  </p>
                </div>
              </div>

              {/* Quick Demo Helper */}
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                <div className="text-xs text-blue-900">
                  <span className="font-bold">Test Admin Credentials:</span>
                  <div className="text-[11px] text-blue-700 font-mono mt-0.5">
                    admin@mrwater.internal / admin123
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-fill-demo-admin"
                  onClick={handleQuickDemoAdmin}
                  className="px-2.5 py-1 rounded bg-blue-900 text-white text-xs font-bold hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  Auto Fill
                </button>
              </div>

              {/* Admin Email */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  id="input-admin-email"
                  required
                  placeholder="admin@firm.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-900"
                  style={{ borderColor: palette.line, color: palette.ink }}
                />
              </div>

              {/* Admin Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="text-xs font-bold text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showAdminPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showAdminPass ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type={showAdminPass ? 'text' : 'password'}
                    id="input-admin-password"
                    required
                    placeholder="••••••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-900"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  />
                </div>
              </div>

              {/* Admin Error Banner */}
              {adminError && (
                <div
                  id="admin-error-alert"
                  className="p-3 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{adminError}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                id="btn-admin-login-submit"
                disabled={adminLoading}
                className="w-full py-3.5 rounded-xl font-black text-base bg-blue-900 hover:bg-blue-800 text-white border-2 border-blue-950 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {adminLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Sign In to Admin Dashboard</span>
                  </>
                )}
              </button>

              {/* Admin Provisioning Documentation Note */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  id="btn-toggle-admin-provision-info"
                  onClick={() => setShowAdminDocs(!showAdminDocs)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-blue-900 py-1.5 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle size={14} />
                    <span>How are Admin accounts provisioned?</span>
                  </span>
                  <span>{showAdminDocs ? '▲' : '▼'}</span>
                </button>

                {showAdminDocs && (
                  <div className="mt-2 p-3 bg-slate-50 border rounded-xl text-xs text-slate-600 space-y-1.5 animate-in fade-in duration-150">
                    <p className="font-semibold text-slate-800">
                      Admin-provisioned security model:
                    </p>
                    <p>
                      There is no public signup screen. Administrator accounts are created directly in your
                      Supabase dashboard under <strong>Authentication &gt; Users &gt; Add User</strong>, or
                      via the Supabase CLI/SQL seed script.
                    </p>
                    <p className="font-mono text-[11px] bg-white p-1.5 rounded border">
                      Default dev admin: admin@mrwater.internal / admin123
                    </p>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer Support Info */}
        <div className="text-center mt-6 text-xs text-slate-500">
          <span>Protected by Web Crypto SHA-256 PIN Hashing &amp; Supabase RLS Policies</span>
        </div>
      </div>
    </div>
  );
};
