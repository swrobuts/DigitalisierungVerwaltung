import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import { findNodeByPath, pathFromParagraphRef, type DoctreeRoot } from "../../src/hooks/useAhpTree";

const tree: DoctreeRoot = {
  id: "1", version: "v1", built_at: "2026-01-01", source_file: null,
  tree_jsonb: {
    children: [
      { id: "2", title: "Paragraph 2", children: [
        { id: "3", title: "Absatz 3", content: "Inhalt 2.3", children: [
          { id: "4", title: "Nr. 4", content: "Inhalt 2.3.4" },
        ]},
      ]},
    ],
  },
};

describe("useAhpTree helpers", () => {
  it("findNodeByPath findet 2.3.4", () => {
    const n = findNodeByPath(tree, "2.3.4");
    expect(n?.title).toBe("Nr. 4");
    expect(n?.content).toBe("Inhalt 2.3.4");
  });

  it("findNodeByPath gibt null bei fehlendem Pfad", () => {
    expect(findNodeByPath(tree, "9.9.9")).toBeNull();
  });

  it("pathFromParagraphRef extrahiert Nummern", () => {
    expect(pathFromParagraphRef("AHP § 2.3 Abs. 4")).toBe("2.3");
    expect(pathFromParagraphRef("§ 2")).toBeNull();
    expect(pathFromParagraphRef(undefined)).toBeNull();
  });
});
