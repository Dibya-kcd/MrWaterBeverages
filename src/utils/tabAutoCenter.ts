/**
 * Smart tab rows: when a tab / chip inside a sideways-scrolling row is tapped,
 * slide the row so that tab sits in the middle. Stops the "half-hidden active tab"
 * problem on phones. Works for every scrolling tab row in the app, no per-screen code.
 */
export function installTabAutoCenter(): () => void {
  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest?.('button') as HTMLElement | null;
    if (!btn) return;
    let el: HTMLElement | null = btn.parentElement;
    while (el && el !== document.body) {
      if (el.scrollWidth > el.clientWidth + 8) {
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') {
          // only rows of several buttons (tabs / chips), not big scrolling pages or tables
          if (el.querySelectorAll(':scope > button, :scope > * > button').length >= 3 && !el.querySelector('table')) {
            requestAnimationFrame(() => btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }));
          }
          return;
        }
      }
      el = el.parentElement;
    }
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
