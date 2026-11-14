import React from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  title?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'primary' | 'emerald' | 'gst';
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  id,
  title,
  ariaLabel,
  ariaLabelledBy,
  size = 'md',
  tone = 'primary',
  className = '',
}) => {
  const sizeClass =
    size === 'sm' ? 'hh-switch--sm' : size === 'lg' ? 'hh-switch--lg' : '';

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      title={title}
      disabled={disabled}
      data-tone={tone}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`hh-switch ${sizeClass} ${className}`.trim()}
    >
      <span className="hh-switch__thumb" aria-hidden="true" />
    </button>
  );
};
