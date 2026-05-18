import type { LabelHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-slate-700 mb-1 block", className)}
      {...rest}
    />
  );
}
