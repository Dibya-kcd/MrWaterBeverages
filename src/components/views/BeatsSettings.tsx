import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, Pencil, Plus, Route, Trash2, Users, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useBeats } from '../../hooks/useBeats';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SUGGESTED_BEAT_NAMES, beatOfCustomer, placesWithoutBeat, suggestBeat } from '../../utils/beats';
import { ToggleSwitch } from '../ui/ToggleSwitch';

/**
 * Settings → Beats (owner only). Create, rename, switch off and delete beats, say which salesmen work each one,
 * and get customers into beats quickly (suggestions from places already typed on customers, auto-match preview).
 */
export const BeatsSettings: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const isPhone = useIsMobile(767);
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

  // Phone sub-screen state
  const [phoneSelectedId, setPhoneSelectedId] = useState<string | null>(null);
  const [phoneEditName, setPhoneEditName] = useState('');
  const [phoneEditActive, setPhoneEditActive] = useState(true);
  const [phoneAddOpen, setPhoneAddOpen] = useState(false);
  const [phoneMoveOpen, setPhoneMoveOpen] = useState(false);
  const [phoneMoveTargetId, setPhoneMoveTargetId] = useState('');

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
    if (isPhone) {
      return (
        <div className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => onBack?.()}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Beats</span>
              </button>
            </div>
          </div>
          <div className="rt-flow-phone__body">
            <div className="hh-inv-card text-sm text-slate-600">Only the owner can change beats.</div>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 text-sm text-slate-600">
        Only the owner can change beats.
      </div>
    );
  }

  const say = (tone: 'ok' | 'err', text: string) => setMsg({ tone, text });
  const card = 'rounded-2xl border p-4 sm:p-5 shadow-xs';
  const chip = (on: boolean) =>
    `h-8 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
      on
        ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-2xs'
        : 'bg-white/85 text-slate-700 border-black/10 hover:bg-white'
    }`;
  const btn = 'h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer transition-colors';

  const createInitial = () => {
    const names = [...picked, ...extra.split(',').map((s) => s.trim()).filter(Boolean)];
    const n = addBeats(names);
    say(n > 0 ? 'ok' : 'err', n > 0 ? `${n} beat${n === 1 ? '' : 's'} created.` : 'Pick or type at least one beat name.');
    setExtra('');
  };

  const deleting_ = deleting ? beats.find((b) => b.id === deleting) : undefined;
  const deletingMembers = deleting_ ? customersIn(deleting_.id) : [];

  const phoneEditingBeat = phoneSelectedId ? beats.find((b) => b.id === phoneSelectedId) : undefined;
  const phoneEditingMembers = phoneEditingBeat ? customersIn(phoneEditingBeat.id) : [];

  if (isPhone) {
    if (phoneEditingBeat) {
      const otherBeats = beats.filter((x) => x.id !== phoneEditingBeat.id);
      const previewNames = phoneEditingMembers.slice(0, 3).map((c) => c.name).join(', ');
      return (
        <div className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button
                type="button"
                className="hh-inv-backbtn"
                onClick={() => setPhoneSelectedId(null)}
              >
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Edit beat</span>
              </button>
              <button
                type="button"
                className="hh-sales-top__iconbtn"
                aria-label={`Delete ${phoneEditingBeat.name}`}
                onClick={() => { setDeleting(phoneEditingBeat.id); setMoveTo(''); }}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-3">
            {msg && (
              <div
                role="status"
                className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
                  msg.tone === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {msg.text}
              </div>
            )}

            <label className="hh-inv-field hh-inv-field--focus">
              <span className="hh-inv-field__label">BEAT NAME</span>
              <input
                type="text"
                value={phoneEditName}
                onChange={(e) => setPhoneEditName(e.target.value)}
                placeholder="Beat name"
              />
            </label>

            <div className="flex items-center justify-between gap-3 py-1 px-0.5">
              <div
                id="phone-beat-active-lbl"
                onClick={() => setPhoneEditActive((v) => !v)}
                className="cursor-pointer select-none min-w-0"
              >
                <div className="text-sm font-bold text-slate-900">Active</div>
                <div className="text-xs text-slate-500">Inactive beats are hidden from filters</div>
              </div>
              <ToggleSwitch
                id="toggle-phone-beat-active"
                checked={phoneEditActive}
                onChange={setPhoneEditActive}
                ariaLabelledBy="phone-beat-active-lbl"
              />
            </div>

            <div className="hh-inv-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">Customers in this beat</span>
                <span className="hh-set-badge-blue tabular-nums">{phoneEditingMembers.length}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {phoneEditingMembers.length === 0
                  ? 'No customers assigned to this beat yet.'
                  : `${previewNames}${phoneEditingMembers.length > 3 ? '...' : ''}`}
              </p>
              {phoneEditingMembers.length > 0 && otherBeats.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneMoveTargetId(otherBeats[0]?.id || '');
                    setPhoneMoveOpen(true);
                  }}
                  className="text-xs font-bold text-[#2864d9] cursor-pointer text-left pt-0.5"
                >
                  Move customers to another beat
                </button>
              )}
            </div>

            <div className="hh-inv-card space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Assigned salesmen</span>
              {staff.length === 0 ? (
                <p className="text-xs text-slate-400">Add salesmen under Staff first.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staff.map((s) => {
                    const on = (phoneEditingBeat.salesmanIds || []).includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        className={chip(on)}
                        onClick={() =>
                          updateBeat(phoneEditingBeat.id, {
                            salesmanIds: on
                              ? (phoneEditingBeat.salesmanIds || []).filter((x) => x !== s.id)
                              : [...(phoneEditingBeat.salesmanIds || []), s.id],
                          })
                        }
                      >
                        {on && <Check size={12} className="shrink-0" />}
                        <span>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="hh-set-footer">
            <button
              type="button"
              className="hh-inv-btn-primary w-full"
              onClick={() => {
                const trimmed = phoneEditName.trim();
                if (!trimmed) {
                  say('err', 'Beat name is required.');
                  return;
                }
                if (trimmed !== phoneEditingBeat.name) {
                  const r = renameBeat(phoneEditingBeat.id, trimmed);
                  if (!r.ok) {
                    say('err', r.error || 'Could not rename beat.');
                    return;
                  }
                }
                updateBeat(phoneEditingBeat.id, { active: phoneEditActive });
                say('ok', 'Beat updated.');
                setPhoneSelectedId(null);
              }}
            >
              Save beat
            </button>
          </div>

          {phoneMoveOpen && (
            <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-label="Move customers" onClick={() => setPhoneMoveOpen(false)}>
              <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                <div className="hh-grab" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-slate-900">Move {phoneEditingMembers.length} customers</h3>
                <p className="text-xs text-slate-500">Pick the beat to move all customers from {phoneEditingBeat.name}:</p>
                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">DESTINATION BEAT</span>
                  <select value={phoneMoveTargetId} onChange={(e) => setPhoneMoveTargetId(e.target.value)}>
                    {otherBeats.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button type="button" className="hh-inv-btn-outline" onClick={() => setPhoneMoveOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="hh-inv-btn-primary"
                    disabled={!phoneMoveTargetId}
                    onClick={() => {
                      const count = assignCustomers(phoneEditingMembers.map((m) => m.id), phoneMoveTargetId);
                      setPhoneMoveOpen(false);
                      say('ok', `${count} customer${count === 1 ? '' : 's'} moved.`);
                    }}
                  >
                    Move all
                  </button>
                </div>
              </div>
            </div>
          )}

          {deleting_ && (
            <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" onClick={() => setDeleting(null)}>
              <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                <div className="hh-grab" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-rose-600">Delete &quot;{deleting_.name}&quot;?</h3>
                {deletingMembers.length > 0 ? (
                  <>
                    <p className="text-xs text-slate-600">{deletingMembers.length} customer{deletingMembers.length === 1 ? ' is' : 's are'} in this beat. Choose where they go:</p>
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">MOVE CUSTOMERS TO</span>
                      <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                        <option value="">No beat (assign later)</option>
                        {beats.filter((x) => x.id !== deleting_.id && x.active !== false).map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className="text-xs text-slate-600">No customers are in this beat. Past trips keep their route name.</p>
                )}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button type="button" className="hh-inv-btn-outline" onClick={() => setDeleting(null)}>Keep</button>
                  <button
                    type="button"
                    className="hh-inv-btn-danger"
                    onClick={() => {
                      const r = deleteBeat(deleting_.id, moveTo === '' ? null : moveTo);
                      setDeleting(null);
                      setPhoneSelectedId(null);
                      say(r.ok ? 'ok' : 'err', r.ok ? `Beat "${deleting_.name}" deleted.` : r.error || '');
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="rt-flow-phone">
        <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
          <div className="hh-sales-top__row">
            <button type="button" className="hh-inv-backbtn" onClick={() => onBack?.()}>
              <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
              <span>Beats</span>
            </button>
            <button
              type="button"
              className="hh-sales-top__iconbtn"
              aria-label="Add beat"
              onClick={() => setPhoneAddOpen(true)}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="rt-flow-phone__body space-y-2.5 hh-inv-pb">
          {msg && (
            <div
              role="status"
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
                msg.tone === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {msg.text}
            </div>
          )}

          {!configured && (
            <div className="hh-inv-card space-y-2.5">
              <h3 className="text-sm font-bold text-slate-900">Set up your beats</h3>
              <p className="text-xs text-slate-500">Tap to choose initial beats or add your own.</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_BEAT_NAMES.map((n) => (
                  <button key={n} type="button" className={chip(picked.includes(n))} onClick={() => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))}>
                    {picked.includes(n) && <Check size={12} className="shrink-0" />}
                    <span>{n}</span>
                  </button>
                ))}
              </div>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">OTHER BEATS (COMMA SEPARATED)</span>
                <input
                  placeholder="e.g. Sixth Beat, Another Place"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                />
              </label>
              <button type="button" className="hh-inv-btn-primary w-full" onClick={createInitial}>
                Create beats
              </button>
            </div>
          )}

          {configured && beats.length === 0 && (
            <div className="hh-inv-card text-center py-6 space-y-2">
              <p className="text-sm font-bold text-slate-800">No beats yet</p>
              <p className="text-xs text-slate-500">Tap + above to create your first delivery route.</p>
            </div>
          )}

          {beats.map((b) => {
            const members = customersIn(b.id).length;
            const isActive = b.active !== false;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setPhoneSelectedId(b.id);
                  setPhoneEditName(b.name);
                  setPhoneEditActive(b.active !== false);
                }}
                className="hh-inv-card w-full flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="hh-set-icon bg-blue-50 text-[#2864d9]">
                    <Route size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900 truncate">{b.name}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {members} customer{members === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <span className={isActive ? 'hh-set-badge-green shrink-0' : 'hh-set-badge-blue shrink-0'}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </button>
            );
          })}

          <p className="text-xs text-slate-500 px-0.5 pt-0.5">
            Customers without a beat show as &quot;No beat yet&quot;.
          </p>

          {configured && matches.length > 0 && (
            <div className="hh-inv-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900">Customers without a beat</div>
                  <div className="text-[11px] text-slate-500">{unassigned.length} unassigned</div>
                </div>
                <button
                  type="button"
                  className="text-xs font-bold text-[#2864d9] cursor-pointer shrink-0"
                  onClick={() => { setMatchOpen((v) => !v); setMatchOff(new Set()); }}
                >
                  {matchOpen ? 'Hide' : `Auto-match ${matches.length}`}
                </button>
              </div>
              {matchOpen && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {matches.map(({ c, beat }) => (
                      <label key={c.id} className="flex items-center gap-2 py-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!matchOff.has(c.id)}
                          onChange={() =>
                            setMatchOff((s) => {
                              const n = new Set(s);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          }
                        />
                        <span className="flex-1 min-w-0 truncate font-semibold text-slate-800">{c.name}</span>
                        <span className="font-bold text-[#2864d9] shrink-0">→ {beat.name}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="hh-inv-btn-primary w-full"
                    onClick={() => {
                      const byBeat = new Map<string, string[]>();
                      for (const { c, beat } of matches) {
                        if (!matchOff.has(c.id)) byBeat.set(beat.id, [...(byBeat.get(beat.id) || []), c.id]);
                      }
                      let n = 0;
                      byBeat.forEach((ids, beatId) => { n += assignCustomers(ids, beatId); });
                      setMatchOpen(false);
                      say('ok', `${n} customer${n === 1 ? '' : 's'} added to their beats.`);
                    }}
                  >
                    Apply matches
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {phoneAddOpen && (
          <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-label="Add beat" onClick={() => setPhoneAddOpen(false)}>
            <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
              <div className="hh-grab" aria-hidden="true" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">New beat</h3>
                <button type="button" aria-label="Close" onClick={() => setPhoneAddOpen(false)} className="p-1 text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <label className="hh-inv-field hh-inv-field--focus">
                <span className="hh-inv-field__label">BEAT NAME</span>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Old Town"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              {places.length > 0 && (
                <div>
                  <div className="hh-set-section-lbl">Suggested from addresses</div>
                  <div className="flex flex-wrap gap-1.5">
                    {places.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className={chip(false)}
                        onClick={() => {
                          const r = addBeat(p.name);
                          say(r.ok ? 'ok' : 'err', r.ok ? `Beat "${p.name}" added.` : r.error || '');
                          if (r.ok) setPhoneAddOpen(false);
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="text-slate-400 tabular-nums">{p.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                className="hh-inv-btn-primary w-full"
                disabled={!newName.trim()}
                onClick={() => {
                  const r = addBeat(newName);
                  if (r.ok) {
                    setNewName('');
                    setPhoneAddOpen(false);
                    say('ok', `Beat "${r.beat?.name}" added.`);
                  } else {
                    say('err', r.error || 'Could not add.');
                  }
                }}
              >
                Add beat
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {msg && (
        <div
          role="status"
          className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
            msg.tone === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      {!configured && (
        <div data-card-tone="sales" className={card}>
          <h3 className="text-sm font-bold text-slate-900">Set up your beats</h3>
          <p className="text-xs text-slate-500 mt-1">Tap to choose, then add any others (separate with commas). You can change all of this later.</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SUGGESTED_BEAT_NAMES.map((n) => (
              <button key={n} type="button" className={chip(picked.includes(n))} onClick={() => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))}>
                {picked.includes(n) && <Check size={12} className="shrink-0" />}
                <span>{n}</span>
              </button>
            ))}
          </div>
          <input
            className="crate-input mt-3 w-full"
            placeholder="Other beats, e.g. Sixth Beat, Another Place"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          <button
            type="button"
            className="mt-3 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-semibold cursor-pointer"
            onClick={createInitial}
          >
            Create beats
          </button>
        </div>
      )}

      {configured && (
        <div data-card-tone="profit" className={card}>
          <div className="flex items-center gap-2">
            <input
              className="crate-input flex-1 min-w-0"
              placeholder="New beat name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click(); }}
            />
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              onClick={() => {
                const r = addBeat(newName);
                if (r.ok) { setNewName(''); say('ok', `Beat "${r.beat?.name}" added.`); } else say('err', r.error || 'Could not add.');
              }}
            >
              Add beat
            </button>
          </div>
          {places.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-2">Suggested from customer addresses:</p>
              <div className="flex flex-wrap gap-1.5">
                {places.map((p) => (
                  <button key={p.name} type="button" className={chip(false)} onClick={() => { const r = addBeat(p.name); say(r.ok ? 'ok' : 'err', r.ok ? `Beat "${p.name}" added.` : r.error || ''); }}>
                    <span>{p.name}</span>
                    <span className="text-slate-400 tabular-nums">{p.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {configured && beats.length === 0 && <div data-card-tone="neutral" className={card}><p className="text-sm text-slate-500">No beats yet. Add one above.</p></div>}

      <div className="space-y-3">
        {beats.map((b) => {
          const members = customersIn(b.id).length;
          const isEditing = editing?.id === b.id;
          const isActive = b.active !== false;
          return (
            <div
              key={b.id}
              data-card-tone={isActive ? 'sales' : 'neutral'}
              className={`${card} ${!isActive ? 'opacity-75' : ''}`}
            >
              {isEditing ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className="crate-input flex-1 min-w-0"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: b.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const r = renameBeat(b.id, editing.name);
                        if (r.ok) { setEditing(null); say('ok', 'Beat renamed. Its customers moved with it.'); }
                        else say('err', r.error || '');
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className={`${btn} bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]`}
                      onClick={() => {
                        const r = renameBeat(b.id, editing.name);
                        if (r.ok) { setEditing(null); say('ok', 'Beat renamed. Its customers moved with it.'); }
                        else say('err', r.error || '');
                      }}
                    >
                      Save
                    </button>
                    <button type="button" className={`${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`hh-icon-badge ${isActive ? 'hh-icon-badge--blue' : 'hh-icon-badge--slate'}`}>
                      <Route size={18} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-extrabold text-slate-900 leading-snug break-words">
                          {b.name}
                        </h3>
                        {!isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-bold uppercase text-slate-500 border border-slate-200">
                            Off
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/80 border border-black/5 text-[11px] font-bold text-slate-700 tabular-nums">
                          {members} customer{members === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className={`${btn} border border-black/10 bg-white/85 text-slate-800 hover:bg-white`}
                      onClick={() => setEditing({ id: b.id, name: b.name })}
                    >
                      <Pencil size={12} className="text-slate-600 shrink-0" />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      className={`${btn} border border-black/10 bg-white/85 text-slate-800 hover:bg-white`}
                      onClick={() => updateBeat(b.id, { active: b.active === false })}
                    >
                      {b.active === false ? 'Switch on' : 'Switch off'}
                    </button>
                    <button
                      type="button"
                      className="ml-auto sm:ml-0 size-8 rounded-lg border border-rose-200/80 bg-white/80 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      onClick={() => { setDeleting(b.id); setMoveTo(''); }}
                      aria-label={`Delete ${b.name}`}
                      title={`Delete ${b.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-black/5">
                <p className="text-xs font-medium text-slate-500 mb-2">Assigned salesmen</p>
                {staff.length === 0 ? (
                  <p className="text-xs text-slate-400">Add salesmen under Staff &amp; Roles first.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {staff.map((s) => {
                      const on = (b.salesmanIds || []).includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          className={chip(on)}
                          onClick={() =>
                            updateBeat(b.id, {
                              salesmanIds: on
                                ? (b.salesmanIds || []).filter((x) => x !== s.id)
                                : [...(b.salesmanIds || []), s.id],
                            })
                          }
                        >
                          {on && <Check size={12} className="shrink-0" />}
                          <span>{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {configured && beats.length > 0 && (
        <div
          data-card-tone={unassigned.length > 0 ? 'warning' : 'received'}
          className={card}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`hh-icon-badge ${
                  unassigned.length > 0 ? 'hh-icon-badge--amber' : 'hh-icon-badge--green'
                }`}
              >
                <Users size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Customers without a beat</h3>
                <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                  {unassigned.length} customer{unassigned.length === 1 ? '' : 's'} not assigned to a beat yet.
                </p>
              </div>
            </div>
            {matches.length > 0 && (
              <button
                type="button"
                className={`${btn} self-start sm:self-auto bg-slate-900 text-white hover:bg-slate-800`}
                onClick={() => { setMatchOpen((v) => !v); setMatchOff(new Set()); }}
              >
                {matchOpen ? 'Hide matches' : `Auto-match ${matches.length}`}
              </button>
            )}
          </div>
          {matchOpen && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500 mb-2">Matched from each customer&apos;s address. Uncheck any that do not fit, then apply.</p>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {matches.map(({ c, beat }) => (
                  <label key={c.id} className="flex items-center gap-2 py-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={!matchOff.has(c.id)} onChange={() => setMatchOff((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                    <span className="flex-1 min-w-0 break-words font-semibold text-slate-800">{c.name}</span>
                    <span className="font-semibold text-[var(--primary)] whitespace-nowrap shrink-0">→ {beat.name}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className={`${btn} bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] mt-3`}
                onClick={() => {
                  const byBeat = new Map<string, string[]>();
                  for (const { c, beat } of matches) if (!matchOff.has(c.id)) byBeat.set(beat.id, [...(byBeat.get(beat.id) || []), c.id]);
                  let n = 0;
                  byBeat.forEach((ids, beatId) => { n += assignCustomers(ids, beatId); });
                  setMatchOpen(false);
                  say('ok', `${n} customer${n === 1 ? '' : 's'} added to their beats.`);
                }}
              >
                Apply matches
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
