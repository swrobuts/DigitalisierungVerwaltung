import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/** Knoten im AHP-Doctree. Selbst-rekursiv über `children`. */
export interface AhpNode {
  id: string;
  title: string;
  path: string;
  level: number;
  content: string;
  children: AhpNode[];
}

export interface AhpTreeMeta {
  version: string;
  source_file: string;
  built_at: string;
}

export function useAhpTree(): {
  tree: AhpNode | null;
  meta: AhpTreeMeta | null;
  loading: boolean;
  error: string | null;
} {
  const [tree, setTree] = useState<AhpNode | null>(null);
  const [meta, setMeta] = useState<AhpTreeMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("ahp_doctree")
      .select("version,source_file,built_at,tree_jsonb")
      .order("built_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setTree(null);
          setMeta(null);
        } else if (data) {
          setTree((data.tree_jsonb ?? null) as AhpNode | null);
          setMeta({
            version: data.version,
            source_file: data.source_file,
            built_at: data.built_at,
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tree, meta, loading, error };
}

/** Findet einen Knoten per Path-Breadcrumb (z.B. "3.3", "2.3.2"). */
export function findNodeByPath(root: AhpNode | null, path: string): AhpNode | null {
  if (!root) return null;
  if (root.path === path) return root;
  for (const child of root.children ?? []) {
    const r = findNodeByPath(child, path);
    if (r) return r;
  }
  return null;
}

/** Extrahiert den Pfad-Anteil aus einem paragraph_ref-String.
 * z.B. "AHP 3.3 Antragsfristen" → "3.3"
 *      "AHP 2.3.2 Begegnungszentren" → "2.3.2"
 *      "AHP 2.4 Förderbereich IV / 3.2 b)" → "2.4" (erstes Match) */
export function pathFromParagraphRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/(\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}
