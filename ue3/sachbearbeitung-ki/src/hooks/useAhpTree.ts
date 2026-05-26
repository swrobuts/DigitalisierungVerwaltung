/**
 * Lädt den aktuellen apl.ahp_doctree (höchste Version) + bietet
 * findNodeByPath und pathFromParagraphRef.
 *
 * Wird vom PruefungsCard zum Einblenden des AHP-Wortlauts unter
 * jedem Befund genutzt.
 */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface DoctreeNode {
  id: string;
  title: string;
  content?: string;
  children?: DoctreeNode[];
  paragraph_ref?: string;
}

export interface DoctreeRoot {
  id: string;
  version: string;
  built_at: string;
  tree_jsonb: { children: DoctreeNode[] };
  source_file: string | null;
}

let _cache: DoctreeRoot | null = null;
let _cachePromise: Promise<DoctreeRoot | null> | null = null;

async function loadTree(): Promise<DoctreeRoot | null> {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    const { data } = await supabase
      .from("ahp_doctree")
      .select("*")
      .order("built_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    _cache = data as DoctreeRoot | null;
    return _cache;
  })();
  return _cachePromise;
}

export function useAhpTree() {
  const [tree, setTree] = useState<DoctreeRoot | null>(_cache);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;
    setLoading(true);
    loadTree().then((t) => {
      setTree(t);
      setLoading(false);
    });
  }, []);

  return { tree, loading };
}

/** "2.3.4" → ["2","3","4"] und sucht im Baum */
export function findNodeByPath(
  root: DoctreeRoot | null,
  path: string,
): DoctreeNode | null {
  if (!root) return null;
  const segs = path.split(".");
  let cur: DoctreeNode[] = root.tree_jsonb.children ?? [];
  let node: DoctreeNode | null = null;
  for (const s of segs) {
    node = cur.find((n) => n.id === s || n.id.endsWith(`.${s}`)) ?? null;
    if (!node) return null;
    cur = node.children ?? [];
  }
  return node;
}

/** "AHP § 2.3 Abs. 4" → "2.3.4" (vereinfacht) */
export function pathFromParagraphRef(ref?: string): string | null {
  if (!ref) return null;
  const m = ref.match(/(\d+(?:\.\d+)+)/);
  return m ? m[1] : null;
}
