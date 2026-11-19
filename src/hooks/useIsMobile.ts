import { useEffect, useState } from 'react';

/**
 * True on phone-width screens (below Tailwind `sm`, 640 px). Pass a larger `maxWidth` (e.g. 767) to treat small
 * tablets as phones too. Updates on rotate / resize.
 */
export function useIsMobile(maxWidth = 639): boolean {
  const QUERY = `(max-width: ${maxWidth}px)`;
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false);
  const [isMobile, setIsMobile] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener ? mql.addEventListener('change', onChange) : mql.addListener(onChange);
    return () => {
      mql.removeEventListener ? mql.removeEventListener('change', onChange) : mql.removeListener(onChange);
    };
  }, [QUERY]);

  return isMobile;
}

/**
 * True when the compact (phone + tablet) order screens should be used: anything under 1024 px, PLUS touch-first
 * devices up to 1366 px wide (iPad landscape / iPad Pro 12.9"). Width alone cannot be raised to 1366 because
 * ordinary 1366 px laptops would then lose the desktop layout; `pointer: coarse` separates the two.
 */
export function useIsCompactLayout(): boolean {
  const QUERY = '(max-width: 1023px), (pointer: coarse) and (max-width: 1366px)';
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false);
  const [compact, setCompact] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setCompact(mql.matches);
    onChange();
    mql.addEventListener ? mql.addEventListener('change', onChange) : mql.addListener(onChange);
    return () => {
      mql.removeEventListener ? mql.removeEventListener('change', onChange) : mql.removeListener(onChange);
    };
  }, []);

  return compact;
}
