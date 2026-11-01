import React, { useMemo, useState } from 'react';
import { useLedger } from '../../context/LedgerContext';
import { useBeats } from '../../hooks/useBeats';
import { SUGGESTED_BEAT_NAMES, beatOfCustomer, placesWithoutBeat, suggestBeat } from '../../utils/beats';

/**
 * Settings → Beats (owner only). Create, rename, switch off and delete beats, say which salesmen work each one,
 * and get customers into beats quickly (suggestions from places already typed on customers, auto-match preview).
 */
export const BeatsSettings: React.FC = () => {
  const { currentUser, salesmen, customers } = useLedger();
  const {
    beats, configured, addBeat, addBeats, renameBeat, updateBeat, deleteBeat, assignCustomers, customersIn,
  } = useBeats();

  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [picked, setPicked] = useState<string[]>(SUGGESTED_BEAT_NAMES);
  const [extra, setExtra] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>('');
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchOff, setMatchOff] = useState<Set<string>>(new Set());

  const staff = useMemo(() => (salesmen || []).filter((s) => s.active !== false), [salesmen]);
  const unassigned = useMemo(() => (customers || []).filter((c) => !beatOfCustomer(c, beats)), [customers, beats]);
  const places = useMemo(() => (configured ? placesWithoutBeat(customers || [], beats).slice(0, 8) : []), [customers, beats, configured]);
  const matches = useMemo(() => {
    const out: { c: (typeof unassigned)[number]; beat: (typeof beats)[number] }[] = [];
    for (const c of unassigned) {
      const beat = suggestBeat(c, beats);
      if (beat) out.push({ c, beat });
    }
    return out;
  }, [unassigned, beats]);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200/90 p-4 text-sm text-neutral-600">
        Only the owner can change beats.
      </div>
    );
  }

  const say = (tone: 'ok' | 'err', text: string) => setMsg({ tone, text });
  const card = 'bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-5 shadow-xs';
  const chip = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
      on ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
    }`;
  const btn = 'px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors';

  const createInitial = () => {
    const names = [...picked, ...extra.split(',').map((s) => s.trim()).filter(Boolean)];
    const n = addBeats(names);
    say(n > 0 ? 'ok' : 'err', n > 0 ? `${n} beat${n === 1 ? '' : 's'} created.` : 'Pick or type at least one beat name.');
    setExtra('');
  };

  const deleting_ = deleting ? beats.find((b) => b.id === deleting) : undefined;
  const deletingMembers = deleting_ ? customersIn(deleting_.id) : [];

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-lg font-bold text-neutral-900">Beats</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Delivery areas such as Kuchinda Town or Laida. Customers are put in a beat, salesmen are given the beats they
          work, and billing screens filter customers by beat. Only the owner can change this.
        </p>
        {msg && (
          <div className={`mt-3 px-3 py-2 rounded-xl text-xs font-semibold ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            {msg.text}
          </div>
        )}
      </div>

      {!configured && (
        <div className={card}>
          <h3 className="text-sm font-bold text-neutral-900">Set up your beats</h3>
          <p className="text-xs text-neutral-500 mt-1">Tap to choose, then add any others (separate with commas). You can change all of this later.</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SUGGESTED_BEAT_NAMES.map((n) => (
              <button key={n} type="button" className={chip(picked.includes(n))} onClick={() => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))}>
                {n}
              </button>
            ))}
          </div>
          <input
            className="crate-input mt-3 w-full"
            placeholder="Other beats, e.g. Sixth Beat, Another Place"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          <button type="button" className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800 mt-3`} onClick={createInitial}>
            Create beats
          </button>
        </div>
      )}

      {configured && (
        <div className={card}>
          <div className="flex gap-2">
            <input
              className="crate-input flex-1"
              placeholder="New beat name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click(); }}
            />
            <button
              type="button"
              className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}
              onClick={() => {
                const r = addBeat(newName);
                if (r.ok) { setNewName(''); say('ok', `Beat "${r.beat?.name}" added.`); } else say('err', r.error || 'Could not add.');
              }}
            >
              Add beat
            </button>
          </div>
          {places.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] text-neutral-500 mb-1.5">Places already typed on your customers — tap to create a beat:</p>
              <div className="flex flex-wrap gap-1.5">
                {places.map((p) => (
                  <button key={p.name} type="button" className={chip(false)} onClick={() => { const r = addBeat(p.name); say(r.ok ? 'ok' : 'err', r.ok ? `Beat "${p.name}" added.` : r.error || ''); }}>
                    {p.name} · {p.count}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {configured && beats.length === 0 && <div className={card}><p className="text-sm text-neutral-500">No beats yet. Add one above.</p></div>}

      {beats.map((b) => {
        const members = customersIn(b.id).length;
        const isEditing = editing?.id === b.id;
        return (
          <div key={b.id} className={`${card} ${b.active === false ? 'opacity-70' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              {isEditing ? (
                <div className="flex gap-2 flex-1">
                  <input className="crate-input flex-1" value={editing.name} onChange={(e) => setEditing({ id: b.id, name: e.target.value })} autoFocus />
                  <button type="button" className={`${btn} bg-emerald-700 text-white`} onClick={() => { const r = renameBeat(b.id, editing.name); if (r.ok) { setEditing(null); say('ok', 'Beat renamed. Its customers moved with it.'); } else say('err', r.error || ''); }}>Save</button>
                  <button type="button" className={`${btn} border border-neutral-300`} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="font-bold text-neutral-900 truncate">{b.name}{b.active === false && <span className="ml-2 text-[10px] font-semibold text-neutral-500">(off)</span>}</div>
                  <div className="text-xs text-neutral-500">{members} customer{members === 1 ? '' : 's'}</div>
                </div>
              )}
              {!isEditing && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" className={`${btn} border border-neutral-300`} onClick={() => setEditing({ id: b.id, name: b.name })}>Rename</button>
                  <button type="button" className={`${btn} border border-neutral-300`} onClick={() => updateBeat(b.id, { active: b.active === false })}>
                    {b.active === false ? 'Switch on' : 'Switch off'}
                  </button>
                  <button type="button" className={`${btn} border border-rose-300 text-rose-700`} onClick={() => { setDeleting(b.id); setMoveTo(''); }}>Delete</button>
                </div>
              )}
            </div>
            <div className="mt-3">
              <p className="text-[11px] text-neutral-500 mb-1.5">Salesmen who work this beat:</p>
              {staff.length === 0 ? (
                <p className="text-xs text-neutral-400">Add salesmen under Staff & Roles first.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staff.map((s) => {
                    const on = (b.salesmanIds || []).includes(s.id);
                    return (
                      <button key={s.id} type="button" className={chip(on)} onClick={() => updateBeat(b.id, { salesmanIds: on ? (b.salesmanIds || []).filter((x) => x !== s.id) : [...(b.salesmanIds || []), s.id] })}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {configured && beats.length > 0 && (
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Customers without a beat</h3>
              <p className="text-xs text-neutral-500">{unassigned.length} customer{unassigned.length === 1 ? '' : 's'} not in any beat yet. You can also set a customer's beat when you edit them.</p>
            </div>
            {matches.length > 0 && (
              <button type="button" className={`${btn} bg-neutral-900 text-white`} onClick={() => { setMatchOpen((v) => !v); setMatchOff(new Set()); }}>
                {matchOpen ? 'Hide' : `Auto-match ${matches.length}`}
              </button>
            )}
          </div>
          {matchOpen && (
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <p className="text-[11px] text-neutral-500 mb-2">Matched from the city / address typed on each customer. Untick any that are wrong, then apply.</p>
              <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
                {matches.map(({ c, beat }) => (
                  <label key={c.id} className="flex items-center gap-2 py-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={!matchOff.has(c.id)} onChange={() => setMatchOff((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                    <span className="flex-1 truncate font-semibold text-neutral-800">{c.name}</span>
                    <span className="text-neutral-400 truncate max-w-[30%]">{c.city || c.address || ''}</span>
                    <span className="font-bold text-emerald-700">→ {beat.name}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className={`${btn} bg-emerald-700 text-white mt-3`}
                onClick={() => {
                  const byBeat = new Map<string, string[]>();
                  for (const { c, beat } of matches) if (!matchOff.has(c.id)) byBeat.set(beat.id, [...(byBeat.get(beat.id) || []), c.id]);
                  let n = 0;
                  byBeat.forEach((ids, beatId) => { n += assignCustomers(ids, beatId); });
                  setMatchOpen(false);
                  say('ok', `${n} customer${n === 1 ? '' : 's'} added to their beats.`);
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}

      {deleting_ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h3 className="font-bold text-neutral-900">Delete "{deleting_.name}"?</h3>
            {deletingMembers.length > 0 ? (
              <>
                <p className="text-xs text-neutral-600">{deletingMembers.length} customer{deletingMembers.length === 1 ? ' is' : 's are'} in this beat. Choose where they go:</p>
                <select className="crate-input w-full" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">No beat (assign later)</option>
                  {beats.filter((x) => x.id !== deleting_.id && x.active !== false).map((x) => <option key={x.id} value={x.id}>Move to {x.name}</option>)}
                </select>
              </>
            ) : (
              <p className="text-xs text-neutral-600">No customers are in this beat.</p>
            )}
            <p className="text-[11px] text-neutral-500">Past trips keep their route name. If unsure, use Switch off instead.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${btn} border border-neutral-300`} onClick={() => setDeleting(null)}>Cancel</button>
              <button
                type="button"
                className={`${btn} bg-rose-600 text-white`}
                onClick={() => {
                  const r = deleteBeat(deleting_.id, moveTo === '' ? null : moveTo);
                  setDeleting(null);
                  say(r.ok ? 'ok' : 'err', r.ok ? `Beat "${deleting_.name}" deleted.` : r.error || '');
                }}
              >
                Delete beat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
