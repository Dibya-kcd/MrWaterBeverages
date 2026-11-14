import React, { useMemo, useState } from 'react';
import type { Bill, GRN, OrganizationProfile } from '../../../types';
import {
  buildCmp08, buildGstr4Working, cmp08Csv, gstr4Csv, financialYear,
} from '../../../tax';

const inr = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const STATUS_STYLE: Record<string, string> = {
  eligible: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  ineligible: 'bg-red-50 border-red-200 text-red-900',
};

interface Props {
  bills: Bill[];
  grns: GRN[];
  orgProfile: OrganizationProfile;
  onShowRegularGst?: () => void;
}

/** CMP-08 (quarterly) and GSTR-4 (annual) workings for a composition taxpayer. Working papers, not portal returns. */
export const CompositionReport: React.FC<Props> = ({ bills, grns, orgProfile, onShowRegularGst }) => {
  const today = new Date().toISOString().slice(0, 10);
  const thisFy = financialYear(today);
  const fyOptions = useMemo(() => {
    const set = new Set<string>([thisFy]);
    bills.forEach((b) => b.date && set.add(financialYear(b.date)));
    return [...set].sort().reverse();
  }, [bills, thisFy]);
  const [fy, setFy] = useState(thisFy);
  const [otherPrev, setOtherPrev] = useState('');
  const [otherCur, setOtherCur] = useState('');

  const work = useMemo(
    () =>
      buildGstr4Working({
        bills, grns, org: orgProfile, fy, today,
        otherGstinTurnover: { preceding: Number(otherPrev) || 0, current: Number(otherCur) || 0 },
      }),
    [bills, grns, orgProfile, fy, today, otherPrev, otherCur],
  );
  const quarters = work.quarters;
  const stampedCount = quarters.reduce((s, q) => s + q.bills, 0);
  const errors = [...new Set(quarters.flatMap((q) => q.errors))];
  const e = work.eligibility;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
        <p className="text-sm font-bold text-indigo-950">Composition taxpayer: CMP-08 and GSTR-4 workings</p>
        <p className="text-xs text-indigo-900/80 mt-1">
          A composition taxpayer does not file GSTR-1 or GSTR-3B and cannot claim input tax credit. These are management
          workings for your CA, not portal returns.
          {onShowRegularGst && (
            <button type="button" onClick={onShowRegularGst} className="ml-2 underline font-semibold">
              Open the regular GST view (for bills before the composition start date)
            </button>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-neutral-600">
          Financial year
          <select value={fy} onChange={(ev) => setFy(ev.target.value)}
            className="mt-1 block bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm">
            {fyOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          Other GSTINs under your PAN: previous FY turnover (₹)
          <input inputMode="decimal" value={otherPrev} onChange={(ev) => setOtherPrev(ev.target.value)} placeholder="0"
            className="mt-1 block w-44 bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          …this FY so far (₹)
          <input inputMode="decimal" value={otherCur} onChange={(ev) => setOtherCur(ev.target.value)} placeholder="0"
            className="mt-1 block w-36 bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm" />
        </label>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
          {errors.map((m) => <p key={m}>• {m}</p>)}
        </div>
      )}

      {/* Eligibility */}
      <div className={`rounded-2xl border p-4 ${STATUS_STYLE[e.status]}`}>
        <p className="text-sm font-bold">
          Composition eligibility: {e.status === 'eligible' ? 'within limits' : e.status === 'warning' ? 'watch closely' : 'NOT eligible - speak to your CA'}
        </p>
        <p className="text-xs mt-1">
          Aggregate turnover this FY {inr(work.currentFyTurnover)} · previous FY {inr(work.precedingFyTurnover)}
          {e.limit ? ` · limit ${inr(e.limit)} (${e.usedPct}% used)` : ''}
        </p>
        {e.messages.map((m) => <p key={m} className="text-xs mt-0.5">• {m}</p>)}
        {work.interStateOutwardBills.length > 0 && (
          <p className="text-xs mt-0.5">• Inter-state bills: {work.interStateOutwardBills.map((i) => `#${i}`).join(', ')}</p>
        )}
      </div>

      {/* CMP-08 */}
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <p className="text-sm font-bold text-neutral-900">CMP-08 working: quarterly tax, FY {fy}</p>
          <button type="button" onClick={() => download(`CMP-08-working-${fy}.csv`, cmp08Csv(orgProfile, fy, quarters))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-700 text-white">Download CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Quarter</th><th className="text-right px-3 py-2">Bills</th>
                <th className="text-right px-3 py-2">Gross supplies</th><th className="text-right px-3 py-2">Returns</th>
                <th className="text-right px-3 py-2">Net turnover</th><th className="text-right px-3 py-2">CGST</th>
                <th className="text-right px-3 py-2">SGST</th><th className="text-right px-3 py-2">Tax payable</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr key={q.quarter} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-semibold">{q.quarter}<span className="block font-normal text-neutral-400">{q.from} → {q.to}</span></td>
                  <td className="px-3 py-2 text-right">{q.bills}</td>
                  <td className="px-3 py-2 text-right">{inr(q.gross)}</td>
                  <td className="px-3 py-2 text-right">{inr(q.returns)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{inr(q.net)}</td>
                  <td className="px-3 py-2 text-right">{inr(q.cgst)}</td>
                  <td className="px-3 py-2 text-right">{inr(q.sgst)}</td>
                  <td className="px-3 py-2 text-right font-bold">{inr(q.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-bold">
                <td className="px-3 py-2">Year</td><td className="px-3 py-2 text-right">{stampedCount}</td>
                <td className="px-3 py-2 text-right">{inr(work.outwardGross)}</td>
                <td className="px-3 py-2 text-right">{inr(work.outwardReturns)}</td>
                <td className="px-3 py-2 text-right">{inr(work.outwardNet)}</td>
                <td className="px-3 py-2 text-right">{inr(work.cgst)}</td>
                <td className="px-3 py-2 text-right">{inr(work.sgst)}</td>
                <td className="px-3 py-2 text-right">{inr(work.taxPayable)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-[11px] text-neutral-500 space-y-0.5">
          <p>Tax is {quarters[0]?.cgstPct ?? '-'}% CGST + {quarters[0]?.sgstPct ?? '-'}% SGST of the quarter’s total turnover. It is your own liability and is never charged to customers.</p>
          {quarters.some((q) => Math.abs(q.roundingDifference) > 0) && (
            <p>Aggregate tax differs from the sum of per-bill amounts by {inr(quarters.reduce((s, q) => s + q.roundingDifference, 0))} (paise rounding): the aggregate is the figure to pay.</p>
          )}
          {quarters.flatMap((q) => q.warnings.map((w) => <p key={q.quarter + w}>{q.quarter}: {w}</p>))}
          <p>Only bills issued under the composition setting are counted. Cancelled bills are excluded. Check the due date on the GST portal.</p>
        </div>
      </div>

      {/* GSTR-4 */}
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <p className="text-sm font-bold text-neutral-900">GSTR-4 working: annual summary, FY {fy}</p>
          <button type="button" onClick={() => download(`GSTR-4-working-${fy}.csv`, gstr4Csv(orgProfile, work))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-700 text-white">Download CSV</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 p-4 text-xs">
          <div className="space-y-1">
            <p className="font-bold text-neutral-700 uppercase tracking-wider text-[10px]">Outward supplies</p>
            <Row k="Gross supplies" v={inr(work.outwardGross)} />
            <Row k="Less sales returns" v={inr(work.outwardReturns)} />
            <Row k="Net turnover" v={inr(work.outwardNet)} bold />
            <Row k="of which lines at 0% GST (estimate)" v={inr(work.exemptLineTurnover)} />
            <Row k="Composition tax payable" v={inr(work.taxPayable)} bold />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-neutral-700 uppercase tracking-wider text-[10px]">Inward supplies (from GRNs)</p>
            <Row k={`Registered suppliers (${work.inward.registeredCount})`} v={inr(work.inward.registeredTaxable)} />
            <Row k="…GST paid to them" v={inr(work.inward.registeredTax)} />
            <Row k={`No / invalid GSTIN (${work.inward.unregisteredCount})`} v={inr(work.inward.unregisteredTaxable)} />
            <Row k="Total GST paid on purchases" v={inr(work.inward.totalTax)} bold />
            <Row k="…added to stock cost (no ITC)" v={inr(work.inward.taxCapitalised)} />
            <Row k="Reverse-charge tax (not captured yet)" v={inr(work.rcmInwardTax)} />
          </div>
        </div>
        <div className="px-4 pb-4 text-[11px] text-neutral-500 space-y-0.5">
          {work.notes.map((n) => <p key={n}>• {n}</p>)}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string; bold?: boolean }> = ({ k, v, bold }) => (
  <div className={`flex justify-between gap-3 ${bold ? 'font-bold text-neutral-900' : 'text-neutral-600'}`}>
    <span>{k}</span><span className="tabular-nums">{v}</span>
  </div>
);
