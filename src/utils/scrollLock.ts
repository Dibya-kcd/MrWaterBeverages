/**
 * While any popup / sheet is open, stop the page behind it from scrolling.
 * (On phones, swiping inside a popup otherwise drags the page underneath.)
 * Works for every popup in the app: it simply watches for a full-screen dimmed overlay.
 */
const isOverlay = (el: Element) => {
  const c = (el.getAttribute('class') || '');
  return /\bfixed\b/.test(c) && /\binset-0\b/.test(c) && /\bz-\[?(50|55|60|70|80|90|100|9998|9999)/.test(c) && /\bbg-(slate|black|gray|zinc|\[#)/.test(c);
};

export function installScrollLock(): () => void {
  let locked = false;
  let prev = '';
  const sync = () => {
    const any = Array.from(document.querySelectorAll('.fixed.inset-0')).some(isOverlay);
    if (any && !locked) {
      prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      locked = true;
    } else if (!any && locked) {
      document.body.style.overflow = prev;
      locked = false;
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
  return () => {
    mo.disconnect();
    if (locked) document.body.style.overflow = prev;
  };
}
