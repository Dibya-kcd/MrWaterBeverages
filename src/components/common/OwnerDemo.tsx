/**
 * Guided demo for the OWNER, shown BEFORE sign-in.
 *
 * Safe by construction: this file imports nothing from the app's data layer (no ledger context, no cloud client, no
 * storage helpers) and makes no network request. Every shop, product, price and number below is invented sample
 * data held in this component's own memory; closing the demo throws it all away. tests/demoIsolation.test.ts
 * fails the build if someone later adds such an import.
 *
 * How it is built: the guide has STEPS. Each step belongs to one screen of the real app (Home, Sell, Parties,
 * Products, Inventory, Supplier credits, Payments, Crates & deposits, Promotions, Trips, Reports, Settings).
 * What the sample screen shows is worked out from the current step, so Back / Next / Jump always stay in sync.
 * The owner can also open any screen from the sample menu at any time to look around.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  ShoppingCart,
  Users,
  BookOpen,
  Boxes,
  FileText,
  Wallet,
  Container,
  Tag,
  Truck,
  BarChart3,
  Settings,
  CheckCircle2,
  Plus,
  Minus,
  Search,
  Upload,
  AlertTriangle,
  Share2,
  Printer,
  Banknote,
  QrCode,
  Clock,
  CreditCard,
  Info,
} from 'lucide-react';

/* ----------------------------------------------------------------------------------------------- sample data */
const GREEN = '#0d4a3a';
const AMBER = '#F59E0B';

type ScreenId =
  | 'dashboard'
  | 'billing'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'supplierSchemes'
  | 'payments'
  | 'crates'
  | 'promotions'
  | 'trips'
  | 'reports'
  | 'settings';
type ViewId = ScreenId | 'intro' | 'finish';
type PId = 'jar' | 'l1' | 'ml500';
type Qty = Record<PId, number>;
type PayMode = 'cash' | 'upi' | 'credit' | 'cheque';

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const ZERO: Qty = { jar: 0, l1: 0, ml500: 0 };

const PRODUCTS: { id: PId; name: string; unit: string; price: number; start: number; low: number }[] = [
  { id: 'jar', name: '20 L water jar', unit: 'jar', price: 60, start: 120, low: 30 },
  { id: 'l1', name: '1 L bottle, case of 12', unit: 'case', price: 130, start: 60, low: 20 },
  { id: 'ml500', name: '500 ml bottle, case of 24', unit: 'case', price: 150, start: 45, low: 20 },
];

const CUSTOMERS = [
  { id: 'c1', name: 'Sri Lakshmi Stores', area: 'Main Road', beat: 'Beat A', due: 1250, crates: 12 },
  { id: 'c2', name: 'Maa Tarini Kirana', area: 'Station Chowk', beat: 'Beat A', due: 0, crates: 0 },
  { id: 'c3', name: 'Hotel Sagar', area: 'Bus Stand', beat: 'Beat B', due: 480, crates: 6 },
  { id: 'c4', name: 'Sai Departmental', area: 'Market Lane', beat: 'Beat B', due: 2100, crates: 0 },
];

const INWARD = [
  { id: 'jar' as PId, qty: 40, rate: 42, expiry: dayOffset(150) },
  { id: 'l1' as PId, qty: 30, rate: 95, expiry: '' },
  { id: 'ml500' as PId, qty: 24, rate: 110, expiry: dayOffset(180) },
];
const NEW_EXPIRY = dayOffset(170);

const SETTINGS_TABS = [
  { id: 'business', label: 'Business & GST', blurb: 'Your company name, address and GSTIN. They print on every invoice.' },
  { id: 'billing', label: 'Billing Rules', blurb: 'How bills behave: default invoice type, numbering and payment rules.' },
  { id: 'warehouses', label: 'Warehouses & Fleet', blurb: 'Every godown and every vehicle. Stock is kept per godown.' },
  { id: 'beats', label: 'Beats', blurb: 'Group your shops by route so you can bill, collect and report beat by beat.' },
  { id: 'staff', label: 'Staff & Roles', blurb: 'Add salesmen and give each a mobile number and a PIN. Use 6 digits.' },
  { id: 'display', label: 'Display', blurb: 'Text size: Standard, Large or Extra Large, for easier reading.' },
  { id: 'cloud', label: 'Cloud DB', blurb: 'Shows whether your data is saved to the cloud, and lets you sync.' },
  { id: 'backups', label: 'Backups', blurb: 'Download a backup file of your data. Take one regularly.' },
] as const;
type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

const SETTINGS_ROWS: Record<SettingsTabId, [string, string][]> = {
  business: [],
  billing: [
    ['Default document', 'Non-GST Retail Bill'],
    ['Invoice numbers', 'Continue in order, never repeat'],
    ['Allow credit sales', 'Yes'],
  ],
  warehouses: [
    ['Main godown', 'Godown'],
    ['Cold store', 'Godown'],
    ['EV-01', 'Vehicle (van)'],
  ],
  beats: [
    ['Beat A', 'Main Road, Station Chowk'],
    ['Beat B', 'Bus Stand, Market Lane'],
  ],
  staff: [
    ['Ravi Kumar', 'Salesman · PIN set'],
    ['Anita Das', 'Counter staff · PIN set'],
  ],
  display: [
    ['Standard (1.00x)', 'Selected'],
    ['Large (1.25x)', ''],
    ['Extra Large (1.55x)', ''],
  ],
  cloud: [
    ['Status', 'Connected (sample)'],
    ['Last sync', 'Just now'],
  ],
  backups: [
    ['Download backup', 'Saves one file to this device'],
    ['Danger operations', 'Clear data. Needs confirmation.'],
  ],
};

const PROMO_TYPES = [
  { id: 'Buy X Get X', how: 'Buy 10 jars, get 1 jar of the same item free.' },
  { id: 'Buy A Get B Free', how: 'Buy 5 cases of 1 L, get 1 case of 500 ml free.' },
  { id: 'Group Buy N Get M', how: 'Buy any 10 cases from a group of products, get 1 case free.' },
  { id: 'Combo Bundle', how: 'A fixed set of products sold together at one price.' },
  { id: 'Percent off', how: '5% off on all 500 ml cases.' },
  { id: 'Flat off', how: '₹50 off on any bill above ₹1,000.' },
];

const REPORTS = [
  { id: 'sales', label: 'Sales & Revenue', blurb: 'Day-wise totals, every invoice, and what each product dispatched.' },
  { id: 'margin', label: 'Sales, Margin & P&L', blurb: 'Profit on each sale after the cost of the stock you sold.' },
  { id: 'netProfit', label: 'Net Profit & Salary', blurb: 'Profit after expenses and salaries.' },
  { id: 'dispositions', label: 'Returns, Free & Claims', blurb: 'Returns, free goods and claims you can make on the company.' },
  { id: 'purchases', label: 'Inward & Purchases', blurb: 'Everything you bought, supplier by supplier.' },
  { id: 'receivables', label: 'Party Credit & Receivables', blurb: 'Who owes you money, and how much.' },
  { id: 'inventory', label: 'Inventory & Valuation', blurb: 'Stock on hand and what it is worth.' },
  { id: 'trips', label: 'Vehicle Trips & Logistics', blurb: 'Each trip: loaded, sold, returned and any difference.' },
  { id: 'tax', label: 'GST', blurb: 'Tax summary to hand to your accountant.' },
  { id: 'supplierProfit', label: 'Supplier & Product Profit', blurb: 'Which supplier and which product earns you the most.' },
  { id: 'daybook', label: 'Daily Collection (paid / due)', blurb: 'The day book: cash in, UPI in, credit given.' },
  { id: 'beats', label: 'Beat-wise Sales & Due', blurb: 'Sales and dues for each beat.' },
] as const;
type ReportId = (typeof REPORTS)[number]['id'];

const MENU: { id: ScreenId; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'dashboard', label: 'Home', Icon: Home },
  { id: 'billing', label: 'Sell', Icon: ShoppingCart },
  { id: 'customers', label: 'Parties', Icon: Users },
  { id: 'products', label: 'Products', Icon: BookOpen },
  { id: 'inventory', label: 'Inventory', Icon: Boxes },
  { id: 'supplierSchemes', label: 'Supplier credits', Icon: FileText },
  { id: 'payments', label: 'Payments', Icon: Wallet },
  { id: 'crates', label: 'Crates & deposits', Icon: Container },
  { id: 'promotions', label: 'Promotions', Icon: Tag },
  { id: 'trips', label: 'Trips', Icon: Truck },
  { id: 'reports', label: 'Reports', Icon: BarChart3 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];
