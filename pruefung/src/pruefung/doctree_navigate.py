"""Tree-Navigation für Claude-Tool-Use (list/get/search)."""
from typing import Any, Callable


def _walk(tree: dict, fn: Callable[[dict], None]) -> None:
    """DFS-Walk durch den Tree, ruft fn auf jeden Knoten."""
    fn(tree)
    for child in tree.get("children", []):
        _walk(child, fn)


def _find_node(tree: dict, node_id: str) -> dict | None:
    if tree.get("id") == node_id:
        return tree
    for child in tree.get("children", []):
        hit = _find_node(child, node_id)
        if hit is not None:
            return hit
    return None


def list_sections(tree: dict, parent_id: str) -> list[dict[str, Any]]:
    """Direkte Kinder eines Knotens, kompakte Ausgabe (id/title/path/level).
    Kein content — für Claude reicht der Überblick."""
    parent = _find_node(tree, parent_id)
    if parent is None:
        return []
    return [
        {"id": c["id"], "title": c["title"], "path": c["path"], "level": c["level"]}
        for c in parent.get("children", [])
    ]


def get_section(tree: dict, section_id: str) -> dict | None:
    """Volle Section inkl. content + children. None wenn nicht gefunden."""
    return _find_node(tree, section_id)


def search_tree(tree: dict, query: str, max_results: int = 5) -> list[dict]:
    """Volltext-Search (case-insensitive substring) in title + content.
    Scoring: title-Treffer wertvoller als content-Treffer.
    Liefert max_results Knoten mit content-Preview (200 Zeichen)."""
    q = (query or "").lower()
    if not q:
        return []
    hits: list[tuple[int, dict]] = []

    def visit(node: dict) -> None:
        title_hit = q in node.get("title", "").lower()
        content_hit = q in node.get("content", "").lower()
        if title_hit or content_hit:
            score = (10 if title_hit else 0) + (1 if content_hit else 0)
            hits.append((score, node))

    _walk(tree, visit)
    hits.sort(key=lambda x: -x[0])
    return [
        {
            "id": n["id"],
            "title": n["title"],
            "path": n["path"],
            "content": (n.get("content") or "")[:200],
        }
        for _, n in hits[:max_results]
    ]
