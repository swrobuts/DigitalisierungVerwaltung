import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange?.(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  if (!open) {
    // Find the trigger child and render only it
    let trigger: ReactNode = null;
    function walk(c: ReactNode): void {
      if (Array.isArray(c)) c.forEach(walk);
      else if (c && typeof c === "object" && "type" in c && (c as { type: unknown }).type === DialogTrigger) {
        trigger = c;
      }
    }
    walk(children);
    return <>{trigger}</>;
  }

  // Render only the DialogContent when open; trigger is consumed elsewhere
  let content: ReactNode = null;
  let trigger: ReactNode = null;
  function walk(c: ReactNode): void {
    if (Array.isArray(c)) c.forEach(walk);
    else if (c && typeof c === "object" && "type" in c) {
      const t = (c as { type: unknown }).type;
      if (t === DialogContent) content = c;
      else if (t === DialogTrigger) trigger = c;
    }
  }
  walk(children);

  return (
    <>
      {trigger}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => onOpenChange?.(false)}
      >
        <div onClick={(e) => e.stopPropagation()}>{content}</div>
      </div>
    </>
  );
}

export function DialogTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  // asChild: render children as-is (assume already a Button with onClick that opens)
  void asChild;
  return <>{children}</>;
}

export function DialogContent({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children }: { children?: ReactNode }) {
  return <div className="mb-4 space-y-1">{children}</div>;
}

export function DialogTitle({ children }: { children?: ReactNode }) {
  return <h3 className="text-base font-semibold">{children}</h3>;
}

export function DialogDescription({ children }: { children?: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function DialogFooter({ children }: { children?: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}
