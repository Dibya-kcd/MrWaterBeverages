import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLedger } from '../context/LedgerContext';
import { useBeats } from './useBeats';

/**
 * Beat filter for customer pickers. A salesman who has been given beats starts on his first beat and sees only his
 * beats as choices (plus "All"); the owner sees every active beat. "none" = customers not in any beat yet.
 */
export function useBeatFilter() {
  const { beats, myBeats, customerBeat } = useBeats();
  const { customers, currentUser } = useLedger();
  const isSalesman = currentUser?.role === 'salesman';

  const [value, setValueState] = useState<string>('all');
  const touched = useRef(false);
  const setValue = useCallback((v: string) => {
    touched.current = true;
    setValueState(v);
  }, []);

  // The salesman's beats may load after this screen opens: start on the first one unless he already chose.
  useEffect(() => {
    if (!touched.current && isSalesman && myBeats.length > 0) setValueState(myBeats[0].id);
  }, [isSalesman, myBeats]);

  const options = useMemo(
    () => (isSalesman && myBeats.length > 0 ? myBeats : beats.filter((b) => b.active !== false)),
    [isSalesman, myBeats, beats],
  );

  const beatIdByCustomer = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers || []) m.set(c.id, customerBeat(c)?.id || '');
    return m;
  }, [customers, customerBeat]);

  const apply = useCallback(
    <T extends { id?: string }>(list: T[]): T[] => {
      if (value === 'all') return list;
      return list.filter((c) => {
        const b = (c.id && beatIdByCustomer.get(c.id)) || '';
        return value === 'none' ? !b : b === value;
      });
    },
    [value, beatIdByCustomer],
  );

  return { value, setValue, options, apply, active: value !== 'all', hasBeats: options.length > 0, isSalesman };
}
