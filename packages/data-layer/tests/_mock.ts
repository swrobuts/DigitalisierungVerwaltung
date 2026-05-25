/**
 * Geteilter Supabase-Mock für die Wrapper-Tests.
 *
 * Verwendung:
 *   import { mockState, resetMock } from "./_mock";
 *   vi.mock("../src/supabase-client", () => ({
 *     getSupabase: () => mockClient(),
 *     resetSupabaseClient: vi.fn(),
 *   }));
 *
 * Jeder `.from(table)`-Aufruf hängt einen Call an `mockState.calls` und
 * gibt eine chainable Fluent-API zurück, die awaitable ist und auf
 * `mockState.nextResult` bzw. `mockState.nextSingleResult` resolved.
 *
 * Für Storage gibt es `mockStorageState.uploadResult` als nächste
 * Antwort von `sb.storage.from(...).upload(...)`.
 */

export type Call = { table: string; chain: Array<[string, unknown[]]> };
export type StorageCall = {
  bucket: string;
  op: "upload";
  args: unknown[];
};

interface MockState {
  calls: Call[];
  nextResult: { data: unknown; error: unknown };
  nextSingleResult: { data: unknown; error: unknown } | null;
  storage: {
    calls: StorageCall[];
    nextUploadResult: { data: unknown; error: unknown };
  };
}

export const mockState: MockState = {
  calls: [],
  nextResult: { data: null, error: null },
  nextSingleResult: null,
  storage: {
    calls: [],
    nextUploadResult: { data: { path: "irrelevant" }, error: null },
  },
};

export function resetMock(): void {
  mockState.calls.length = 0;
  mockState.nextResult = { data: null, error: null };
  mockState.nextSingleResult = null;
  mockState.storage.calls.length = 0;
  mockState.storage.nextUploadResult = { data: { path: "irrelevant" }, error: null };
}

function makeChain(table: string) {
  const call: Call = { table, chain: [] };
  mockState.calls.push(call);

  const proxy: Record<string, (...args: unknown[]) => unknown> = {};
  const methods = ["select", "insert", "update", "delete", "eq", "order"];
  for (const m of methods) {
    proxy[m] = (...args: unknown[]) => {
      call.chain.push([m, args]);
      return proxy;
    };
  }
  proxy.single = (...args: unknown[]) => {
    call.chain.push(["single", args]);
    return Promise.resolve(mockState.nextSingleResult ?? mockState.nextResult);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proxy as any).then = (
    onFulfilled?: ((v: unknown) => unknown) | null,
    onRejected?: ((r: unknown) => unknown) | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise.resolve(mockState.nextResult).then(onFulfilled as any, onRejected as any);

  return proxy;
}

export function mockClient() {
  return {
    from: (table: string) => makeChain(table),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => {
          mockState.storage.calls.push({ bucket, op: "upload", args });
          return Promise.resolve(mockState.storage.nextUploadResult);
        },
      }),
    },
  };
}
