import React, { useState } from 'react';
import { useLedger } from '../../context/LedgerContext';
import { validateGstin } from '../../tax/gstin';

/**
 * Turns the GST tax engine on for this business. Until a registration type AND a start date are saved, the app
 * behaves exactly as before. Bills dated before the start date are never changed.
 */
export default function GstRegistrationCard() {
  const { orgProfile, updateOrgProfile } = useLedger();
  const [type, setType] = useState<string>(orgProfile.gstRegistrationType || '');
  const [category, setCategory] = useState<string>(orgProfile.compositionCategory || 'trader');
  const [start, setStart] = useState<string>(orgProfile.gstEngineStartDate || '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () => {
    setMsg(null);
    if (!type) {
      updateOrgProfile({ gstRegistrationType: undefined, gstEngineStartDate: undefined, compositionCategory: undefined });
      setMsg({ ok: true, text: 'Tax engine switched off. Billing works as before.' });
      return;
    }
    const g = validateGstin(orgProfile.gstin);
    if (!g.valid) return setMsg({ ok: false, text: `Your business GSTIN is not valid (${g.reason}). Fix it in the business profile first.` });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return setMsg({ ok: false, text: 'Choose the first bill date the engine should govern.' });
    if (
      !window.confirm(
        `From ${start}, every new bill will be issued as a ${type === 'composition' ? 'Bill of Supply with NO GST charged' : 'bill without GST'}.\n` +
          'Purchase (GRN) stock cost for goods inwarded on/after this date will INCLUDE the GST paid to the supplier, because no input credit is claimable.\n' +
          'Bills and GRNs dated before this are not changed.\n\nPlease confirm this matches your GST registration (ask your CA if unsure).',
      )
    )
      return;
    updateOrgProfile({
      gstRegistrationType: type as 'composition' | 'unregistered',
      compositionCategory: type === 'composition' ? (category as 'trader') : undefined,
      gstEngineStartDate: start,
    });
    setMsg({ ok: true, text: `Saved. New bills dated ${start} or later follow your ${type} registration.` });
  };

  return (
    <div className="col-span-full rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 sm:p-4 space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">GST registration (tax engine)</p>
        <p className="text-xs text-amber-900/80 mt-0.5">
          Composition and unregistered businesses never charge GST: bills become a Bill of Supply and the customer pays the quoted price.
          Leave this unset to keep the current behaviour.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-neutral-600">
          Registration
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm">
            <option value="">Not set (current behaviour)</option>
            <option value="composition">Composition scheme</option>
            <option value="unregistered">Unregistered</option>
          </select>
        </label>
        {type === 'composition' && (
          <label className="text-xs font-semibold text-neutral-600">
            Composition category
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm">
              <option value="trader">Trader / wholesaler / distributor</option>
            </select>
          </label>
        )}
        {type !== '' && (
          <label className="text-xs font-semibold text-neutral-600">
            Applies to bills dated from
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm" />
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save}
          className="px-4 py-2 rounded-xl bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800">
          Save GST registration
        </button>
        {msg && <span className={`text-xs font-medium ${msg.ok ? 'text-emerald-800' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
