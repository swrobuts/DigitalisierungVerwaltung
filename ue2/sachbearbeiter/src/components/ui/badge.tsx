import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "default" | "outline" | "secondary";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  default: "bg-slate-900 text-white",
  outline: "border border-slate-300 bg-white text-slate-700",
  secondary: "bg-slate-100 text-slate-700",
};

export function Badge({ variant = "default", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
