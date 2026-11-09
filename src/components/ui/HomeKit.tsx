import React, { useId } from 'react';
import { Delete, Minus, Plus, Receipt } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * Shared Hydrate Hub presentation components. Pure props in, markup out: no ledger access, no maths beyond
 * drawing proportions. Styles live in shell.css (hh-* classes), so one component adapts to every breakpoint.
 */

export type Tone = 'sales' | 'profit' | 'received' | 'due' | 'warning' | 'blue' | 'green' | 'orange' | 'purple';

/* ------------------------------------------------------------ ProgressRing */
export const ProgressRing: React.FC<{ pct: number; label?: string; size?: number }> = ({ pct, label, size = 120 }) => {
  const id = useId().replace(/:/g, '');
  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(pct) ? pct : 0)));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="hh-ring" style={{ width: size, height: size }} role="img" aria-label={label || `${clamped}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-from)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary-soft)" strokeWidth={stroke} />
        <circle
          className="hh-ring__arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="hh-ring__pct">{clamped}%</span>
    </div>
  );
};

/* ------------------------------------------------------ HeroCollectionCard */
export interface HeroCollectionCardProps {
  label: string;
  amount: string;
  sub: string;
  duePill?: string;
  /** 'received' (green) when nothing is outstanding, otherwise 'due' (red). Always paired with text. */
  pillTone?: 'due' | 'received';
  pct: number;
  ringLabel?: string;
}
export const HeroCollectionCard: React.FC<HeroCollectionCardProps> = ({ label, amount, sub, duePill, pillTone = 'due', pct, ringLabel }) => (
  <section className="hh-hero" aria-label={label}>
    <div className="hh-hero__text">
      <p className="hh-label">{label}</p>
      <p className="hh-hero__amount">{amount}</p>
      <p className="hh-hero__sub">{sub}</p>
      {duePill && <span className={`hh-pill hh-pill--${pillTone}`}>{duePill}</span>}
    </div>
    <ProgressRing pct={pct} label={ringLabel} />
  </section>
);

/* ------------------------------------------------------------ ShortcutTile */
export const ShortcutTile: React.FC<{
  tone: 'blue' | 'green' | 'orange' | 'purple';
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ tone, icon, label, onClick }) => (
  <button type="button" className={`hh-shortcut hh-tone-${tone}`} onClick={onClick}>
    <span className="hh-shortcut__icon" aria-hidden="true">{icon}</span>
    <span className="hh-shortcut__label">{label}</span>
  </button>
);

/* -------------------------------------------------------------- MetricCard */
export const HubMetricCard: React.FC<{ tone: Tone; label: string; value: string; sub?: string }> = ({ tone, label, value, sub }) => (
  <div className={`hh-metric hh-tone-${tone}`}>
    <p className="hh-label hh-metric__label">{label}</p>
    <p className="hh-metric__value">{value}</p>
    {sub && <p className="hh-metric__sub">{sub}</p>}
  </div>
);

/* --------------------------------------------------------- SegmentedPeriod */
export const SegmentedPeriod: React.FC<{
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  trailing?: React.ReactNode;
}> = ({ options, value, onChange, ariaLabel, trailing }) => (
  <div className="hh-segmented" role="group" aria-label={ariaLabel}>
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        className="hh-segmented__btn"
        data-active={value === o.id ? 'true' : 'false'}
        aria-pressed={value === o.id}
        onClick={() => onChange(o.id)}
      >
        {o.label}
      </button>
    ))}
    {trailing}
  </div>
);

/* -------------------------------------------------------------- StatusPill */
export type PillStatus = 'paid' | 'due' | 'part';
export const StatusPill: React.FC<{ status: PillStatus }> = ({ status }) => {
  const { t } = useLanguage();
  const tone = status === 'paid' ? 'received' : status === 'due' ? 'due' : 'profit';
  const key = status === 'paid' ? 'status.paid' : status === 'due' ? 'status.due' : 'status.partPaid';
  return <span className={`hh-pill hh-pill--${tone}`}>{t(key)}</span>;
};

/* ----------------------------------------------------- BillRow / BillsTable */
export interface BillRowData {
  id: string | number;
  party: string;
  billNo: string;
  beat: string;
  amount: string;
  status: PillStatus;
}
export const BillsList: React.FC<{ rows: BillRowData[]; onOpen?: (id: BillRowData['id']) => void }> = ({ rows, onOpen }) => (
  <ul className="hh-bills">
    {rows.map((r) => (
      <li key={r.id}>
        <button type="button" className="hh-bill" onClick={() => onOpen?.(r.id)}>
          <span className="hh-bill__icon" aria-hidden="true"><Receipt size={20} /></span>
          <span className="hh-bill__main">
            <span className="hh-bill__party">{r.party}</span>
            <span className="hh-bill__no">{r.billNo}</span>
          </span>
          <span className="hh-bill__right">
            <span className="hh-bill__amount">{r.amount}</span>
            <StatusPill status={r.status} />
          </span>
        </button>
      </li>
    ))}
  </ul>
);

export const BillsTable: React.FC<{ rows: BillRowData[]; onOpen?: (id: BillRowData['id']) => void }> = ({ rows, onOpen }) => {
  const { t } = useLanguage();
  return (
    <div className="hh-tablewrap">
      <table className="hh-table">
        <thead>
          <tr>
            <th scope="col">{t('bills.colParty')}</th>
            <th scope="col">{t('bills.colBill')}</th>
            <th scope="col">{t('bills.colBeat')}</th>
            <th scope="col">{t('bills.colAmount')}</th>
            <th scope="col">{t('bills.colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <button type="button" className="hh-linkbtn" onClick={() => onOpen?.(r.id)}>{r.party}</button>
              </th>
              <td>
                <button type="button" className="hh-linkbtn font-mono" onClick={() => onOpen?.(r.id)}>{r.billNo}</button>
              </td>
              <td>{r.beat}</td>
              <td className="hh-num">{r.amount}</td>
              <td><StatusPill status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ---------------------------------------------------------- DueByBeatCard */
export const DueByBeatCard: React.FC<{ rows: { name: string; amount: number; display: string }[]; title: string; empty: string }> = ({ rows, title, empty }) => {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <section className="hh-card" aria-label={title}>
      <h2 className="hh-card__title">{title}</h2>
      {rows.length === 0 ? (
        <p className="hh-empty">{empty}</p>
      ) : (
        <ul className="hh-beats">
          {rows.map((r) => (
            <li key={r.name} className="hh-beat">
              <div className="hh-beat__head">
                <span className="hh-beat__name">{r.name}</span>
                <span className="hh-beat__amt">{r.display}</span>
              </div>
              <div className="hh-beat__track" aria-hidden="true">
                <div className="hh-beat__bar" style={{ width: `${Math.max(4, Math.round((r.amount / max) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/* ------------------------------------------------------------ SalesBarsCard */
export const SalesBarsCard: React.FC<{ title: string; bars: { label: string; value: number; display: string }[] }> = ({ title, bars }) => {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const summary = bars.map((b) => `${b.label} ${b.display}`).join(', ');
  return (
    <section className="hh-card" aria-label={title}>
      <h2 className="hh-card__title">{title}</h2>
      <div className="hh-bars" role="img" aria-label={`${title}: ${summary}`}>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className="hh-bars__col">
            <div className="hh-bars__plot">
              <div
                className="hh-bars__bar"
                data-last={i === bars.length - 1 ? 'true' : 'false'}
                style={{ height: `${Math.max(4, Math.round((b.value / max) * 100))}%` }}
              />
            </div>
            <span className="hh-bars__label">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------- NeedsAttentionCard */
export interface AttentionRow {
  id: string;
  tone: 'due' | 'warning' | 'info';
  title: string;
  sub: string;
  onClick: () => void;
}
export const NeedsAttentionCard: React.FC<{ title: string; rows: AttentionRow[]; empty: string; id?: string }> = ({ title, rows, empty, id }) => (
  <section className="hh-card" id={id} aria-label={title}>
    <h2 className="hh-card__title">{title}</h2>
    {rows.length === 0 ? (
      <p className="hh-empty">{empty}</p>
    ) : (
      <ul className="hh-attn">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" className={`hh-attn__row hh-attn__row--${r.tone}`} onClick={r.onClick}>
              <span className="hh-attn__dot" aria-hidden="true" />
              <span className="hh-attn__text">
                <span className="hh-attn__title">{r.title}</span>
                <span className="hh-attn__sub">{r.sub}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

/** Amber strip (phone): the single most important attention row. */
export const AlertStrip: React.FC<{ text: string; onClick: () => void }> = ({ text, onClick }) => (
  <button type="button" className="hh-alertstrip" onClick={onClick}>
    <span aria-hidden="true" className="hh-alertstrip__dot" />
    <span>{text}</span>
  </button>
);

/* -------------------------------------------------------------- QtyStepper */
export const QtyStepper: React.FC<{
  value: number;
  onDec: () => void;
  onInc: () => void;
  decLabel: string;
  incLabel: string;
  valueLabel?: string;
  decDisabled?: boolean;
  incDisabled?: boolean;
  decId?: string;
  incId?: string;
}> = ({ value, onDec, onInc, decLabel, incLabel, valueLabel, decDisabled, incDisabled, decId, incId }) => (
  <div className="hh-stepper" role="group" aria-label={valueLabel}>
    <button type="button" id={decId} className="hh-stepper__btn" onClick={onDec} disabled={decDisabled} aria-label={decLabel}>
      <Minus size={18} aria-hidden="true" />
    </button>
    <span className="hh-stepper__val" aria-live="polite">{value}</span>
    <button type="button" id={incId} className="hh-stepper__btn hh-stepper__btn--plus" onClick={onInc} disabled={incDisabled} aria-label={incLabel}>
      <Plus size={18} aria-hidden="true" />
    </button>
  </div>
);

/* --------------------------------------------------------------- NumberPad */
export const NumberPad: React.FC<{ onKey: (key: string) => void; backspaceLabel: string }> = ({ onKey, backspaceLabel }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  return (
    <div className="hh-pad" role="group">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className="hh-pad__key"
          onClick={() => onKey(k)}
          aria-label={k === 'back' ? backspaceLabel : undefined}
        >
          {k === 'back' ? <Delete size={22} aria-hidden="true" /> : k}
        </button>
      ))}
    </div>
  );
};

/* --------------------------------------------------------------- ActionBar */
/** Sell / Collect bottom bar: visible Cancel on the left, primary action on the right. Never hidden. */
export const ActionBar: React.FC<{ cancelLabel: string; onCancel: () => void; primaryLabel: string; onPrimary: () => void; primaryDisabled?: boolean; /** keep in normal flow (inside a modal footer) */ flow?: boolean; children?: React.ReactNode }> = ({
  flow,
  cancelLabel,
  onCancel,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  children,
}) => (
  <div className={`hh-actionbar${flow ? " hh-actionbar--flow" : ""}`}>
    {children}
    <div className="hh-actionbar__btns">
      <button type="button" className="hh-btn hh-btn--danger-outline" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="hh-btn hh-btn--primary hh-actionbar__primary" onClick={onPrimary} disabled={primaryDisabled}>{primaryLabel}</button>
    </div>
  </div>
);
