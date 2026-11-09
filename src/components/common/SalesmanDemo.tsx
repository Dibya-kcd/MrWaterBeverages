/**
 * Guided demo for salesmen, shown BEFORE sign-in.
 *
 * Safe by construction: this file imports nothing from the app's data layer (no ledger context, no Supabase, no
 * storage helpers) and makes no network request. Every shop, product, price and number below is invented sample
 * data held in this component's own memory; closing the demo throws it all away. tests/demoIsolation.test.ts
 * fails the build if someone later adds such an import.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  LayoutGrid,
  ShoppingCart,
  IndianRupee,
  Truck,
  Package,
  FileText,
  Banknote,
  QrCode,
  Clock,
  CreditCard,
  Plus,
  Minus,
  Search,
  CheckCircle2,
  Share2,
  UserPlus,
  Delete,
} from 'lucide-react';

/* ----------------------------------------------------------------------------------------------- sample data */
const GREEN = 'var(--primary)';
const AMBER = '#F59E0B';

const PRODUCTS = [
  { id: 'jar', name: '20 L water jar', unit: 'jar', price: 60, load: 40 },
  { id: 'l1', name: '1 L bottle, case of 12', unit: 'case', price: 130, load: 20 },
  { id: 'ml500', name: '500 ml bottle, case of 24', unit: 'case', price: 150, load: 15 },
] as const;

const SHOPS = [
  { id: 's1', name: 'Sri Lakshmi Stores', area: 'Main Road', due: 1250 },
  { id: 's2', name: 'Maa Tarini Kirana', area: 'Station Chowk', due: 0 },
  { id: 's3', name: 'Hotel Sagar', area: 'Bus Stand', due: 480 },
] as const;

type PayMode = 'cash' | 'upi' | 'credit' | 'cheque';
type TabKey = 'home' | 'sell' | 'customerDue' | 'trips' | 'vanStock' | 'bills';

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/* ---------------------------------------------------------------------------------------------------- steps */
interface StepInfo {
  title: string;
  what: string;
  tips?: string[];
  /** what to do on the phone */
  action?: string;
  tab?: TabKey;
}

const STEPS: StepInfo[] = [
  {
    title: 'How the salesman app works',
    what:
      'A short walk through a normal day on the route: sign in, load the vehicle, bill a shop, collect an old balance, check stock and end the trip. Everything here is sample data. Nothing you tap is saved or sent anywhere.',
    action: 'Tap Start the demo.',
  },
  {
    title: 'Sign in',
    what: 'Enter the mobile number and PIN the owner gave you. The PIN is 4 to 6 digits.',
    tips: [
      'Several wrong PINs in a row lock sign-in for a few minutes. Wait, then try again.',
      'If your PIN never works, ask the owner to save your PIN again in Settings.',
    ],
    action: 'Tap Sign in to van route.',
  },
  {
    title: 'Your home screen',
    what:
      'Home shows the five things you do every day. The bar at the bottom moves between Home, Sale, Payment, Trips, Stock and My Bills.',
    tips: ['Starting a new shop on your route? Use Route Master to add it and bill it straight away.'],
    action: 'Start the day by tapping 3. Record Trip.',
    tab: 'home',
  },
  {
    title: 'Load the vehicle',
    what:
      'Set how much of each product goes on the vehicle, then load it. Van Stock then shows what is left as you sell.',
    action: 'Tap Load Vehicle Run.',
    tab: 'trips',
  },
  {
    title: 'Pick the shop',
    what: 'Open Sale and choose the shop you are billing. Use the search box to find it by name.',
    action: 'Tap Sri Lakshmi Stores.',
    tab: 'sell',
  },
  {
    title: 'Add the products',
    what: 'Tap + for each product the shop buys. The total updates as you go. Tap minus to take one back.',
    action: 'Add at least one product, then tap Review & pay.',
    tab: 'sell',
  },
  {
    title: 'Take the payment',
    what:
      'Choose how the shop pays: Cash, UPI / QR, Credit (Due) or Cheque. Enter the amount received. Anything not paid now stays as the shop’s balance.',
    tips: ['Try Credit (Due) or a smaller amount and watch the balance remaining change.'],
    action: 'Tap Finalize Sale.',
    tab: 'sell',
  },
  {
    title: 'Send the invoice',
    what:
      'The invoice is ready. You can send it to the shop on WhatsApp from here, or open it to view or print. It also appears under My Bills.',
    action: 'Tap Done.',
    tab: 'sell',
  },
  {
    title: 'Collect an old balance',
    what:
      'When a shop pays what it owes, open Payment, look the shop up and record the cash or UPI you received. The balance goes down by that amount.',
    action: 'Tap Record payment.',
    tab: 'customerDue',
  },
  {
    title: 'Check the stock',
    what:
      'Stock shows what is left on the vehicle after each sale. Use the filters to see All, Available, Loaded or sold-out (Empty) items.',
    action: 'Tap Trips in the bottom bar.',
    tab: 'vanStock',
  },
  {
    title: 'End the trip',
    what:
      'At the end of the route, open Trips and end the trip. Count what is left on the vehicle and return it to stock.',
    tips: ['If the signal drops, keep working. The app keeps your entries on the phone and sends them when the connection is back.'],
    action: 'Tap End Trip & Return Stock.',
    tab: 'trips',
  },
  {
    title: 'That is the whole day',
    what: 'Sign in, load the vehicle, bill each shop, collect balances, check stock, end the trip. For anything else, ask the owner.',
    action: 'Close the demo or run it again.',
  },
];

