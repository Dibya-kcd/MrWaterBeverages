import React from 'react';

export interface LoadingSkeletonProps {
  /** Number of placeholder rows */
  rows?: number;
  className?: string;
}

/**
 * Lightweight loading placeholder for list screens while data syncs or computes.
 */
export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 4, className = '' }) => {
  return (
    <div className={`space-y-2.5 animate-pulse ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-xl bg-slate-100 border border-slate-200/80"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
};
