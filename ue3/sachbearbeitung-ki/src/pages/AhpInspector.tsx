import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useAhpTree, findNodeByPath, type AhpNode } from "../hooks/useAhpTree";

/**
 * Inspector-Seite /ahp — Browser für den extrahierten Doctree.
 *
 * Zweck: Transparenz über das Material, das Layer C (RAG/Claude) zur
 * Verfügung steht. Jede paragraph_ref der Ontologie kann hier wörtlich
 * nachgeschlagen werden. URL-Parameter ?section=3.3 springt direkt an.
 */
export function AhpInspector() {
  const { tree, meta, loading, error } = useAhpTree();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPath = searchParams.get("section") ?? "";
  const [selectedPath, setSelectedPath] = useState<string>(initialPath);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root"]));

  // Beim ersten Laden: wenn ?section=X im URL, Knoten + Vorfahren aufklappen
  useEffect(() => {
    if (!tree || !initialPath) return;
    const ancestors = collectAncestorIds(tree, initialPath);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestors) next.add(id);
      return next;
    });
    setSelectedPath(initialPath);
  }, [tree, initialPath]);

  const selectedNode = useMemo(
    () => (selectedPath ? findNodeByPath(tree, selectedPath) : null),
    [tree, selectedPath],
  );

  const filteredHits = useMemo(() => {
    if (!tree || !query.trim()) return null;
    const q = query.toLowerCase();
    const hits: AhpNode[] = [];
    const walk = (n: AhpNode) => {
      if (
        n.title.toLowerCase().includes(q) ||
        (n.content ?? "").toLowerCase().includes(q)
      ) {
        hits.push(n);
      }
      for (const c of n.children ?? []) walk(c);
    };
    walk(tree);
    return hits.slice(0, 50);
  }, [tree, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectByPath(path: string) {
    setSelectedPath(path);
    setSearchParams(path ? { section: path } : {});
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 relative sticky top-0 z-30">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 lg:px-8 py-4 flex items-center gap-3">
          <Link
            to="/inbox"
            className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot"
          >
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-wue-rot" />
            AHP-Förderrichtlinie · Doctree-Browser
          </h1>
          {meta && (
            <span className="ml-auto text-xs text-slate-500">
              Version <span className="font-mono">{meta.version}</span> · Quelle{" "}
              <span className="font-mono">{meta.source_file}</span>
            </span>
          )}
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start max-w-[1600px] mx-auto">
        {/* TREE-BROWSER LINKS */}
        <aside className="bg-white border border-slate-200 rounded-sm shadow-sm lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className="border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Volltext-Suche …"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-wue-rot"
              />
            </div>
          </div>
          {loading && <div className="p-4 text-sm text-slate-500">Lade Doctree …</div>}
          {error && <div className="p-4 text-sm text-rose-700">Fehler: {error}</div>}
          {!loading && !error && tree && (
            <div className="py-2">
              {filteredHits ? (
                <div>
                  <div className="px-3 py-1 text-xs uppercase tracking-wider text-slate-500">
                    {filteredHits.length} Treffer
                  </div>
                  {filteredHits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => selectByPath(h.path || h.id)}
                      className={
                        (h.path && selectedPath === h.path
                          ? "bg-wue-rot-soft text-wue-rot-dark "
                          : "hover:bg-slate-50 ") +
                        "w-full text-left px-3 py-1.5 text-sm flex items-baseline gap-2"
                      }
                    >
                      {h.path && (
                        <span className="text-xs text-slate-400 tabular-nums shrink-0">
                          {h.path}
                        </span>
                      )}
                      <span className="truncate">{h.title.replace(/^\d[\d.]*\s+/, "")}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <TreeBrowser
                  node={tree}
                  selectedPath={selectedPath}
                  expanded={expanded}
                  toggle={toggle}
                  onSelect={selectByPath}
                  depth={0}
                />
              )}
            </div>
          )}
        </aside>

        {/* DETAIL-PANE RECHTS */}
        <article className="bg-white border border-slate-200 rounded-sm shadow-sm min-h-[400px]">
          {!selectedNode && (
            <div className="p-10 text-slate-500 text-sm">
              Wähle links eine Section, um den Volltext zu sehen.
            </div>
          )}
          {selectedNode && (
            <div className="p-8 lg:p-10">
              <div className="text-[11px] uppercase tracking-[0.18em] text-wue-rot font-semibold">
                AHP-Förderrichtlinie · Kapitel {selectedNode.path || "Root"}
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mt-1 leading-tight">
                {selectedNode.title}
              </h2>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                <span>Level {selectedNode.level}</span>
                <span>·</span>
                <span>{(selectedNode.content ?? "").length} Zeichen</span>
                <span>·</span>
                <span>{(selectedNode.children ?? []).length} Unter-Sections</span>
              </div>

              <div className="mt-6 prose prose-sm prose-slate max-w-none">
                {selectedNode.content ? (
                  <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
                    {selectedNode.content}
                  </p>
                ) : (
                  <p className="text-slate-400 italic">
                    Diese Section hat keinen direkten Fließtext — Inhalt steht in Unter-Sections.
                  </p>
                )}
              </div>

              {(selectedNode.children ?? []).length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-medium mb-3">
                    Unter-Sections
                  </div>
                  <ul className="space-y-1">
                    {selectedNode.children.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => selectByPath(c.path || c.id)}
                          className="text-sm text-wue-rot hover:underline text-left"
                        >
                          {c.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      </main>
    </div>
  );
}

function TreeBrowser({
  node, selectedPath, expanded, toggle, onSelect, depth,
}: {
  node: AhpNode;
  selectedPath: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const hasChildren = (node.children ?? []).length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.path !== "" && selectedPath === node.path;
  return (
    <div>
      <div
        className={
          (isSelected ? "bg-wue-rot-soft " : "hover:bg-slate-50 ") +
          "flex items-center gap-1 cursor-pointer pr-2"
        }
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            className="p-1 hover:bg-slate-200 rounded"
            aria-label={isOpen ? "Zuklappen" : "Aufklappen"}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button
          onClick={() => onSelect(node.path || node.id)}
          className={
            (isSelected ? "text-wue-rot-dark font-medium " : "text-slate-800 ") +
            "flex-1 py-1 text-sm text-left flex items-baseline gap-1.5 min-w-0"
          }
        >
          {node.path && (
            <span className="text-xs text-slate-400 tabular-nums shrink-0">
              {node.path}
            </span>
          )}
          <span className="truncate">{node.title.replace(/^\d[\d.]*\s+/, "")}</span>
        </button>
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children.map((c) => (
            <TreeBrowser
              key={c.id}
              node={c}
              selectedPath={selectedPath}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function collectAncestorIds(root: AhpNode, targetPath: string): string[] {
  const stack: AhpNode[] = [];
  const dfs = (n: AhpNode): boolean => {
    stack.push(n);
    if (n.path === targetPath) return true;
    for (const c of n.children ?? []) {
      if (dfs(c)) return true;
    }
    stack.pop();
    return false;
  };
  dfs(root);
  return stack.map((n) => n.id);
}