/* --------------------------------------------------------------------------------------------- small parts */
const Tap: React.FC<{
  onTap: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ onTap, active = true, disabled = false, className = '', style, children }) => (
  <button
    type="button"
    onClick={onTap}
    disabled={disabled}
    style={style}
    className={`${className} ${active && !disabled ? 'demo-tap' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

const Still: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({
  className = '',
  style,
  children,
}) => (
  <div className={className} style={style}>
    {children}
  </div>
);

const NAV: { id: TabKey; label: string; Icon: React.ComponentType<any> }[] = [
  { id: 'home', label: 'Home', Icon: LayoutGrid },
  { id: 'sell', label: 'Sale', Icon: ShoppingCart },
  { id: 'customerDue', label: 'Payment', Icon: IndianRupee },
  { id: 'trips', label: 'Trips', Icon: Truck },
  { id: 'vanStock', label: 'Stock', Icon: Package },
  { id: 'bills', label: 'My Bills', Icon: FileText },
];

/* ------------------------------------------------------------------------------------------------ the demo */
export const SalesmanDemo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, number>>({ jar: 40, l1: 20, ml500: 15 });
  const [shopId, setShopId] = useState<string>(SHOPS[0].id);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sold, setSold] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<PayMode>('cash');
  const [received, setReceived] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'loaded' | 'empty'>('all');
  const [collect, setCollect] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pin, setPin] = useState('4821');
  const closeRef = useRef<HTMLButtonElement>(null);

  const shop = SHOPS.find((s) => s.id === shopId) || SHOPS[0];
  const total = useMemo(() => PRODUCTS.reduce((sum, p) => sum + (cart[p.id] || 0) * p.price, 0), [cart]);
  const itemCount = PRODUCTS.reduce((n, p) => n + (cart[p.id] || 0), 0);
  const receivedNum = mode === 'credit' ? 0 : received === '' ? total : Math.max(0, Number(received) || 0);
  const paidNow = Math.min(total, receivedNum);
  const creditLeft = total - paidNow;
  const dueNow = shop.due + creditLeft;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  const last = STEPS.length - 1;
  const go = (n: number) => setStep(Math.max(0, Math.min(last, n)));
  const next = () => go(step + 1);
  const restart = () => {
    setStep(0);
    setLoaded({ jar: 40, l1: 20, ml500: 15 });
    setShopId(SHOPS[0].id);
    setCart({});
    setSold({});
    setMode('cash');
    setReceived('');
    setFilter('all');
    setCollect('');
    setNote(null);
    setPin('4821');
  };

  // The coach panel's Next button does the same thing as the glowing control, filling in sample data if needed.
  const coachNext = () => {
    if (step === 5 && itemCount === 0) setCart({ jar: 2, l1: 1 });
    if (step === 6) setSold(cart);
    if (step === 8 && collect === '') setCollect(String(Math.min(dueNow, 500)));
    next();
  };

  const info = STEPS[step];
  const showPhoneNav = step >= 2 && step <= 10;

  const setQty = (id: string, d: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, (c[id] || 0) + d)) }));

  /* ------------------------------------------------------------------------------------------ phone screens */
  const screen = (() => {
    switch (step) {
      case 0:
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white" style={{ background: GREEN }}>
              <Truck size={30} />
            </div>
            <div>
              <div className="font-extrabold text-lg text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                Van route app
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">Bill shops, collect payments and track your vehicle stock.</p>
            </div>
            <Tap onTap={next} className="px-5 py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
              Start the demo
            </Tap>
          </div>
        );
      case 1:
        return (
          <div className="px-5 pt-6 pb-4 space-y-3">
            <div className="text-center">
              <div className="font-extrabold text-base text-slate-900">Staff sign in</div>
              <div className="text-[11px] text-slate-500">Registered mobile and 4–6 digit PIN</div>
            </div>
            <Still className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800">
              98765 43210
            </Still>
            <div className="flex justify-center gap-2 py-1" aria-label={`${pin.length} digits entered`}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="w-3 h-3 rounded-full border"
                  style={{ background: i < pin.length ? GREEN : 'transparent', borderColor: GREEN }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setPin((p) => (k === 'C' ? '' : k === '⌫' ? p.slice(0, -1) : p.length < 6 ? p + k : p))
                  }
                  className="py-2 rounded-lg bg-slate-100 text-slate-800 text-sm font-bold active:bg-slate-200"
                >
                  {k === '⌫' ? <Delete size={15} className="mx-auto" /> : k}
                </button>
              ))}
            </div>
            <Tap
              onTap={next}
              disabled={pin.length < 4}
              className="w-full py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: GREEN }}
            >
              Sign in to van route
            </Tap>
            <p className="text-[10px] text-center text-slate-400">Sample PIN. Type any 4 to 6 digits.</p>
          </div>
        );
      case 2:
        return (
          <div className="p-4 space-y-3">
            <div>
              <div className="text-[11px] text-slate-500">Good morning</div>
              <div className="font-extrabold text-base text-slate-900">Ravi Kumar</div>
            </div>
            <div className="text-xs font-bold text-slate-700">Quick Actions</div>
            {[
              ['1. New Bill / Sale', 'Select retailer or add new customer', ShoppingCart],
              ['2. Record Payment', 'Look up retailer dues & collect cash/UPI', IndianRupee],
              ['4. Van Stock', 'Check remaining stock & empty crates', Package],
              ['Route Master', 'Register new shop on this route & start billing', UserPlus],
            ].map(([t, d, Icon]: any) => (
              <Still key={t} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <Icon size={18} className="text-slate-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">{t}</div>
                  <div className="text-[10px] text-slate-500 leading-snug">{d}</div>
                </div>
              </Still>
            ))}
            <Tap onTap={next} className="w-full flex items-center gap-3 rounded-xl border-2 bg-white p-3 text-left" style={{ borderColor: GREEN }}>
              <Truck size={18} style={{ color: GREEN }} className="shrink-0" />
              <span>
                <span className="block text-xs font-bold text-slate-900">3. Record Trip</span>
                <span className="block text-[10px] text-slate-500 leading-snug">Load vehicle run, manage route runs</span>
              </span>
            </Tap>
          </div>
        );
      case 3:
        return (
          <div className="p-4 space-y-3">
            <div className="font-extrabold text-sm text-slate-900">Load Vehicle Run</div>
            {PRODUCTS.map((p) => (
              <Still key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <div className="text-xs font-bold text-slate-800">{p.name}</div>
                  <div className="text-[10px] text-slate-500">Loading {loaded[p.id]} {p.unit}s</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Fewer ${p.name}`}
                    onClick={() => setLoaded((l) => ({ ...l, [p.id]: Math.max(0, l[p.id] - 5) }))}
                    className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-7 text-center text-xs font-bold">{loaded[p.id]}</span>
                  <button
                    type="button"
                    aria-label={`More ${p.name}`}
                    onClick={() => setLoaded((l) => ({ ...l, [p.id]: l[p.id] + 5 }))}
                    className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </Still>
            ))}
            <Tap onTap={next} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
              Load Vehicle Run
            </Tap>
          </div>
        );
      case 4:
        return (
          <div className="p-4 space-y-3">
            <div className="font-extrabold text-sm text-slate-900">New Bill / Sale</div>
            <Still className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
              <Search size={14} /> Search shop name
            </Still>
            {SHOPS.map((s, i) =>
              i === 0 ? (
                <Tap
                  key={s.id}
                  onTap={() => {
                    setShopId(s.id);
                    next();
                  }}
                  className="w-full text-left rounded-xl border-2 bg-white p-3"
                  style={{ borderColor: GREEN }}
                >
                  <span className="block text-xs font-bold text-slate-900">{s.name}</span>
                  <span className="block text-[10px] text-slate-500">
                    {s.area} · Due {rupees(s.due)}
                  </span>
                </Tap>
              ) : (
                <Still key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-bold text-slate-800">{s.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {s.area} · Due {rupees(s.due)}
                  </div>
                </Still>
              ),
            )}
          </div>
        );
      case 5:
        return (
          <div className="p-4 space-y-3">
            <div className="text-[11px] text-slate-500">
              Billing <span className="font-bold text-slate-800">{shop.name}</span>
            </div>
            {PRODUCTS.map((p) => (
              <Still key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <div className="text-xs font-bold text-slate-800">{p.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {rupees(p.price)} per {p.unit}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {(cart[p.id] || 0) > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={`Remove one ${p.name}`}
                        onClick={() => setQty(p.id, -1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold">{cart[p.id]}</span>
                    </>
                  )}
                  <Tap
                    onTap={() => setQty(p.id, 1)}
                    active={itemCount === 0 && p.id === 'jar'}
                    className="w-7 h-7 rounded-lg text-white flex items-center justify-center"
                    style={{ background: GREEN }}
                  >
                    <Plus size={14} />
                  </Tap>
                </div>
              </Still>
            ))}
            <div className="sticky bottom-0 -mx-4 px-4 pt-2 pb-1 bg-slate-50">
              <Tap
                onTap={next}
                disabled={itemCount === 0}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-white text-sm font-bold shadow-lg"
                style={{ background: GREEN }}
              >
                <span>{itemCount} items · {rupees(total)}</span>
                <span>Review &amp; pay</span>
              </Tap>
            </div>
          </div>
        );
      case 6: {
        const modes: { id: PayMode; label: string; Icon: React.ComponentType<any> }[] = [
          { id: 'cash', label: 'Cash', Icon: Banknote },
          { id: 'upi', label: 'UPI / QR', Icon: QrCode },
          { id: 'credit', label: 'Credit (Due)', Icon: Clock },
          { id: 'cheque', label: 'Cheque', Icon: CreditCard },
        ];
        return (
          <div className="p-4 space-y-3">
            <Still className="rounded-xl bg-white border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500">{shop.name}</div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">{itemCount} items</span>
                <span className="text-lg font-extrabold text-slate-900">{rupees(total)}</span>
              </div>
            </Still>
            <div className="grid grid-cols-2 gap-1.5">
              {modes.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border ${
                    mode === id ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                  style={mode === id ? { background: GREEN } : undefined}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-[11px] text-slate-500">Amount received</span>
              <input
                inputMode="numeric"
                value={mode === 'credit' ? '0' : received}
                disabled={mode === 'credit'}
                placeholder={String(total)}
                onChange={(e) => setReceived(e.target.value.replace(/[^0-9]/g, ''))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-100"
              />
            </label>
            <Still
              className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: creditLeft > 0 ? '#FEF3C7' : '#E8F5E9', color: creditLeft > 0 ? '#92400E' : '#1B5E20' }}
            >
              <span>Credit balance remaining</span>
              <span>{rupees(creditLeft)}</span>
            </Still>
            <Tap
              onTap={() => {
                setSold(cart);
                next();
              }}
              className="w-full py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: GREEN }}
            >
              Finalize Sale
            </Tap>
          </div>
        );
      }
      case 7:
        return (
          <div className="p-4 space-y-3 text-center">
            <CheckCircle2 size={44} className="mx-auto mt-2" style={{ color: '#16A34A' }} />
            <div>
              <div className="font-extrabold text-base text-slate-900">Invoice saved</div>
              <div className="text-[11px] text-slate-500">Sample invoice DEMO-0001 · {shop.name}</div>
            </div>
            <Still className="rounded-xl bg-white border border-slate-200 p-3 text-left space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Total</span>
                <span className="font-bold">{rupees(total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Paid now</span>
                <span className="font-bold">{rupees(paidNow)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Added to balance</span>
                <span className="font-bold">{rupees(creditLeft)}</span>
              </div>
            </Still>
            <button
              type="button"
              onClick={() => setNote('In the real app this opens WhatsApp with the invoice ready to send.')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-800"
            >
              <Share2 size={15} /> Share via WhatsApp
            </button>
            <Tap onTap={next} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
              Done
            </Tap>
          </div>
        );
      case 8:
        return (
          <div className="p-4 space-y-3">
            <div className="font-extrabold text-sm text-slate-900">Record Payment</div>
            <Still className="rounded-xl bg-white border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-800">{shop.name}</div>
              <div className="text-[10px] text-slate-500">{shop.area}</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xs text-slate-600">Balance due</span>
                <span className="text-lg font-extrabold" style={{ color: '#B45309' }}>
                  {rupees(dueNow)}
                </span>
              </div>
            </Still>
            <label className="block">
              <span className="text-[11px] text-slate-500">Amount received (cash or UPI)</span>
              <input
                inputMode="numeric"
                value={collect}
                placeholder="e.g. 500"
                onChange={(e) => setCollect(e.target.value.replace(/[^0-9]/g, ''))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
              />
            </label>
            <Still className="text-[11px] text-slate-500">
              Balance after this payment:{' '}
              <span className="font-bold text-slate-800">{rupees(Math.max(0, dueNow - Math.min(dueNow, Number(collect) || 0)))}</span>
            </Still>
            <Tap
              onTap={() => {
                if (collect === '') setCollect(String(Math.min(dueNow, 500)));
                next();
              }}
              className="w-full py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: GREEN }}
            >
              Record payment
            </Tap>
          </div>
        );
      case 9: {
        const rows = PRODUCTS.map((p) => {
          const left = loaded[p.id] - (sold[p.id] || 0);
          return { ...p, left, soldQty: sold[p.id] || 0 };
        }).filter((r) => {
          if (filter === 'available') return r.left > 0;
          if (filter === 'empty') return r.left <= 0;
          if (filter === 'loaded') return loaded[r.id] > 0;
          return true;
        });
        return (
          <div className="p-4 space-y-3">
            <div className="font-extrabold text-sm text-slate-900">Van Stock</div>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'available', 'loaded', 'empty'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border capitalize ${
                    filter === f ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                  style={filter === f ? { background: GREEN } : undefined}
                >
                  {f}
                </button>
              ))}
            </div>
            {rows.map((r) => (
              <Still key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-bold text-slate-800">{r.name}</div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>
                    Left on vehicle: <b className="text-slate-800">{r.left}</b>
                  </span>
                  <span>
                    Sold: <b className="text-slate-800">{r.soldQty}</b>
                  </span>
                </div>
              </Still>
            ))}
            {rows.length === 0 && <Still className="text-xs text-slate-500 text-center py-4">Nothing here yet. Try another filter.</Still>}
          </div>
        );
      }
      case 10:
        return (
          <div className="p-4 space-y-3">
            <div className="font-extrabold text-sm text-slate-900">Trips</div>
            <Still className="rounded-xl bg-white border border-slate-200 p-3 space-y-1.5">
              <div className="text-xs font-bold text-slate-800">Today’s route · in progress</div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Bills</span>
                <b className="text-slate-800">1</b>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Trip sales</span>
                <b className="text-slate-800">{rupees(total)}</b>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Cash collected</span>
                <b className="text-slate-800">{rupees(paidNow + Math.min(dueNow, Number(collect) || 0))}</b>
              </div>
            </Still>
            <Tap onTap={next} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: '#B45309' }}>
              End Trip &amp; Return Stock
            </Tap>
          </div>
        );
      default:
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
            <CheckCircle2 size={48} style={{ color: '#16A34A' }} />
            <div className="font-extrabold text-base text-slate-900">Trip ended</div>
            <p className="text-xs text-slate-500 leading-relaxed">Stock returned. Your bills and payments are with the owner.</p>
          </div>
        );
    }
  })();

  const activeTab = info.tab;

  /* ------------------------------------------------------------------------------------------------ layout */
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Salesman app demo"
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ background: '#0F1F1A' }}
    >
      <style>{`
        @keyframes demoPulse { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.7); } 70% { box-shadow: 0 0 0 10px rgba(245,158,11,0); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
        .demo-tap { animation: demoPulse 1.6s ease-out infinite; outline: 2px solid ${AMBER}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .demo-tap { animation: none; } }
      `}</style>

      <div className="min-h-full max-w-5xl mx-auto px-4 py-4 md:py-8 flex flex-col md:flex-row gap-5 md:gap-10 md:items-center">
        {/* coach */}
        <section className="md:flex-1 text-white order-2 md:order-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-white/60">
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              <X size={14} /> Close demo
            </button>
          </div>

          <div className="h-1 rounded-full bg-white/10 mb-5" aria-hidden>
            <div className="h-1 rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: AMBER }} />
          </div>

          <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            {info.title}
          </h2>
          <p className="text-sm md:text-base text-white/80 leading-relaxed mb-4 max-w-md">{info.what}</p>

          {info.tips && (
            <ul className="space-y-2 mb-4 max-w-md">
              {info.tips.map((t) => (
                <li key={t} className="text-sm text-white/70 leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-400">
                  {t}
                </li>
              ))}
            </ul>
          )}

          {info.action && (
            <div className="mb-6 rounded-xl px-4 py-3 text-sm font-semibold max-w-md" style={{ background: 'rgba(245,158,11,0.15)', color: '#FCD34D' }}>
              {info.action}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={step === 0}
              className="flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={16} /> Back
            </button>
            {step < last ? (
              <button
                type="button"
                onClick={coachNext}
                className="flex items-center gap-1 rounded-xl px-5 py-2.5 text-sm font-bold cursor-pointer"
                style={{ background: AMBER, color: '#1F2937' }}
              >
                {step === 0 ? 'Start' : 'Next'} <ChevronRight size={16} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={restart}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  <RotateCcw size={15} /> Run it again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold cursor-pointer"
                  style={{ background: AMBER, color: '#1F2937' }}
                >
                  Close demo
                </button>
              </>
            )}
          </div>
        </section>

        {/* phone */}
        <section className="order-1 md:order-2 flex justify-center">
          <div className="relative w-full max-w-[340px] rounded-[2rem] p-2.5 shadow-2xl" style={{ background: '#1B2B26', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="relative rounded-[1.5rem] overflow-hidden bg-slate-50 flex flex-col" style={{ height: 'min(620px, 70vh)' }}>
              <div className="text-center text-[10px] font-bold py-1" style={{ background: AMBER, color: '#1F2937' }}>
                DEMO with sample data. Nothing is saved.
              </div>
              <div className="relative flex-1 overflow-y-auto">{screen}</div>
              {showPhoneNav && (
                <nav className="grid grid-cols-6 border-t border-slate-200 bg-white" aria-label="Sample bottom bar">
                  {NAV.map(({ id, label, Icon }) => {
                    const on = id === activeTab;
                    const tapTrips = step === 9 && id === 'trips';
                    const inner = (
                      <>
                        <Icon size={16} />
                        <span className="text-[9px] font-semibold leading-none mt-0.5">{label}</span>
                      </>
                    );
                    return tapTrips ? (
                      <Tap
                        key={id}
                        onTap={next}
                        className="flex flex-col items-center justify-center py-2 text-slate-500"
                      >
                        {inner}
                      </Tap>
                    ) : (
                      <Still
                        key={id}
                        className="flex flex-col items-center justify-center py-2"
                        style={{ color: on ? GREEN : '#94A3B8', fontWeight: on ? 700 : 500 }}
                      >
                        {inner}
                      </Still>
                    );
                  })}
                </nav>
              )}
              {note && (
                <div className="absolute left-3 right-3 bottom-16 rounded-xl px-3 py-2 text-[11px] font-semibold text-white shadow-lg" style={{ background: '#1F2937' }} role="status">
                  {note}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SalesmanDemo;