const LABEL_OF = (v: ViewId) => MENU.find((m) => m.id === v)?.label || 'Guide';

/* ---------------------------------------------------------------------------------------------------- steps */
interface StepInfo {
  screen: ViewId;
  chapter: string;
  title: string;
  what: string;
  action?: string;
  tips?: string[];
}

const STEPS: StepInfo[] = [
  {
    screen: 'intro',
    chapter: 'Start',
    title: 'How the owner app works',
    what:
      'This tour walks through the whole app in the order you will really use it, one screen at a time. Every shop, product, price and number is made up. Nothing you tap is saved or sent anywhere.',
    tips: [
      'The menu on the left of the sample screen is the real menu. Tap any item to look around whenever you like.',
      'Lost? Use Jump to topic to go straight to a part, or Back to repeat a step.',
    ],
    action: 'Tap Start the tour.',
  },
  {
    screen: 'dashboard',
    chapter: 'Set up once',
    title: 'Home: your day at a glance',
    what:
      'Home shows today’s sales, money collected, money still to receive and low stock. The four big buttons jump to New sale, Inventory, Collect and Trips. On a new setup a Get started list tells you where to begin.',
    tips: ['Needs attention lists things to act on, such as trips with a stock difference or expiry returns.'],
    action: 'Tap 1. Fill your company & GSTIN.',
  },
  {
    screen: 'settings',
    chapter: 'Set up once',
    title: 'Settings: your business',
    what: 'Enter your company name, address and GSTIN once. They print on every invoice you send.',
    tips: ['Check the GSTIN carefully. A wrong number prints on every GST invoice.'],
    action: 'Tap Save business details.',
  },
  {
    screen: 'settings',
    chapter: 'Set up once',
    title: 'Settings: godowns, beats and staff',
    what:
      'Add each godown and vehicle under Warehouses & Fleet. Group shops into routes under Beats. Add your salesmen under Staff & Roles, each with a mobile number and a PIN.',
    tips: [
      'Use a 6-digit PIN for salesmen.',
      'Take a backup now and then under Backups.',
    ],
    action: 'Tap each tab on the sample screen to see what it holds, then tap Next.',
  },
  {
    screen: 'products',
    chapter: 'Set up once',
    title: 'Products: what you sell',
    what:
      'Add every item with its price and GST rate, and say whether the bottle or crate comes back. Stock and billing both use this list.',
    tips: ['Add a product only once. Edit it later if the price changes.'],
    action: 'Tap New product, then tap Save product.',
  },
  {
    screen: 'customers',
    chapter: 'Set up once',
    title: 'Parties: shops and suppliers',
    what:
      'Every shop you sell to and every supplier you buy from is a party. Open a party to see its bills, its payments and what it owes you.',
    tips: ['Shops are matched by name first. The phone number is only a second check.'],
    action: 'Tap Sri Lakshmi Stores to open its ledger.',
  },
  {
    screen: 'inventory',
    chapter: 'Stock in',
    title: 'Stock in: upload the supplier invoice',
    what:
      'When stock arrives, open Inventory, then Inward, then New purchase. Upload or scan the supplier’s invoice. The app reads the products, quantities, schemes and taxes for you.',
    tips: [
      'If the invoice cannot be read, use Open Review (Manual Entry) and type the lines.',
      'A reader can make mistakes. Always check the lines in the next step.',
    ],
    action: 'Tap Upload / Scan invoice.',
  },
  {
    screen: 'inventory',
    chapter: 'Stock in',
    title: 'Check every line',
    what:
      'Review lines shows what was read. A line with no expiry date or a zero rate is marked. Fix it, and choose the godown the stock is going into.',
    action: 'Tap Set expiry on the marked line.',
  },
  {
    screen: 'inventory',
    chapter: 'Stock in',
    title: 'Confirm and post',
    what:
      'Confirm & Post adds the stock to the godown you chose and saves the purchase. Stock only changes at this moment, not before.',
    action: 'Tap Confirm & Post.',
  },
  {
    screen: 'inventory',
    chapter: 'Stock in',
    title: 'Stock: what you have and where',
    what:
      'The Stock tab shows each product in each godown. Compare with the last step: the new quantities are added, and each batch keeps its own expiry date. Low stock turns amber.',
    action: 'Tap Audit.',
  },
  {
    screen: 'inventory',
    chapter: 'Stock in',
    title: 'Audit: count the godown',
    what:
      'Start a count, type what is really on the shelf, and the app shows the difference from the book stock. Do this regularly to catch loss or mistakes early.',
    tips: ['Stock audit is for checking. Fix mistakes through a purchase, a return or a bill, so the history stays clear.'],
    action: 'Tap Start a count, then Finish count.',
  },
  {
    screen: 'billing',
    chapter: 'Sell',
    title: 'Sell 1 of 3: choose the customer',
    what:
      'Open Sell. The three pills at the top are Customer, Products and Save bill. First pick the shop, check the date, choose where the stock comes from, and choose the document: a Non-GST Retail Bill or a GST Tax Invoice.',
    tips: ['Choose a GST Tax Invoice only for shops with a GSTIN.'],
    action: 'Pick the shop, then tap Continue to Beverages & Crates.',
  },
  {
    screen: 'billing',
    chapter: 'Sell',
    title: 'Sell 2 of 3: add products',
    what:
      'Tap + for each product. The total updates as you go, and any promotion that matches is applied by itself. The grey number is the stock left.',
    tips: ['Try 10 jars. A free jar is added by the sample promotion.'],
    action: 'Add at least one product, then tap Review & save.',
  },
  {
    screen: 'billing',
    chapter: 'Sell',
    title: 'Sell 3 of 3: save the bill',
    what:
      'Choose how the shop pays: Cash, UPI / QR, Credit (Due) or Cheque. Enter the amount received. Whatever is not paid now stays on the shop’s account. Then save the bill and send it.',
    tips: ['Try Credit (Due) or a smaller amount and watch the Credit Balance Remaining change.'],
    action: 'Tap Save bill, then tap Done.',
  },
  {
    screen: 'trips',
    chapter: 'Deliver',
    title: 'Trips: send a vehicle out',
    what:
      'Tap New trip. Choose the vehicle, the route, the salesman and the stock to load from the godown. Then assign the day’s bills to the trip.',
    tips: ['Loading takes stock out of the godown, so you always know what is on the vehicle.'],
    action: 'Tap Create trip.',
  },
  {
    screen: 'trips',
    chapter: 'Deliver',
    title: 'Close the trip: record returned stock',
    what:
      'When the vehicle comes back, open the trip and tap Record returned stock & close trip. Enter what came back. If something is short, you must give a reason, so nothing disappears quietly.',
    tips: ['Try returning fewer jars than expected and see the reason box appear.'],
    action: 'Tap Close trip.',
  },
  {
    screen: 'payments',
    chapter: 'Collect',
    title: 'Payments: collect what shops owe',
    what:
      'When a shop pays an old balance, open Payments, choose the shop and record the cash or UPI you received. The balance goes down by that amount. You can send the shop a WhatsApp receipt straight away.',
    tips: ['You can also record a payment from the shop’s own page under Parties.'],
    action: 'Tap Record receipt, then Continue.',
  },
  {
    screen: 'crates',
    chapter: 'Collect',
    title: 'Crates & deposits',
    what:
      'Crates and bottles that go out must come back. This screen shows how many each party still holds, and the deposits you hold. Record empties returned, empties issued, a deposit collected or a deposit refunded.',
    action: 'Tap Save record, then Continue.',
  },
  {
    screen: 'promotions',
    chapter: 'Offers & credits',
    title: 'Promotions: offers for your shops',
    what:
      'Set up offers once and billing applies them for you. There are six kinds. Tap each kind below to see an example.',
    action: 'Tap a few kinds, then tap Next.',
  },
  {
    screen: 'supplierSchemes',
    chapter: 'Offers & credits',
    title: 'Supplier credits',
    what:
      'Keep track of what your suppliers owe you: Schemes they announced, Credit notes they issue, and the Monthly volume incentive. Use Record receipt when a supplier pays or adjusts.',
    action: 'Tap each tab, then tap Next.',
  },
  {
    screen: 'reports',
    chapter: 'Check',
    title: 'Reports: see how the business is doing',
    what:
      'Twelve reports cover sales, profit, purchases, stock, trips, GST and more. Most can be filtered by date and downloaded as a file for your accountant.',
    tips: ['Open Party Credit & Receivables every week to see who owes you money.'],
    action: 'Tap Party Credit & Receivables, then tap Next.',
  },
  {
    screen: 'finish',
    chapter: 'Finish',
    title: 'Your day, in order',
    what:
      'That is the whole app. Set up once. Then every day: stock in, sell, send trips, collect payments and check the numbers. Come back to this tour any time from the sign-in screen.',
    action: 'Close the demo and sign in.',
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
    className={`${className} ${active && !disabled ? 'demo-tap' : ''} disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
  >
    {children}
  </button>
);

const Card: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({
  className = '',
  style,
  children,
}) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-3 ${className}`} style={style}>
    {children}
  </div>
);

const Heading: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <div className="mb-1">
    <div className="font-extrabold text-base text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
      {title}
    </div>
    {sub && <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>}
  </div>
);

