// Minimaler Signal-Helper (~20 LOC), keine Framework-Dependency.
// API: signal(initial).value (read/write) + .subscribe(cb) → unsubscribe-Fn.

export interface Signal<T> {
  value: T;
  subscribe(cb: (v: T) => void): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let val = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get value() { return val; },
    set value(next: T) {
      val = next;
      for (const cb of subs) cb(val);
    },
    subscribe(cb) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
  };
}
