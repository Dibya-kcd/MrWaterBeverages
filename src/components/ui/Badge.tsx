import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-slate-900 text-white shadow-xs hover:bg-slate-800",
        primary: "border-transparent bg-sky-600 text-white shadow-xs",
        secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-200",
        destructive: "border-transparent bg-rose-600 text-white shadow-xs hover:bg-rose-700",
        danger: "border-rose-200 bg-rose-50 text-rose-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        accent: "border-sky-200 bg-sky-50 text-sky-800",
        neutral: "border-slate-200 bg-slate-100 text-slate-700",
        outline: "border-slate-300 text-slate-900",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px] rounded-md gap-1",
        default: "px-2.5 py-0.5 text-xs rounded-full gap-1.5",
        md: "px-2.5 py-1 text-xs rounded-lg gap-1.5",
        lg: "px-3 py-1.5 text-sm rounded-lg gap-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  const dotColorClass = {
    default: "bg-white",
    primary: "bg-white",
    secondary: "bg-slate-500",
    destructive: "bg-white",
    danger: "bg-rose-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    accent: "bg-sky-500",
    neutral: "bg-slate-400",
    outline: "bg-slate-500",
  }[variant || "default"];

  return (
    <div className={cn("border", badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColorClass)}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
export default Badge;
