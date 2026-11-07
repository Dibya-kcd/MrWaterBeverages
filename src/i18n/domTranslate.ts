/**
 * Shows Odia for the fixed English texts on the salesman screens (labels, buttons, placeholders, hints, toasts)
 * without touching every component: it swaps the text of matching text nodes and of placeholder / title /
 * aria-label attributes using odiaPhrases.ts, and puts the English back when the language is switched off.
 * Product and customer names are NOT handled here (see OdiaName / odiaTransliterate).
 */
import { PHRASES_OR, PATTERNS } from './odiaPhrases';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const LOOKUP = new Map<string, string>();
for (const [en, or] of Object.entries(PHRASES_OR)) LOOKUP.set(norm(en), or);

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);

/** Odia for one English text, or null when there is no translation. */
export function translatePhrase(text: string): string | null {
  const key = norm(text);
  if (!key || !/[a-z]/i.test(key)) return null;
  const hit = LOOKUP.get(key);
  if (hit) return hit;
  const raw = text.replace(/\s+/g, ' ').trim();
  for (const [re, out] of PATTERNS) {
    if (re.test(raw)) return raw.replace(re, out);
  }
  return null;
}

function keepSpaces(original: string, translated: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? '';
  const trail = original.match(/\s*$/)?.[0] ?? '';
  return lead + translated + trail;
}

type Shown = { orig: string; shown: string };
const textState = new WeakMap<Text, Shown>();
const attrState = new WeakMap<Element, Record<string, Shown>>();

function doText(node: Text) {
  const cur = node.data;
  const st = textState.get(node);
  if (st && cur === st.shown) return; // already ours
  const tr = translatePhrase(cur);
  if (tr === null) {
    if (st) textState.delete(node);
    return;
  }
  const shown = keepSpaces(cur, tr);
  textState.set(node, { orig: cur, shown });
  node.data = shown;
}

function doAttrs(el: Element) {
  let rec = attrState.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (!cur) continue;
    if (rec?.[a] && rec[a].shown === cur) continue;
    const tr = translatePhrase(cur);
    if (tr === null) continue;
    if (!rec) {
      rec = {};
      attrState.set(el, rec);
    }
    rec[a] = { orig: cur, shown: tr };
    el.setAttribute(a, tr);
  }
}

function walk(root: Node, fn: { text: (t: Text) => void; el: (e: Element) => void }) {
  if (root.nodeType === Node.TEXT_NODE) {
    const p = root.parentElement;
    if (!p || !SKIP_TAGS.has(p.tagName)) fn.text(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP_TAGS.has(el.tagName) || el.closest('[data-no-translate]')) return;
  fn.el(el);
  el.childNodes.forEach((c) => walk(c, fn));
}

const apply = { text: doText, el: doAttrs };
const restore = {
  text: (t: Text) => {
    const st = textState.get(t);
    if (st && t.data === st.shown) t.data = st.orig;
    textState.delete(t);
  },
  el: (e: Element) => {
    const rec = attrState.get(e);
    if (!rec) return;
    for (const [a, st] of Object.entries(rec)) if (e.getAttribute(a) === st.shown) e.setAttribute(a, st.orig);
    attrState.delete(e);
  },
};

/** Start translating the whole page and everything React adds later. Returns a stop function that restores English. */
export function startOdiaDomTranslation(): () => void {
  if (typeof document === 'undefined' || !document.body) return () => {};
  let pending = false;
  const queue = new Set<Node>();
  const flush = () => {
    pending = false;
    observer.disconnect();
    try {
      queue.forEach((n) => {
        if (n.isConnected) walk(n, apply);
      });
    } finally {
      queue.clear();
      observer.observe(document.body, OPTS);
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(flush);
  };
  const OPTS: MutationObserverInit = {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  };
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => queue.add(n));
      else if (r.type === 'characterData') queue.add(r.target);
      else if (r.type === 'attributes') queue.add(r.target);
    }
    if (queue.size) schedule();
  });
  walk(document.body, apply);
  observer.observe(document.body, OPTS);
  return () => {
    observer.disconnect();
    walk(document.body, restore);
  };
}
