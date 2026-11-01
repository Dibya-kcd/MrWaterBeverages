import React from 'react';
import { BalanceStatus } from '../../types';
import { Badge } from '../ui/Badge';

export const StatusBadge: React.FC<{ status: BalanceStatus }> = ({ status }) => {
  const variantMap: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
    good: 'success',
    bad: 'danger',
    warn: 'warning',
  };

  const variant = variantMap[status.balanceKey] || 'neutral';

  return (
    <Badge variant={variant} size="md" dot>
      {status.label}
    </Badge>
  );
};
