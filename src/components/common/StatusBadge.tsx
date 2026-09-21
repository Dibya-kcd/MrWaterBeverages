import React from 'react';
import { useLedger } from '../../context/LedgerContext';
import { BalanceStatus } from '../../types';

export const StatusBadge: React.FC<{ status: BalanceStatus }> = ({ status }) => {
  const { palette, fz } = useLedger();

  const colors = {
    good: { border: palette.good, color: palette.good, bg: `${palette.good}15` },
    bad: { border: palette.bad, color: palette.bad, bg: `${palette.bad}15` },
    warn: { border: palette.warn, color: palette.warn, bg: `${palette.warn}15` },
  }[status.balanceKey];

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 border-2 whitespace-nowrap"
      style={{
        borderColor: colors.border,
        color: colors.color,
        backgroundColor: colors.bg,
        ...fz(12, { fontWeight: 700 }),
      }}
    >
      {status.label}
    </span>
  );
};
