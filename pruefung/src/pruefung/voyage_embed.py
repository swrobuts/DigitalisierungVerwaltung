"""Voyage AI Embedding-Client + AHP-Section-Indexierung.

Voyage 'voyage-3' liefert 1024-dim Embeddings, optimiert für mehrsprachigen
Verwaltungstext. Endpoint: https://api.voyageai.com/v1/embeddings.

API-Doc: https://docs.voyageai.com/reference/embeddings-api
"""
import os
from typing import Any
import httpx
from pruefung.db import SupabaseClient


VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
EMBEDDING_MODEL = "voyage-3"
EMBEDDING_DIM = 1024


class VoyageClient:
    """Schlanker httpx-Wrapper um die Voyage-Embeddings-API."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ["VOYAGE_API_KEY"]
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def embed(
        self,
        texts: list[str],
        *,
        input_type: str = "document",
        model: str = EMBEDDING_MODEL,
    ) -> list[list[float]]:
        """Bettet eine Liste von Texten ein.

        Args:
            texts: max 128 Texte pro Call, je max 16k Tokens.
            input_type: 'document' für gespeicherte Texte, 'query' für Suchanfragen.
                Voyage trainiert beide Modi unterschiedlich — query bekommt
                bessere Query-Embeddings.
            model: 'voyage-3' (1024d) oder 'voyage-3-lite' (512d).

        Returns:
            Liste von Embeddings (parallel zur Input-Reihenfolge).
        """
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                VOYAGE_API_URL,
                json={"input": texts, "model": model, "input_type": input_type},
                headers=self.headers,
            )
            r.raise_for_status()
            data = r.json()
        # data["data"] ist eine Liste von {object, embedding, index}
        # — bereits in Input-Reihenfolge sortiert
        return [item["embedding"] for item in data["data"]]


def _iter_sections(node: dict[str, Any]) -> list[dict[str, Any]]:
    """Flach-iteriert alle Sections (DFS) — auch geschachtelte Kinder."""
    out: list[dict[str, Any]] = []
    out.append(node)
    for c in node.get("children", []) or []:
        out.extend(_iter_sections(c))
    return out


async def build_embeddings_for_doctree(
    db: SupabaseClient,
    *,
    api_key: str | None = None,
) -> dict[str, int]:
    """Generiert Embeddings für jede Section des aktuellen Doctrees.

    Pipeline:
      1. Lade letzte Doctree-Version aus apl2.ahp_doctree
      2. Sammle alle Sections (DFS) mit nicht-leerem content
      3. Bilde Embedding-Text: "<title>\n\n<content>" (Titel als Boost-Signal)
      4. Voyage-Batch-Call (alle auf einmal — 19 Sections × ~3k Tokens passt locker)
      5. Schreibe in apl2.ahp_section_embeddings (upsert pro section_path)

    Idempotent: bei Re-Run werden Embeddings derselben (version, path, title)
    überschrieben.
    """
    # 1) Doctree laden
    rows = await db.select(
        "ahp_doctree",
        "select=version,tree_jsonb&order=built_at.desc&limit=1",
    )
    if not rows:
        return {"error": 1, "sections_embedded": 0}
    version = rows[0]["version"]
    tree = rows[0]["tree_jsonb"]

    # 2) Sections sammeln
    sections = _iter_sections(tree)
    payload: list[dict[str, Any]] = []
    for s in sections:
        title = s.get("title", "")
        content = (s.get("content") or "").strip()
        if not content or len(content) < 80:
            continue
        payload.append({
            "doctree_version": version,
            "section_path": s.get("path", "") or "",
            "section_title": title,
            "section_content": content,
            # Embedding-Input: Title + Content für besseres Matching
            "_embed_text": f"{title}\n\n{content}",
        })

    if not payload:
        return {"sections_embedded": 0, "version": version}

    # 3) Embedding-Batch
    voyage = VoyageClient(api_key=api_key)
    embeddings = await voyage.embed(
        [p["_embed_text"] for p in payload],
        input_type="document",
    )
    assert len(embeddings) == len(payload)

    # 4) Existierende Embeddings für diese Version löschen (clean rebuild)
    async with httpx.AsyncClient(timeout=30) as c:
        await c.delete(
            f"{db.url}/rest/v1/ahp_section_embeddings?doctree_version=eq.{version}",
            headers=db._headers,
        )

    # 5) Neue Embeddings einsetzen — pgvector akzeptiert Listen via REST
    # wenn wir sie als String "[0.1,0.2,...]" senden (PostgreSQL-Vektor-Literal).
    rows_to_insert = [{
        "doctree_version": p["doctree_version"],
        "section_path": p["section_path"],
        "section_title": p["section_title"],
        "section_content": p["section_content"],
        "embedding": _format_vector(emb),
        "embedding_model": EMBEDDING_MODEL,
    } for p, emb in zip(payload, embeddings)]

    await db.insert("ahp_section_embeddings", rows_to_insert)
    return {
        "sections_embedded": len(rows_to_insert),
        "version": version,
        "model": EMBEDDING_MODEL,
        "dim": EMBEDDING_DIM,
    }


def _format_vector(values: list[float]) -> str:
    """pgvector-Literal: [0.1,0.2,0.3]"""
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"


async def semantic_search(
    db: SupabaseClient,
    query: str,
    *,
    top_k: int = 5,
    api_key: str | None = None,
) -> list[dict[str, Any]]:
    """Findet die Top-K semantisch ähnlichsten Sections zur Suchanfrage.

    Nutzt cosine-Similarity (1 - cosine_distance) gegen die in
    apl2.ahp_section_embeddings gespeicherten Vektoren.
    """
    voyage = VoyageClient(api_key=api_key)
    q_emb = (await voyage.embed([query], input_type="query"))[0]
    q_vec = _format_vector(q_emb)

    # pgvector cosine_distance: embedding <=> query → 0 (identisch) .. 2 (gegensätzlich)
    # Similarity = 1 - cosine_distance.
    # Wir nutzen REST mit Order-By auf Berechneter Spalte ... aber das geht über
    # PostgREST RPC einfacher als raw distance. Pragmatisch: wir definieren
    # eine SQL-Funktion + RPC-Call.
    # Für jetzt: direkter SQL-Call via pg_net wäre Overkill, machen wir RPC.
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{db.url}/rest/v1/rpc/ahp_semantic_search",
            json={
                "query_embedding": q_vec,
                "top_k": top_k,
            },
            headers=db._headers,
        )
        r.raise_for_status()
        return r.json()
