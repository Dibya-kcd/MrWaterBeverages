/**
 * One shared behaviour for every popup / sheet in the app, including the many custom ones:
 *  - marks it as a dialog for screen readers (role="dialog", aria-modal)
 *  - moves keyboard focus into it when it opens and gives focus back when it closes
 *  - Escape closes the top-most popup (presses its Close / Cancel button, or the backdrop)
 * Popups built with the shared <Modal> already handle Escape themselves (data-esc-handled).
 */
const OVERLAY = /\bfixed\b/;
const isOverlay = (el: Element) => {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const c = el.getAttribute('class') || '';
  return (
    OVERLAY.test(c) &&
    /\binset-0\b/.test(c) &&
    /\bz-\[?(50|55|60|70|80|90|100|9998|9999)/.test(c) &&
    /\bbg-(slate|black|gray|zinc|\[#)/.test(c) &&
    el.querySelector('button, input, select, textarea, a') !== null
  );
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function installDialogA11y(): () => void {
  const known = new Map<Element, HTMLElement | null>(); // overlay -> element focused before it opened

  const overlays = () => Array.from(document.querySelectorAll('.fixed.inset-0')).filter(isOverlay);

  const sync = () => {
    const now = overlays();
    for (const el of now) {
      if (known.has(el)) continue;
      const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      known.set(el, before);
      if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
      if (!el.getAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
      if (!el.contains(document.activeElement)) {
        const target = (el.querySelector('[autofocus], input, textarea, select') as HTMLElement | null) ||
          (el.querySelector(FOCUSABLE) as HTMLElement | null);
        (el as HTMLElement).setAttribute('tabindex', '-1');
        // do not pop the on-screen keyboard open by itself on phones: focus the panel, not an input
        const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
        const focusEl = isTouch && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ? (el as HTMLElement) : target || (el as HTMLElement);
        try {
          focusEl.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    }
    for (const [el, before] of Array.from(known.entries())) {
      if (!document.contains(el)) {
        known.delete(el);
        if (before && document.contains(before)) {
          try {
            before.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        }
      }
    }
  };

  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
  sync();

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const list = overlays();
    const top = list[list.length - 1] as HTMLElement | undefined;
    if (!top || top.hasAttribute('data-esc-handled')) return;
    const buttons = Array.from(top.querySelectorAll('button')) as HTMLButtonElement[];
    const closer = buttons.find((b) => {
      const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim().toLowerCase();
      return !b.disabled && /^(close|cancel|dismiss|back|no, keep|×|x)\b/.test(t.replace(/^\W+/, '')) ;
    });
    e.preventDefault();
    if (closer) closer.click();
    else top.click();
  };
  document.addEventListener('keydown', onKey);

  return () => {
    mo.disconnect();
    document.removeEventListener('keydown', onKey);
  };
}
