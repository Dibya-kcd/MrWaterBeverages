import React from 'react';
import { Check, Upload, Table } from 'lucide-react';

export type InwardStep = 'upload' | 'review';

export interface InwardStepIndicatorProps {
  step: InwardStep;
}

/** Step chrome for bulk inward (Upload → Review). */
export const InwardStepIndicator: React.FC<InwardStepIndicatorProps> = ({ step }) => {
  const steps: { id: InwardStep; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'upload', label: 'Upload / Scan', icon: Upload },
    { id: 'review', label: 'Review lines', icon: Table },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs font-bold" aria-label="Inward steps">
      {steps.map((s, i) => {
        const done = step === 'review' && s.id === 'upload';
        const active = step === s.id;
        const Icon = s.icon;
        return (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">/</span>}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : done
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {done ? <Check size={12} /> : <Icon size={12} />}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
};
