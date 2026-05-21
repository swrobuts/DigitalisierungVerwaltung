import { describe, it, expect, vi } from "vitest";
import { signal } from "../src/signals";

describe("signal", () => {
  it("hat get/set", () => {
    const s = signal({ a: 1 });
    expect(s.value.a).toBe(1);
    s.value = { a: 2 };
    expect(s.value.a).toBe(2);
  });

  it("notifiziert Subscriber bei value-Reassignment", () => {
    const s = signal({ count: 0 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.value = { count: 1 };
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ count: 1 });
  });

  it("unsubscribe stoppt Notifikationen", () => {
    const s = signal({ x: 0 });
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    unsub();
    s.value = { x: 5 };
    expect(cb).not.toHaveBeenCalled();
  });
});
