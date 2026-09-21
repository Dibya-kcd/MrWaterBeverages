import React from 'react';
import { useLedger } from '../../context/LedgerContext';

interface IconButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>;
  label?: string;
  tooltip?: string;
  variant?: 'standard' | 'danger' | 'primary';
  color?: string;
  className?: string;
  id?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  onClick,
  icon: Icon,
  label,
  tooltip,
  variant = 'standard',
  color,
  className = '',
  id,
}) => {
  const { palette, scale } = useLedger();

  const titleText = tooltip || label || 'Action';
  const resolvedColor =
    color ||
    (variant === 'danger'
      ? palette.bad
      : variant === 'primary'
      ? palette.navy
      : palette.ink);

  const resolvedBorder =
    variant === 'danger'
      ? palette.bad
      : color || palette.line;

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-label={titleText}
      title={titleText}
      className={`border-2 p-1.5 flex items-center justify-center focus-ring cursor-pointer transition-colors ${className}`}
      style={{
        borderColor: resolvedBorder,
        color: resolvedColor,
        backgroundColor: palette.panel,
        minWidth: `${32 * scale}px`,
        minHeight: `${32 * scale}px`,
      }}
    >
      <Icon size={Math.round(16 * scale)} aria-hidden="true" />
    </button>
  );
};
