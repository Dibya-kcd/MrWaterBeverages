import React, { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown, ChevronLeft, Copy, RotateCcw, Upload } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  DEFAULT_LANDING, FEATURE_ICON_IDS, LandingContent, normalizeLanding,
  resetLanding, useLandingContent, writeLanding,
} from '../../constants/landingContent';

const field =
  'w-full px-3 py-2 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]';
const label = 'block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1';

/** Owner-only editor for the landing and sign-in page text. Saved on this device. */
export const LoginPageEditor: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const isPhone = useIsMobile(767);
  const { orgProfile } = useLedger();
  const saved = useLandingContent();
  const [draft, setDraft] = useState<LandingContent>(saved);
  const [msg, setMsg] = useState('');
  const [json, setJson] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(''), 2500);
    return () => window.clearTimeout(id);
  }, [msg]);

  const set = <K extends keyof LandingContent>(k: K, v: LandingContent[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setFeature = (i: number, patch: Partial<LandingContent['features'][number]>) =>
    setDraft((d) => ({ ...d, features: d.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const setPoint = (i: number, v: string) =>
    setDraft((d) => ({ ...d, panelPoints: d.panelPoints.map((p, j) => (j === i ? v : p)) }));

  const save = () => {
    writeLanding({ ...draft, panelPoints: draft.panelPoints.filter((p) => p.trim()) });
    setMsg('Saved. Sign out to see it.');
  };
  const reset = () => {
    resetLanding();
    setDraft(DEFAULT_LANDING);
    setMsg('Back to the original text.');
  };
  const copy = async () => {
    const text = JSON.stringify(draft, null, 2);
    setJson(text);
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copied. Paste it on another device.');
    } catch {
      setMsg('Select the text below and copy it.');
    }
  };
  const apply = () => {
    try {
      setDraft(normalizeLanding(JSON.parse(json)));
      setMsg('Loaded. Press Save to keep it.');
    } catch {
      setMsg('That is not valid JSON.');
    }
  };

  if (isPhone) {
    const previewTitle = (draft.brandName || '').trim() || orgProfile.name || 'Hydrate Hub';
    const previewTagline = (draft.badge || '').trim() || draft.subtitle;
    return (
      <div className="rt-flow-phone">
        <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
          <div className="hh-sales-top__row">
            <button type="button" className="hh-inv-backbtn" onClick={() => onBack?.()}>
              <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
              <span>Login page</span>
            </button>
          </div>
        </div>

        <div className="rt-flow-phone__body space-y-3">
          <div
            className="rounded-2xl border-[1.5px] border-dashed border-[#93c5fd] bg-[#eff6ff] py-5 flex items-center justify-center"
          >
            <Building2 size={28} className="text-[#2864d9]" aria-hidden="true" />
          </div>

          <button
            type="button"
            className="hh-inv-btn-outline w-full"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            Change logo &amp; copy
          </button>

          <label className="hh-inv-field hh-inv-field--focus">
            <span className="hh-inv-field__label">WELCOME TITLE</span>
            <input
              type="text"
              value={draft.brandName}
              onChange={(e) => set('brandName', e.target.value)}
              placeholder={orgProfile.name || 'Shree Beverages'}
            />
          </label>

          <label className="hh-inv-field">
            <span className="hh-inv-field__label">TAGLINE</span>
            <input
              type="text"
              value={draft.badge}
              onChange={(e) => set('badge', e.target.value)}
              placeholder="Fresh. On time."
            />
          </label>

          <div className="hh-inv-card text-center space-y-2 py-4">
            <div className="text-[11px] font-semibold text-slate-400">Preview</div>
            <div className="text-base font-extrabold text-slate-900">{previewTitle}</div>
            <div className="text-xs text-slate-500">{previewTagline}</div>
            <div className="pt-1">
              <span className="hh-inv-btn-primary w-full pointer-events-none">
                {draft.signInButton || 'Sign in'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-600 cursor-pointer"
          >
            <span>More landing text, cards &amp; JSON sync</span>
            <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="space-y-3 pb-2">
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">HEADLINE LINE 1</span>
                <input value={draft.headlineLine1} onChange={(e) => set('headlineLine1', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">HEADLINE LINE 2</span>
                <input value={draft.headlineLine2} onChange={(e) => set('headlineLine2', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">HEADLINE HIGHLIGHTED ENDING</span>
                <input value={draft.headlineAccent} onChange={(e) => set('headlineAccent', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">SUB-HEADING</span>
                <textarea rows={2} value={draft.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">SIGN IN BUTTON LABEL</span>
                <input value={draft.signInButton} onChange={(e) => set('signInButton', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">SIGN-IN SUB-TEXT</span>
                <textarea rows={2} value={draft.signInSubtitle} onChange={(e) => set('signInSubtitle', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">FOOTER LINE</span>
                <input value={draft.footer} onChange={(e) => set('footer', e.target.value)} />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">JSON BACKUP / TRANSFER</span>
                <textarea
                  rows={3}
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder="Paste JSON from another device..."
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={copy} className="hh-inv-btn-outline !min-h-[38px] !text-xs">Copy JSON</button>
                <button type="button" onClick={apply} disabled={!json.trim()} className="hh-inv-btn-outline !min-h-[38px] !text-xs disabled:opacity-50">Load JSON</button>
                <button type="button" onClick={reset} className="hh-inv-btn-outline !min-h-[38px] !text-xs">Reset</button>
              </div>
            </div>
          )}

          {msg && (
            <div className="hh-inv-toast">
              <Check size={16} className="text-emerald-400 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
        </div>

        <div className="hh-set-footer">
          <button type="button" onClick={save} className="hh-inv-btn-primary w-full">
            Save login page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs space-y-6">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-neutral-900">Login page</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Change the words on the landing and sign-in pages. Saved on this device only; use Copy / Paste JSON to move it to another one.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={label}>Brand name (blank = business name)</label>
          <input className={field} value={draft.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder="Hydrate Hub" /></div>
        <div><label className={label}>Small badge above the headline</label>
          <input className={field} value={draft.badge} onChange={(e) => set('badge', e.target.value)} /></div>
        <div><label className={label}>Headline, line 1</label>
          <input className={field} value={draft.headlineLine1} onChange={(e) => set('headlineLine1', e.target.value)} /></div>
        <div><label className={label}>Headline, line 2</label>
          <input className={field} value={draft.headlineLine2} onChange={(e) => set('headlineLine2', e.target.value)} /></div>
        <div className="md:col-span-2"><label className={label}>Headline, highlighted ending</label>
          <input className={field} value={draft.headlineAccent} onChange={(e) => set('headlineAccent', e.target.value)} /></div>
        <div className="md:col-span-2"><label className={label}>Sub-heading</label>
          <textarea className={field} rows={2} value={draft.subtitle} onChange={(e) => set('subtitle', e.target.value)} /></div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-neutral-800 mb-2">Feature cards</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {draft.features.map((f, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-3 space-y-2">
              <div className="flex gap-2">
                <select className={`${field} w-28 shrink-0`} value={f.icon} onChange={(e) => setFeature(i, { icon: e.target.value as typeof f.icon })} aria-label={`Icon for card ${i + 1}`}>
                  {FEATURE_ICON_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
                <input className={field} value={f.title} onChange={(e) => setFeature(i, { title: e.target.value })} aria-label={`Title of card ${i + 1}`} />
              </div>
              <input className={field} value={f.desc} onChange={(e) => setFeature(i, { desc: e.target.value })} aria-label={`Description of card ${i + 1}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={label}>Sign in button</label>
          <input className={field} value={draft.signInButton} onChange={(e) => set('signInButton', e.target.value)} /></div>
        <div><label className={label}>Footer line</label>
          <input className={field} value={draft.footer} onChange={(e) => set('footer', e.target.value)} /></div>
        <div><label className={label}>Salesman demo button</label>
          <input className={field} value={draft.salesmanDemoButton} onChange={(e) => set('salesmanDemoButton', e.target.value)} /></div>
        <div><label className={label}>Owner demo button</label>
          <input className={field} value={draft.ownerDemoButton} onChange={(e) => set('ownerDemoButton', e.target.value)} /></div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={label}>Sign-in title</label>
          <input className={field} value={draft.signInTitle} onChange={(e) => set('signInTitle', e.target.value)} /></div>
        <div><label className={label}>Sign-in side panel headline</label>
          <input className={field} value={draft.panelHeadline} onChange={(e) => set('panelHeadline', e.target.value)} /></div>
        <div className="md:col-span-2"><label className={label}>Sign-in sub-text</label>
          <textarea className={field} rows={2} value={draft.signInSubtitle} onChange={(e) => set('signInSubtitle', e.target.value)} /></div>
        {draft.panelPoints.map((p, i) => (
          <div key={i}><label className={label}>Side panel point {i + 1}</label>
            <input className={field} value={p} onChange={(e) => setPoint(i, e.target.value)} /></div>
        ))}
      </section>

      <section className="space-y-2">
        <textarea className={`${field} font-mono text-xs`} rows={4} value={json} onChange={(e) => setJson(e.target.value)} placeholder="Copy JSON puts this page's text here. Paste JSON from another device, then press Load." aria-label="Login page JSON" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="px-3 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5 cursor-pointer"><Copy size={14} />Copy JSON</button>
          <button type="button" onClick={apply} disabled={!json.trim()} className="px-3 py-2 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><Upload size={14} />Load JSON</button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
        <button type="button" onClick={save} className="px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer"><Check size={16} />Save</button>
        <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5 cursor-pointer"><RotateCcw size={15} />Reset to original</button>
        {msg && <span role="status" className="text-xs font-semibold text-emerald-700">{msg}</span>}
      </div>
    </div>
  );
};
