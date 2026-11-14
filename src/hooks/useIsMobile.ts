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