const Chip: React.FC<{ tone?: 'green' | 'amber' | 'red' | 'slate'; children: React.ReactNode }> = ({
  tone = 'slate',
  children,
}) => {
  const map = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-rose-50 text-rose-800 border-rose-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${map[tone]}`}>{children}</span>;
};

const Row: React.FC<{ a: React.ReactNode; b?: React.ReactNode; strong?: boolean }> = ({ a, b, strong }) => (
  <div className="flex items-center justify-between gap-2 text-[11px] py-0.5">
    <span className="text-slate-500">{a}</span>
    <span className={strong ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}>{b}</span>
  </div>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800">{value}</div>
  </div>
);

const Pills: React.FC<{
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}> = ({ items, value, onChange }) => (
  <div className="flex gap-1 overflow-x-auto rounded-full bg-[#ebe8e1] p-1">
    {items.map((it) => (
      <button
        key={it.id}
        type="button"
        onClick={() => onChange(it.id)}
        className="shrink-0 flex-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap cursor-pointer"
        style={value === it.id ? { background: '#fff', color: GREEN, boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: '#64748B' }}
      >
        {it.label}
      </button>
    ))}
  </div>
);

/* ------------------------------------------------------------------------------------------------ the demo */
export const OwnerDemo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [view, setView] = useState<ViewId>('intro');
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // screen-level choices
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('business');
  const [invTab, setInvTab] = useState('realtime');
  const [billTab, setBillTab] = useState('create');
  const [tripTab, setTripTab] = useState('active');
  const [supTab, setSupTab] = useState('schemes');
  const [promoType, setPromoType] = useState(PROMO_TYPES[0].id);
  const [report, setReport] = useState<ReportId | null>(null);

  // things the owner "does" in the demo
  const [productForm, setProductForm] = useState(false);
  const [productAdded, setProductAdded] = useState(false);
  const [openParty, setOpenParty] = useState<string | null>(null);
  const [expirySet, setExpirySet] = useState(false);
  const [auditPhase, setAuditPhase] = useState<'idle' | 'counting' | 'done'>('idle');
  const [counted, setCounted] = useState<Qty>(ZERO);
  const [cust, setCust] = useState('c1');
  const [docType, setDocType] = useState<'retail' | 'gst'>('retail');
  const [cart, setCart] = useState<Qty>(ZERO);
  const [mode, setMode] = useState<PayMode>('cash');
  const [received, setReceived] = useState('');
  const [snap, setSnap] = useState<null | { cust: string; qty: Qty; free: number; total: number; paid: number; credit: number }>(null);
  const [returned, setReturned] = useState(3);
  const [reason, setReason] = useState('');
  const [payAmt, setPayAmt] = useState('');
  const [payMode, setPayMode] = useState<'cash' | 'upi'>('cash');
  const [payDone, setPayDone] = useState(false);
  const [crateKind, setCrateKind] = useState('Empties returned');
  const [crateDone, setCrateDone] = useState(false);

  const info = STEPS[step];
  const last = STEPS.length - 1;

  /* ------------------------------------------------------------------------------------------ derived data */
  const billDone = step >= 14 || (step === 13 && !!snap);
  const posted = step >= 9;
  const tripStage: 'none' | 'new' | 'out' | 'closed' = step < 14 ? 'none' : step === 14 ? 'new' : step === 15 ? 'out' : 'closed';

  const freeJars = Math.floor(cart.jar / 10);
  const total = PRODUCTS.reduce((s, p) => s + cart[p.id] * p.price, 0);
  const itemCount = cart.jar + cart.l1 + cart.ml500;
  const receivedNum = mode === 'credit' ? 0 : received === '' ? total : Math.max(0, Number(received) || 0);
  const paidNow = Math.min(total, receivedNum);
  const creditLeft = total - paidNow;

  const stockOf = (id: PId) => {
    const p = PRODUCTS.find((x) => x.id === id)!;
    const added = posted ? INWARD.find((l) => l.id === id)!.qty : 0;
    const out = billDone && snap ? snap.qty[id] + (id === 'jar' ? snap.free : 0) : 0;
    return p.start + added - out;
  };

  const payCust = CUSTOMERS.find((c) => c.id === cust) || CUSTOMERS[0];
  const payAmount = Math.max(0, Number(payAmt) || 0);
  const dueOf = (id: string) => {
    const base = CUSTOMERS.find((c) => c.id === id)!.due;
    const billed = billDone && snap && snap.cust === id ? snap.credit : 0;
    const paid = payDone && id === cust ? payAmount : 0;
    return Math.max(0, base + billed - paid);
  };
  const cratesOf = (id: string) => {
    const base = CUSTOMERS.find((c) => c.id === id)!.crates;
    return crateDone && id === 'c1' ? Math.max(0, base - 5) : base;
  };
  const totalDue = CUSTOMERS.reduce((s, c) => s + dueOf(c.id), 0);
  const expectedBack = 3;
  const shortBy = Math.max(0, expectedBack - returned);

  /* --------------------------------------------------------------------------------------------- behaviour */
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
    const t = setTimeout(() => setNote(null), 2800);
    return () => clearTimeout(t);
  }, [note]);

  // Moving between steps: show that step's screen, and undo anything that belongs to a later step.
  useEffect(() => {
    setView(STEPS[step].screen);
    if (step === 2) setSettingsTab('business');
    if (step === 3) setSettingsTab('warehouses');
    if (step >= 6 && step <= 8) setInvTab('consignments');
    if (step === 9) setInvTab('realtime');
    if (step === 10) setInvTab('audit');
    if (step >= 11 && step <= 13) setBillTab('create');
    if (step === 14 || step === 15) setTripTab('active');
    if (step === 16) setTripTab('history');
    if (step === 19) setSupTab('schemes');
    if (step < 4) {
      setProductAdded(false);
      setProductForm(false);
    }
    if (step < 7) setExpirySet(false);
    if (step < 10) setAuditPhase('idle');
    if (step < 13) setSnap(null);
    if (step < 15) {
      setReturned(3);
      setReason('');
    }
    if (step < 16) setPayDone(false);
    if (step < 17) setCrateDone(false);
    if (step < 20) setReport(null);
  }, [step]);

  const go = (n: number) => setStep(Math.max(0, Math.min(last, n)));
  const next = () => go(step + 1);
  const restart = () => {
    setStep(0);
    setCart(ZERO);
    setCust('c1');
    setMode('cash');
    setReceived('');
    setDocType('retail');
    setPayAmt('');
    setPayMode('cash');
    setCrateKind('Empties returned');
    setOpenParty(null);
    setNote(null);
  };

  const makeSnap = () => ({ cust, qty: { ...cart }, free: freeJars, total, paid: paidNow, credit: creditLeft });

  // The coach panel's Next button does what the glowing control does, filling in sample data when needed.
  const coachNext = () => {
    if (step === 4) setProductAdded(true);
    if (step === 7 || step === 8) setExpirySet(true);
    if (step === 10 && auditPhase !== 'done') {
      setCounted({ jar: stockOf('jar') - 2, l1: stockOf('l1'), ml500: stockOf('ml500') });
      setAuditPhase('done');
    }
    if (step === 12 && itemCount === 0) setCart({ jar: 10, l1: 2, ml500: 0 });
    if (step === 13 && !snap) {
      const c = itemCount === 0 ? { jar: 10, l1: 2, ml500: 0 } : cart;
      const t = PRODUCTS.reduce((s, p) => s + c[p.id] * p.price, 0);
      const pd = mode === 'credit' ? 0 : received === '' ? t : Math.min(t, Math.max(0, Number(received) || 0));
      setSnap({ cust, qty: { ...c }, free: Math.floor(c.jar / 10), total: t, paid: pd, credit: t - pd });
    }
    if (step === 15) {
      setReturned(expectedBack);
      setReason('');
    }
    if (step === 16) {
      if (payAmt === '') setPayAmt(String(Math.min(dueOf(cust), 500) || 500));
      setPayDone(true);
    }
    if (step === 17) setCrateDone(true);
    next();
  };

  // A guided control: it glows and works only on its own step; elsewhere it explains why not.
  const tapAt = (n: number, fn: () => void) => () => {
    if (step === n) fn();
    else setNote(step < n ? 'Not there yet. Tap Next in the guide to reach this step.' : 'You already did this step. Tap Back in the guide to try it again.');
  };
  const setQty = (id: PId, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, c[id] + d)) }));

  /* ------------------------------------------------------------------------------------------ the screens */
  const screenIntro = (
    <div className="space-y-3">
      <Heading title="The order of work" sub="Sample Aqua Distributors · demo with sample data" />
      {[
        ['1', 'Set up once', 'Settings, Products, Parties'],
        ['2', 'Stock in', 'Inventory › Inward, then Audit'],
        ['3', 'Sell', 'Sell: Customer, Products, Save bill'],
        ['4', 'Deliver', 'Trips: load, then close'],
        ['5', 'Collect', 'Payments and Crates & deposits'],
        ['6', 'Check', 'Reports and the Home screen'],
      ].map(([n, t, d]) => (
        <Card key={n} className="flex items-center gap-3">
          <span className="w-7 h-7 shrink-0 rounded-full text-white text-xs font-extrabold flex items-center justify-center" style={{ background: GREEN }}>
            {n}
          </span>
          <span>
            <span className="block text-xs font-bold text-slate-900">{t}</span>
            <span className="block text-[11px] text-slate-500">{d}</span>
          </span>
        </Card>
      ))}
      <Tap onTap={tapAt(0, next)} active={step === 0} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
        Start the tour
      </Tap>
    </div>
  );

  const screenDashboard = (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 text-white" style={{ background: GREEN }}>
        <div className="text-[11px] text-white/70">Today · sample</div>
        <div className="text-2xl font-extrabold tabular-nums">{rupees(18400 + (billDone && snap ? snap.total : 0))}</div>
        <div className="text-[11px] text-white/70">Sales so far</div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[
            ['🛒', 'New sale'],
            ['📦', 'Inventory'],
            ['💵', 'Collect'],
            ['🚚', 'Trips'],
          ].map(([i, l]) => (
            <div key={l} className="rounded-xl bg-white/10 border border-white/10 py-2 text-center">
              <div className="text-base">{i}</div>
              <div className="text-[10px] font-semibold">{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Card><div className="text-[10px] font-bold uppercase text-slate-500">Collected</div><div className="text-sm font-extrabold tabular-nums">{rupees(11250 + (billDone && snap ? snap.paid : 0) + (payDone ? payAmount : 0))}</div></Card>
        <Card><div className="text-[10px] font-bold uppercase text-slate-500">To receive</div><div className="text-sm font-extrabold tabular-nums">{rupees(totalDue)}</div></Card>
        <Card><div className="text-[10px] font-bold uppercase text-slate-500">Low stock</div><div className="text-sm font-extrabold tabular-nums">{PRODUCTS.filter((p) => stockOf(p.id) < p.low).length}</div></Card>
      </div>
      <Card>
        <div className="text-xs font-bold text-slate-900 mb-1">Get started</div>
        <Tap onTap={tapAt(1, next)} active={step === 1} className="block text-left text-xs font-semibold py-1 px-1 rounded" style={{ color: GREEN }}>
          1. Fill your company & GSTIN
        </Tap>
        <div className="text-xs font-semibold py-1 px-1" style={{ color: GREEN }}>2. Add products</div>
        <div className="text-xs font-semibold py-1 px-1" style={{ color: GREEN }}>3. Add suppliers & customers</div>
      </Card>
      <Card>
        <div className="text-xs font-bold text-slate-900 mb-1">Needs attention</div>
        <Row a="Expiry returns to act on" b="2" />
        <Row a="Trips with a stock difference" b="0" />
      </Card>
    </div>
  );

  const screenSettings = (
    <div className="space-y-3">
      <Heading title="Settings" />
      <Pills items={SETTINGS_TABS.map((t) => ({ id: t.id, label: t.label }))} value={settingsTab} onChange={(id) => setSettingsTab(id as SettingsTabId)} />
      <p className="text-[11px] text-slate-500 leading-snug">{SETTINGS_TABS.find((t) => t.id === settingsTab)?.blurb}</p>
      {settingsTab === 'business' ? (
        <Card className="space-y-2">
          <Field label="Company name" value="Sample Aqua Distributors" />
          <Field label="GSTIN" value="21ABCDE1234F1Z5 (sample)" />
          <Field label="Address" value="12 Main Road, Sample Town" />
          <Tap onTap={tapAt(2, next)} active={step === 2} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Save business details
          </Tap>
        </Card>
      ) : (
        <Card>
          {SETTINGS_ROWS[settingsTab].map(([a, b]) => (
            <Row key={a} a={a} b={b} />
          ))}
        </Card>
      )}
    </div>
  );

  const screenProducts = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <Heading title="Products" sub="Everything you sell" />
        <Tap onTap={tapAt(4, () => setProductForm(true))} active={step === 4 && !productForm} className="shrink-0 flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: GREEN }}>
          <Plus size={13} /> New product
        </Tap>
      </div>
      {productForm && !productAdded && (
        <Card className="space-y-2">
          <Field label="Product name" value="Soda 250 ml, case of 24" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Price per case" value="₹180" />
            <Field label="GST rate (sample)" value="18%" />
          </div>
          <Field label="Returnable crates / bottles" value="Yes, crate comes back" />
          <Tap onTap={tapAt(4, () => { setProductAdded(true); next(); })} active={step === 4} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Save product
          </Tap>
        </Card>
      )}
      {[
        ...PRODUCTS.map((p) => ({ key: p.id, name: p.name, price: `${rupees(p.price)} per ${p.unit}`, stock: `${stockOf(p.id)} ${p.unit}s` })),
        ...(productAdded ? [{ key: 'soda', name: 'Soda 250 ml, case of 24', price: '₹180 per case', stock: '0 cases' }] : []),
      ].map((r) => (
        <Card key={r.key} className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-900">{r.name}</div>
            <div className="text-[11px] text-slate-500">{r.price}</div>
          </div>
          <Chip>{r.stock}</Chip>
        </Card>
      ))}
    </div>
  );

  const screenCustomers = (() => {
    const c = CUSTOMERS.find((x) => x.id === openParty);
    if (c) {
      const billed = billDone && snap && snap.cust === c.id;
      return (
        <div className="space-y-3">
          <button type="button" onClick={() => setOpenParty(null)} className="text-[11px] font-bold cursor-pointer" style={{ color: GREEN }}>
            ← All parties
          </button>
          <Heading title={c.name} sub={`${c.area} · ${c.beat}`} />
          <Card className="space-y-0.5">
            <Row a="Balance due" b={rupees(dueOf(c.id))} strong />
            <Row a="Crates held" b={String(cratesOf(c.id))} />
          </Card>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ledger</div>
          <Card>
            {billed && snap && <Row a={`Bill INV-1062 · today`} b={`${rupees(snap.total)} (${rupees(snap.credit)} on credit)`} />}
            {payDone && c.id === cust && <Row a="Payment received · today" b={`− ${rupees(payAmount)}`} />}
            <Row a="Bill INV-1041 · last week" b="₹2,300" />
            <Row a="Payment received · last week" b="− ₹1,050" />
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700">Record payment</div>
            <div className="rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700">New bill</div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">Every bill and payment for this shop is in one list. The balance is worked out from it.</p>
          {step === 5 && (
            <Tap onTap={tapAt(5, next)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
              Got it, continue
            </Tap>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Heading title="Parties" sub="Shops you sell to and suppliers you buy from" />
          <div className="shrink-0 flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: GREEN }}>
            <Plus size={13} /> Add party
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
          <Search size={14} /> Search by name
        </div>
        {CUSTOMERS.map((c) => (
          <Tap
            key={c.id}
            onTap={() => setOpenParty(c.id)}
            active={step === 5 && c.id === 'c1'}
            className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between"
          >
            <span>
              <span className="block text-xs font-bold text-slate-900">{c.name}</span>
              <span className="block text-[11px] text-slate-500">{c.area} · {c.beat}</span>
            </span>
            {dueOf(c.id) > 0 ? <Chip tone="amber">Due {rupees(dueOf(c.id))}</Chip> : <Chip tone="green">Clear</Chip>}
          </Tap>
        ))}
      </div>
    );
  })();

  const screenInventory = (() => {
    const tabs = [
      { id: 'realtime', label: 'Stock' },
      { id: 'consignments', label: 'Inward' },
      { id: 'audit', label: 'Audit' },
      { id: 'dispositions', label: 'Returns' },
      { id: 'transfers', label: 'Transfer' },
    ];
    let body: React.ReactNode = null;

    if (invTab === 'realtime') {
      body = (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">Main godown · {posted ? 'after the new purchase' : 'before the new purchase'}</div>
          {PRODUCTS.map((p) => {
            const q = stockOf(p.id);
            const added = posted ? INWARD.find((l) => l.id === p.id)!.qty : 0;
            return (
              <Card key={p.id}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900">{p.name}</div>
                  {q < p.low ? <Chip tone="amber">Low</Chip> : <Chip tone="green">OK</Chip>}
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="text-lg font-extrabold tabular-nums text-slate-900">{q} <span className="text-[11px] font-semibold text-slate-500">{p.unit}s</span></div>
                  {added > 0 && <Chip tone="green">+{added} new batch · SUP-2291</Chip>}
                </div>
              </Card>
            );
          })}
          {posted && <p className="text-[11px] text-slate-500">Each batch keeps its own expiry date, so you know what to sell first.</p>}
          {step === 9 && invTab === 'realtime' && (
            <Tap onTap={tapAt(9, next)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
              Open Audit
            </Tap>
          )}
        </div>
      );
    } else if (invTab === 'consignments') {
      if (step <= 6) {
        body = (
          <div className="space-y-3">
            <Card className="text-center space-y-2 py-5">
              <Upload size={28} className="mx-auto text-slate-400" />
              <div className="text-xs font-bold text-slate-900">New purchase · Upload supplier invoice</div>
              <div className="text-[11px] text-slate-500">Photo or PDF. Products, quantity, schemes and taxes are read for you.</div>
              <Tap onTap={tapAt(6, next)} active={step === 6} className="px-4 py-2.5 rounded-xl text-white text-xs font-bold" style={{ background: GREEN }}>
                Upload / Scan invoice
              </Tap>
            </Card>
            <div className="text-center text-[11px] font-semibold" style={{ color: GREEN }}>Open Review (Manual Entry)</div>
          </div>
        );
      } else {
        const canPost = expirySet && step >= 8;
        body = (
          <div className="space-y-2">
            <ol className="flex items-center gap-1.5 text-[10px] font-bold">
              <li className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">✓ Upload / Scan</li>
              <li className="text-slate-300">/</li>
              <li className="rounded-md px-2 py-1 text-white" style={{ background: GREEN }}>Review lines</li>
            </ol>
            <Card className="space-y-0.5">
              <Row a="Supplier" b="Blue Spring Beverages" />
              <Row a="Invoice" b="SUP-2291" />
              <Row a="Into godown" b="Main godown" />
            </Card>
            {INWARD.map((l) => {
              const p = PRODUCTS.find((x) => x.id === l.id)!;
              const missing = l.expiry === '' && !expirySet;
              return (
                <Card key={l.id} className={missing ? 'border-amber-300 bg-amber-50/50' : ''}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900">{p.name}</div>
                    <div className="text-[11px] font-bold text-slate-700">{l.qty} {p.unit}s · {rupees(l.rate)}</div>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Expiry: {l.expiry || (expirySet ? NEW_EXPIRY : 'missing')}</span>
                    {missing ? (
                      <Tap onTap={tapAt(7, () => { setExpirySet(true); })} active={step === 7} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-amber-400 text-slate-900">
                        <AlertTriangle size={12} /> Set expiry
                      </Tap>
                    ) : (
                      <Chip tone="green">Checked</Chip>
                    )}
                  </div>
                </Card>
              );
            })}
            {step === 7 && expirySet && (
              <Tap onTap={tapAt(7, next)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
                Looks right, go to Confirm
              </Tap>
            )}
            {step >= 8 && (
              <>
                <p className="text-[11px] text-slate-500 leading-snug">Confirming adds this stock to Main godown, saves the purchase and records the batches.</p>
                <Tap onTap={tapAt(8, next)} active={step === 8 && canPost} disabled={!canPost} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
                  Confirm & Post
                </Tap>
                {!canPost && <p className="text-[11px] text-amber-700">One line still has no expiry date. Tap Back, or Next in the guide, to fix it.</p>}
              </>
            )}
          </div>
        );
      }
    } else if (invTab === 'audit') {
      body = (
        <div className="space-y-2">
          {auditPhase === 'idle' && (
            <Card className="text-center space-y-2 py-5">
              <div className="text-xs font-bold text-slate-900">Count the godown</div>
              <div className="text-[11px] text-slate-500">Type what you really have. The app compares it with the book.</div>
              <Tap
                onTap={tapAt(10, () => {
                  setCounted({ jar: stockOf('jar') - 2, l1: stockOf('l1'), ml500: stockOf('ml500') });
                  setAuditPhase('counting');
                })}
                active={step === 10}
                className="px-4 py-2.5 rounded-xl text-white text-xs font-bold"
                style={{ background: GREEN }}
              >
                Start a count
              </Tap>
            </Card>
          )}
          {auditPhase !== 'idle' && (
            <>
              {PRODUCTS.map((p) => {
                const diff = counted[p.id] - stockOf(p.id);
                return (
                  <Card key={p.id}>
                    <div className="text-xs font-bold text-slate-900">{p.name}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Book: {stockOf(p.id)}</span>
                      <span className="flex items-center gap-1.5">
                        <button type="button" aria-label={`Count fewer ${p.name}`} disabled={auditPhase === 'done'} onClick={() => setCounted((c) => ({ ...c, [p.id]: Math.max(0, c[p.id] - 1) }))} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-40"><Minus size={12} /></button>
                        <b className="w-8 text-center text-slate-900">{counted[p.id]}</b>
                        <button type="button" aria-label={`Count more ${p.name}`} disabled={auditPhase === 'done'} onClick={() => setCounted((c) => ({ ...c, [p.id]: c[p.id] + 1 }))} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-40"><Plus size={12} /></button>
                      </span>
                      {diff === 0 ? <Chip tone="green">Matches</Chip> : <Chip tone="red">{diff > 0 ? `+${diff}` : diff} difference</Chip>}
                    </div>
                  </Card>
                );
              })}
              {auditPhase === 'counting' && (
                <Tap onTap={tapAt(10, () => { setAuditPhase('done'); })} active={step === 10} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
                  Finish count
                </Tap>
              )}
              {auditPhase === 'done' && (
                <Card className="border-amber-300 bg-amber-50/60 text-[11px] text-amber-900 leading-snug">
                  The count is saved. Differences are listed so you can find out why. Look at the last purchase, returns and breakage first.
                </Card>
              )}
              {auditPhase === 'done' && step === 10 && (
                <Tap onTap={tapAt(10, next)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
                  Continue
                </Tap>
              )}
            </>
          )}
        </div>
      );
    } else if (invTab === 'dispositions') {
      body = (
        <div className="space-y-2">
          <Card>
            <div className="text-xs font-bold text-slate-900">Expiry returns tracker</div>
            <p className="text-[11px] text-slate-500 leading-snug mt-1">Bottles near or past expiry. Track each one from “to act on” to “claim with the company”.</p>
            <Row a="Batch SUP-2088 · 500 ml" b="14 cases · to act on" />
            <Row a="Batch SUP-2102 · 1 L" b="6 cases · with company" />
          </Card>
        </div>
      );
    } else {
      body = (
        <Card className="space-y-2">
          <div className="text-xs font-bold text-slate-900">Move stock between godowns</div>
          <Field label="From" value="Main godown" />
          <Field label="To" value="Cold store" />
          <Field label="Product and quantity" value="20 L water jar · 20" />
          <p className="text-[11px] text-slate-500">The total stays the same. Only the place changes.</p>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        <Heading title="Inventory" sub="Stock, purchases, counts, returns and transfers" />
        <Pills items={tabs} value={invTab} onChange={setInvTab} />
        {body}
      </div>
    );
  })();

  const screenBilling = (() => {
    const stage = step === 11 ? 'party' : step === 12 ? 'products' : step === 13 ? 'settle' : view === 'billing' && step > 13 ? 'settle' : 'party';
    const pills = [
      { id: 'party', label: 'Customer' },
      { id: 'products', label: 'Products' },
      { id: 'settle', label: 'Save bill' },
    ];
    if (billTab === 'history') {
      return (
        <div className="space-y-3">
          <Heading title="Sell" />
          <Pills items={[{ id: 'create', label: 'New bill' }, { id: 'history', label: 'History' }]} value={billTab} onChange={setBillTab} />
          {billDone && snap && (
            <Card><Row a="INV-1062 · today" b={rupees(snap.total)} /></Card>
          )}
          <Card><Row a="INV-1061 · today" b="₹1,800" /></Card>
          <Card><Row a="INV-1060 · yesterday" b="₹4,350" /></Card>
          <p className="text-[11px] text-slate-500 leading-snug">History lets you open a bill, edit it or cancel it. Stock and payments are corrected for you, after you confirm.</p>
        </div>
      );
    }
    let body: React.ReactNode;
    if (stage === 'party') {
      body = (
        <div className="space-y-2">
          {CUSTOMERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCust(c.id)}
              className="w-full text-left rounded-xl border bg-white p-3 cursor-pointer"
              style={cust === c.id ? { borderColor: GREEN, borderWidth: 2 } : { borderColor: '#E2E8F0' }}
            >
              <span className="block text-xs font-bold text-slate-900">{c.name}</span>
              <span className="block text-[11px] text-slate-500">{c.area} · Due {rupees(dueOf(c.id))}</span>
            </button>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bill date" value={dayOffset(0)} />
            <Field label="Stock from" value="Main godown" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Document</div>
            <Pills items={[{ id: 'retail', label: 'Non-GST Retail Bill' }, { id: 'gst', label: 'GST Tax Invoice' }]} value={docType} onChange={(id) => setDocType(id as 'retail' | 'gst')} />
          </div>
          <Tap onTap={tapAt(11, next)} active={step === 11} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Continue to Beverages & Crates
          </Tap>
        </div>
      );
    } else if (stage === 'products') {
      body = (
        <div className="space-y-2">
          {PRODUCTS.map((p) => (
            <Card key={p.id} className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-900">{p.name}</div>
                <div className="text-[11px] text-slate-500">{rupees(p.price)} per {p.unit} · <span className="text-slate-400">{stockOf(p.id)} left</span></div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label={`Fewer ${p.name}`} onClick={() => setQty(p.id, -1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center cursor-pointer"><Minus size={14} /></button>
                <span className="w-7 text-center text-xs font-bold">{cart[p.id]}</span>
                <button type="button" aria-label={`More ${p.name}`} onClick={() => setQty(p.id, p.id === 'jar' ? 5 : 1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center cursor-pointer"><Plus size={14} /></button>
              </div>
            </Card>
          ))}
          {freeJars > 0 && <Card className="border-emerald-200 bg-emerald-50/60 text-[11px] font-semibold text-emerald-800">Promotion applied: Buy 10 jars, get 1 free. {freeJars} free {freeJars === 1 ? 'jar' : 'jars'} added.</Card>}
          <Card className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Total</span>
            <span className="text-base font-extrabold tabular-nums">{rupees(total)}</span>
          </Card>
          <Tap onTap={tapAt(12, next)} active={step === 12 && itemCount > 0} disabled={itemCount === 0} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Review & save
          </Tap>
        </div>
      );
    } else if (snap && (step >= 13)) {
      const c = CUSTOMERS.find((x) => x.id === snap.cust)!;
      body = (
        <div className="space-y-2">
          <div className="text-center py-2">
            <CheckCircle2 size={40} className="mx-auto" style={{ color: '#16A34A' }} />
            <div className="font-extrabold text-sm text-slate-900 mt-1">Bill INV-1062 saved</div>
            <div className="text-[11px] text-slate-500">{c.name} · {rupees(snap.total)}</div>
          </div>
          <Card>
            <Row a="Paid now" b={rupees(snap.paid)} />
            <Row a="Added to balance" b={rupees(snap.credit)} />
            <Row a="Stock" b="Taken from Main godown" />
          </Card>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-700">
            <div className="rounded-xl border border-slate-200 bg-white py-2 flex flex-col items-center gap-1"><Share2 size={14} />WhatsApp</div>
            <div className="rounded-xl border border-slate-200 bg-white py-2 flex flex-col items-center gap-1"><Printer size={14} />Print</div>
            <div className="rounded-xl border border-slate-200 bg-white py-2 flex flex-col items-center gap-1"><FileText size={14} />PDF</div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">{docType === 'gst' ? 'A GST Tax Invoice shows HSN codes and CGST / SGST separately.' : 'A Non-GST Retail Bill is a clean bill without the tax breakdown.'}</p>
          <Tap onTap={tapAt(13, next)} active={step === 13} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Done
          </Tap>
        </div>
      );
    } else {
      const modes: { id: PayMode; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
        { id: 'cash', label: 'Cash', Icon: Banknote },
        { id: 'upi', label: 'UPI / QR', Icon: QrCode },
        { id: 'credit', label: 'Credit (Due)', Icon: Clock },
        { id: 'cheque', label: 'Cheque', Icon: CreditCard },
      ];
      body = (
        <div className="space-y-2">
          <Card className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Bill total {itemCount === 0 && <span className="font-normal text-slate-400">(add products first)</span>}</span>
            <span className="text-base font-extrabold tabular-nums">{rupees(total)}</span>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className="flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer"
                style={mode === m.id ? { borderColor: GREEN, borderWidth: 2, color: GREEN } : { borderColor: '#E2E8F0' }}
              >
                <m.Icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="owner-demo-received">Amount received</label>
            <input
              id="owner-demo-received"
              inputMode="numeric"
              value={mode === 'credit' ? '0' : received}
              disabled={mode === 'credit'}
              placeholder={String(total)}
              onChange={(e) => setReceived(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
            />
          </div>
          <Card className="space-y-0.5">
            <Row a="Paid now" b={rupees(paidNow)} />
            <Row a="Credit Balance Remaining" b={rupees(creditLeft)} strong />
          </Card>
          <Tap onTap={tapAt(13, () => setSnap(makeSnap()))} active={step === 13} disabled={itemCount === 0} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Save bill
          </Tap>
          {itemCount === 0 && <p className="text-[11px] text-amber-700">No products yet. Tap Next in the guide and sample products will be added.</p>}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <Heading title="Sell" />
        <Pills items={[{ id: 'create', label: 'New bill' }, { id: 'history', label: 'History' }]} value={billTab} onChange={setBillTab} />
        <ol className="flex items-center gap-1 text-[10px] font-bold">
          {pills.map((p, i) => (
            <li key={p.id} className="flex-1 rounded-full px-2 py-1 text-center" style={p.id === stage ? { background: GREEN, color: '#fff' } : { background: '#EBE8E1', color: '#64748B' }}>
              {i + 1}. {p.label}
            </li>
          ))}
        </ol>
        {body}
      </div>
    );
  })();

  const screenTrips = (() => {
    const tabs = [{ id: 'active', label: 'Active' }, { id: 'history', label: 'History' }];
    let body: React.ReactNode;
    const billedJars = snap ? snap.qty.jar + snap.free : 17;
    if (tripTab === 'history') {
      body = (
        <div className="space-y-2">
          {tripStage === 'closed' && (
            <Card>
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">EV-01 · Beat A · today</span><Chip tone="green">Closed · no difference</Chip></div>
              <Row a="Loaded" b="20 jars, 10 cases" />
              <Row a="Returned" b={`${returned} jars`} />
            </Card>
          )}
          <Card><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">EV-01 · Beat B · yesterday</span><Chip tone="green">Closed</Chip></div></Card>
        </div>
      );
    } else if (tripStage === 'new') {
      body = (
        <Card className="space-y-2">
          <div className="text-xs font-bold text-slate-900">New trip</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vehicle (van)" value="EV-01" />
            <Field label="Route / beat" value="Beat A" />
            <Field label="Salesman" value="Ravi Kumar" />
            <Field label="Date" value={dayOffset(0)} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Load, from Main godown</div>
          <Row a="20 L water jar" b="20 jars" />
          <Row a="1 L bottle, case of 12" b="10 cases" />
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bills on this trip</div>
          <Row a={snap ? `INV-1062 · ${CUSTOMERS.find((c) => c.id === snap.cust)?.name}` : 'INV-1062 · Sri Lakshmi Stores'} b={snap ? rupees(snap.total) : '₹1,000'} />
          <Tap onTap={tapAt(14, next)} active={step === 14} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Create trip
          </Tap>
        </Card>
      );
    } else if (tripStage === 'out') {
      body = (
        <div className="space-y-2">
          <Card className="space-y-0.5">
            <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">EV-01 · Beat A · today</span><Chip tone="amber">Active</Chip></div>
            <Row a="Loaded" b="20 jars, 10 cases" />
            <Row a="Billed on this trip" b={`${billedJars} jars`} />
            <Row a="Expected back" b={`${expectedBack} jars`} strong />
          </Card>
          <Card className="space-y-2">
            <div className="text-xs font-bold text-slate-900">Record returned stock & close trip</div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">20 L jars that came back</span>
              <span className="flex items-center gap-1.5">
                <button type="button" aria-label="Fewer jars returned" onClick={() => setReturned((r) => Math.max(0, r - 1))} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center cursor-pointer"><Minus size={14} /></button>
                <b className="w-7 text-center text-xs">{returned}</b>
                <button type="button" aria-label="More jars returned" onClick={() => setReturned((r) => Math.min(20, r + 1))} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center cursor-pointer"><Plus size={14} /></button>
              </span>
            </div>
            {shortBy > 0 ? (
              <div className="space-y-1">
                <Chip tone="red">Short by {shortBy}</Chip>
                <select aria-label="Reason for the shortage" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <option value="">Choose a reason</option>
                  <option value="broken">Broken</option>
                  <option value="missing">Missing</option>
                  <option value="other">Other</option>
                </select>
              </div>
            ) : (
              <Chip tone="green">Matches what was expected</Chip>
            )}
            <Tap onTap={tapAt(15, next)} active={step === 15} disabled={shortBy > 0 && reason === ''} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: '#B45309' }}>
              Close trip
            </Tap>
          </Card>
        </div>
      );
    } else if (tripStage === 'closed') {
      body = (
        <Card className="text-center py-5 space-y-1">
          <CheckCircle2 size={32} className="mx-auto" style={{ color: '#16A34A' }} />
          <div className="text-sm font-extrabold text-slate-900">Trip closed</div>
          <div className="text-[11px] text-slate-500">See it under History.</div>
        </Card>
      );
    } else {
      body = (
        <Card className="text-center py-6 space-y-2">
          <div className="text-sm font-bold text-slate-900">No active trips</div>
          <div className="text-[11px] text-slate-500">Tap New trip to load a vehicle and send it out.</div>
          <div className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: GREEN }}><Plus size={13} /> New trip</div>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <Heading title="Trips" sub="Vehicle runs: load, sell, return" />
        <Pills items={tabs} value={tripTab} onChange={setTripTab} />
        {body}
      </div>
    );
  })();

  const screenPayments = (() => {
    const due = dueOf(cust);
    return (
      <div className="space-y-3">
        <Heading title="Payments" sub="Money received from shops" />
        <Card className="space-y-2">
          <div className="text-xs font-bold text-slate-900">Record receipt</div>
          <Field label="Shop" value={payCust.name} />
          <Row a="Balance due now" b={rupees(due)} strong />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="owner-demo-pay">Amount received</label>
            <input
              id="owner-demo-pay"
              inputMode="numeric"
              value={payAmt}
              placeholder="500"
              disabled={payDone}
              onChange={(e) => setPayAmt(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
            />
          </div>
          <Pills items={[{ id: 'cash', label: 'Cash' }, { id: 'upi', label: 'UPI / QR' }]} value={payMode} onChange={(id) => setPayMode(id as 'cash' | 'upi')} />
          {!payDone ? (
            <Tap
              onTap={tapAt(16, () => {
                if (payAmt === '') setPayAmt(String(Math.min(due, 500) || 500));
                setPayDone(true);
              })}
              active={step === 16}
              className="w-full py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: GREEN }}
            >
              Record receipt
            </Tap>
          ) : (
            <div className="space-y-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] font-semibold text-emerald-800">
                Receipt recorded: {rupees(payAmount)} by {payMode === 'cash' ? 'cash' : 'UPI'}. New balance {rupees(dueOf(cust))}.
              </div>
              <div className="rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5"><Share2 size={14} /> Send WhatsApp Receipt</div>
              {step === 16 && (
                <Tap onTap={tapAt(16, next)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
                  Continue
                </Tap>
              )}
            </div>
          )}
        </Card>
        <Pills items={[{ id: 'd', label: 'Day-wise' }, { id: 'b', label: 'Beat-wise' }]} value="d" onChange={() => undefined} />
        <Card>
          {payDone && <Row a={`${payCust.name} · today`} b={rupees(payAmount)} />}
          <Row a="Hotel Sagar · yesterday" b="₹300" />
          <Row a="Sai Departmental · yesterday" b="₹1,000" />
        </Card>
      </div>
    );
  })();

  const screenCrates = (
    <div className="space-y-3">
      <Heading title="Crates & deposits" sub="Who holds your crates and deposits" />
      <div className="grid grid-cols-2 gap-2">
        <Card><div className="text-[10px] font-bold uppercase text-slate-500">Crates out</div><div className="text-lg font-extrabold tabular-nums">{CUSTOMERS.reduce((s, c) => s + cratesOf(c.id), 0)}</div></Card>
        <Card><div className="text-[10px] font-bold uppercase text-slate-500">Deposits held</div><div className="text-lg font-extrabold tabular-nums">₹4,500</div></Card>
      </div>
      <Card>
        <div className="text-xs font-bold text-slate-900 mb-1">Outstanding by party</div>
        {CUSTOMERS.filter((c) => c.crates > 0).map((c) => (
          <Row key={c.id} a={c.name} b={`${cratesOf(c.id)} crates`} />
        ))}
      </Card>
      <Card className="space-y-2">
        <div className="text-xs font-bold text-slate-900">Record crates / deposit</div>
        <select aria-label="Kind of record" value={crateKind} onChange={(e) => setCrateKind(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
          {['Empties returned', 'Empties / crates issued', 'Deposit collected', 'Deposit refunded'].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <Field label="Party" value="Sri Lakshmi Stores" />
        <Field label={crateKind.startsWith('Deposit') ? 'Amount' : 'Crates'} value={crateKind.startsWith('Deposit') ? '₹500' : '5'} />
        {!crateDone ? (
          <Tap onTap={tapAt(17, () => setCrateDone(true))} active={step === 17} className="w-full py-3 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
            Save record
          </Tap>
        ) : (
          <>
            <p className="text-[11px] text-emerald-700 font-semibold">Saved. Sri Lakshmi Stores now holds {cratesOf('c1')} crates.</p>
            {step === 17 && (
              <Tap onTap={tapAt(17, next)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: GREEN }}>
                Continue
              </Tap>
            )}
          </>
        )}
      </Card>
    </div>
  );

  const screenPromotions = (
    <div className="space-y-3">
      <Heading title="Promotions" sub="Offers that billing applies for you" />
      <div className="flex flex-wrap gap-1.5">
        {PROMO_TYPES.map((t) => (
          <Tap key={t.id} onTap={() => setPromoType(t.id)} active={step === 18 && promoType === PROMO_TYPES[0].id && t.id === PROMO_TYPES[1].id} className="rounded-full border px-3 py-1.5 text-[11px] font-bold" style={promoType === t.id ? { background: GREEN, color: '#fff', borderColor: GREEN } : { background: '#fff', color: '#334155', borderColor: '#E2E8F0' }}>
            {t.id}
          </Tap>
        ))}
      </div>
      <Card>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Example</div>
        <div className="text-xs font-semibold text-slate-800 mt-0.5">{PROMO_TYPES.find((t) => t.id === promoType)?.how}</div>
      </Card>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Offers</div>
      <Card className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">Buy 10 jars, get 1 free</span><Chip tone="green">On</Chip></Card>
      <Card className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">5% off 500 ml cases</span><Chip>Off</Chip></Card>
    </div>
  );

  const screenSupplier = (() => {
    const tabs = [{ id: 'schemes', label: 'Schemes' }, { id: 'credit', label: 'Credit notes' }, { id: 'monthly', label: 'Monthly' }];
    const rows: Record<string, { title: string; a: string; b: string }> = {
      schemes: { title: 'Supplier schemes', a: 'Blue Spring · free 1 case per 20 bought', b: 'Running' },
      credit: { title: 'Supplier credit notes', a: 'CN-118 · Blue Spring', b: '₹1,200 received' },
      monthly: { title: 'Monthly volume incentive', a: 'Target 300 cases · done 262', b: '87%' },
    };
    const r = rows[supTab];
    return (
      <div className="space-y-3">
        <Heading title="Supplier credits" sub="What suppliers owe you" />
        <Pills items={tabs} value={supTab} onChange={setSupTab} />
        <Card className="space-y-1">
          <div className="text-xs font-bold text-slate-900">{r.title}</div>
          <Row a={r.a} b={r.b} />
        </Card>
        <div className="rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700">Record receipt</div>
      </div>
    );
  })();

  const screenReports = (() => {
    const sel = REPORTS.find((r) => r.id === report);
    return (
      <div className="space-y-3">
        <Heading title="Reports" sub="Tap a report to open it" />
        <div className="grid grid-cols-2 gap-2">
          {REPORTS.map((r) => (
            <Tap
              key={r.id}
              onTap={() => setReport(r.id)}
              active={step === 20 && r.id === 'receivables' && report !== 'receivables'}
              className="text-left rounded-xl border bg-white p-2.5 text-[11px] font-bold text-slate-800 leading-snug"
              style={report === r.id ? { borderColor: GREEN, borderWidth: 2 } : { borderColor: '#E2E8F0' }}
            >
              {r.label}
            </Tap>
          ))}
        </div>
        {sel && (
          <Card className="space-y-1">
            <div className="text-xs font-bold text-slate-900">{sel.label}</div>
            <p className="text-[11px] text-slate-500 leading-snug">{sel.blurb}</p>
            {sel.id === 'receivables' &&
              CUSTOMERS.filter((c) => dueOf(c.id) > 0)
                .sort((a, b) => dueOf(b.id) - dueOf(a.id))
                .map((c) => <Row key={c.id} a={c.name} b={rupees(dueOf(c.id))} />)}
            {sel.id === 'sales' && (
              <>
                <Row a="Today" b={rupees(18400 + (billDone && snap ? snap.total : 0))} />
                <Row a="Yesterday" b="₹21,750" />
              </>
            )}
            <div className="text-[10px] text-slate-400 pt-1">Date filters and Export CSV sit at the top of the real report.</div>
          </Card>
        )}
      </div>
    );
  })();

  const screenFinish = (
    <div className="space-y-3">
      <Heading title="Your day, in order" sub="Set up once, then repeat" />
      {[
        ['Morning', 'Home: check low stock and what needs attention'],
        ['Stock arrives', 'Inventory › Inward: upload, check lines, Confirm & Post'],
        ['All day', 'Sell: Customer, Products, Save bill'],
        ['Vehicle out', 'Trips: New trip, assign bills'],
        ['Vehicle back', 'Trips: Record returned stock & close trip'],
        ['Money', 'Payments: Record receipt. Crates & deposits: Save record'],
        ['Evening', 'Reports: Daily Collection and Party Credit & Receivables'],
        ['Now and then', 'Inventory › Audit, and a backup under Settings'],
      ].map(([t, d]) => (
        <Card key={t} className="flex gap-3 items-start">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: '#16A34A' }} />
          <span>
            <span className="block text-xs font-bold text-slate-900">{t}</span>
            <span className="block text-[11px] text-slate-500">{d}</span>
          </span>
        </Card>
      ))}
    </div>
  );

  const screens: Record<ViewId, React.ReactNode> = {
    intro: screenIntro,
    dashboard: screenDashboard,
    billing: screenBilling,
    customers: screenCustomers,
    products: screenProducts,
    inventory: screenInventory,
    supplierSchemes: screenSupplier,
    payments: screenPayments,
    crates: screenCrates,
    promotions: screenPromotions,
    trips: screenTrips,
    reports: screenReports,
    settings: screenSettings,
    finish: screenFinish,
  };

  const chapters = useMemo(() => {
    const out: { name: string; items: { n: number; title: string }[] }[] = [];
    STEPS.forEach((s, n) => {
      let g = out.find((x) => x.name === s.chapter);
      if (!g) {
        g = { name: s.chapter, items: [] };
        out.push(g);
      }
      g.items.push({ n, title: s.title });
    });
    return out;
  }, []);

  const browsing = view !== info.screen;

  /* ------------------------------------------------------------------------------------------------ layout */
  return (
    <div role="dialog" aria-modal="true" aria-label="Owner app demo" className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: '#0F1F1A' }}>
      <style>{`
        @keyframes ownerDemoPulse { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.7); } 70% { box-shadow: 0 0 0 10px rgba(245,158,11,0); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
        .demo-tap { animation: ownerDemoPulse 1.6s ease-out infinite; outline: 2px solid ${AMBER}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .demo-tap { animation: none; } }
      `}</style>

      <div className="min-h-full max-w-6xl mx-auto px-4 py-4 md:py-6 flex flex-col lg:flex-row gap-5 lg:gap-8 lg:items-center">
        {/* coach */}
        <section className="lg:w-[360px] lg:shrink-0 text-white order-2 lg:order-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/60">
              Step {step + 1} of {STEPS.length} · {info.chapter}
            </span>
            <button ref={closeRef} type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 cursor-pointer">
              <X size={14} /> Close demo
            </button>
          </div>

          <div className="h-1 rounded-full bg-white/10 mb-4" aria-hidden>
            <div className="h-1 rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: AMBER }} />
          </div>

          <label className="block mb-4">
            <span className="sr-only">Jump to topic</span>
            <select
              value={step}
              onChange={(e) => go(Number(e.target.value))}
              className="w-full rounded-lg bg-white/10 text-white text-xs font-semibold px-3 py-2 border border-white/15 cursor-pointer"
              aria-label="Jump to topic"
            >
              {chapters.map((g) => (
                <optgroup key={g.name} label={g.name} style={{ color: '#111827' }}>
                  {g.items.map((it) => (
                    <option key={it.n} value={it.n} style={{ color: '#111827' }}>
                      {it.n + 1}. {it.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <h2 className="text-2xl font-bold leading-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            {info.title}
          </h2>
          <p className="text-sm text-white/80 leading-relaxed mb-4">{info.what}</p>

          {info.tips && (
            <ul className="space-y-2 mb-4">
              {info.tips.map((t) => (
                <li key={t} className="text-sm text-white/70 leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-400">
                  {t}
                </li>
              ))}
            </ul>
          )}

          {info.action && (
            <div className="mb-5 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: 'rgba(245,158,11,0.15)', color: '#FCD34D' }}>
              {info.action}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
              <ChevronLeft size={16} /> Back
            </button>
            {step < last ? (
              <button type="button" onClick={coachNext} className="flex items-center gap-1 rounded-xl px-5 py-2.5 text-sm font-bold cursor-pointer" style={{ background: AMBER, color: '#1F2937' }}>
                {step === 0 ? 'Start' : 'Next'} <ChevronRight size={16} />
              </button>
            ) : (
              <>
                <button type="button" onClick={restart} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white/10 hover:bg-white/20 cursor-pointer">
                  <RotateCcw size={15} /> Run it again
                </button>
                <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold cursor-pointer" style={{ background: AMBER, color: '#1F2937' }}>
                  Close demo
                </button>
              </>
            )}
          </div>
        </section>

        {/* sample app window */}
        <section className="order-1 lg:order-2 flex-1 min-w-0">
          <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col bg-slate-50" style={{ height: 'min(660px, 74vh)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="text-center text-[10px] font-bold py-1 shrink-0" style={{ background: AMBER, color: '#1F2937' }}>
              DEMO with sample data. Nothing is saved.
            </div>
            <div className="flex flex-1 min-h-0">
              <nav className="hidden sm:flex flex-col w-44 shrink-0 bg-white border-r border-slate-200 overflow-y-auto py-2" aria-label="Sample menu">
                <div className="px-3 pb-2 text-[11px] font-extrabold" style={{ color: GREEN }}>Sample Aqua</div>
                {MENU.map(({ id, label, Icon }) => {
                  const on = view === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setView(id)}
                      aria-current={on ? 'page' : undefined}
                      className="flex items-center gap-2 px-3 py-2 text-left text-xs cursor-pointer hover:bg-slate-50"
                      style={on ? { background: '#E6F0EC', color: GREEN, fontWeight: 800 } : { color: '#475569', fontWeight: 600 }}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  );
                })}
              </nav>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="sm:hidden flex gap-1 overflow-x-auto bg-white border-b border-slate-200 p-1.5 shrink-0" aria-label="Sample menu">
                  {MENU.map(({ id, label, Icon }) => {
                    const on = view === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setView(id)}
                        className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] whitespace-nowrap cursor-pointer"
                        style={on ? { background: GREEN, color: '#fff', fontWeight: 800 } : { background: '#F1F5F9', color: '#475569', fontWeight: 600 }}
                      >
                        <Icon size={12} /> {label}
                      </button>
                    );
                  })}
                </div>
                <div className="relative flex-1 overflow-y-auto p-3 sm:p-4">
                  {browsing && (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
                      <span className="flex items-center gap-1.5"><Info size={13} /> You are looking around {LABEL_OF(view)}.</span>
                      <button type="button" onClick={() => setView(info.screen)} className="font-bold underline cursor-pointer whitespace-nowrap">
                        Back to the guide
                      </button>
                    </div>
                  )}
                  {screens[view]}
                </div>
              </div>
            </div>
            {note && (
              <div className="absolute left-3 right-3 bottom-3 rounded-xl px-3 py-2 text-[11px] font-semibold text-white shadow-lg" style={{ background: '#1F2937' }} role="status">
                {note}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OwnerDemo;
