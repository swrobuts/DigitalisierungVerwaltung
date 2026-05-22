"""FastAPI-Service für UE3 KI-gestützte Prüfung von APL2-Anträgen."""
import os
import time
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException
from pruefung.db import SupabaseClient
from pruefung.doctree_build import (
    build_tree,
    extract_page_texts,
    extract_text_blocks,
    structure_with_claude,
)
from pruefung.layer_a_strukturell import check_strukturell
from pruefung.layer_b_ontologie import check_ontologie
from pruefung.layer_c_rag import check_rag
from pruefung.models import Befund, PruefungsErgebnis, PruefungsRequest


app = FastAPI(title="UE3 APL2-Prüfung", version="0.1.0")


async def _fetch_antrag(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    rows = await db.select(
        "antrag_mit_summen",
        (
            f"id=eq.{antrag_id}"
            "&select=id,antragsnummer,haushaltsjahr,antragsdatum,name,traeger,"
            "strasse,hausnummer,plz,ort,"
            "bankverbindung,iban,bic,ansprechpartner,telefon,email,"
            "raeume_vorhanden,raeume_unentgeltlich,geforderte_foerdersumme_euro,"
            "betriebskosten_vorjahr_euro,personalkosten_vorjahr_euro,miete_jahr_euro"
        ),
    )
    if not rows:
        raise HTTPException(404, f"Antrag {antrag_id} nicht gefunden")
    antrag = rows[0]
    oz = await db.select(
        "oeffnungszeit",
        f"antrag_id=eq.{antrag_id}&select=wochentag,oeffnungszeit,angebot",
    )
    antrag["oeffnungszeiten"] = oz
    return antrag


async def _fetch_doctree(db: SupabaseClient) -> tuple[dict, str | None]:
    rows = await db.select(
        "ahp_doctree",
        "select=version,tree_jsonb&order=built_at.desc&limit=1",
    )
    if not rows:
        return {
            "id": "root", "title": "AHP (leer)", "path": "",
            "level": 0, "content": "", "children": [],
        }, None
    return rows[0]["tree_jsonb"], rows[0]["version"]


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/pruefen")
async def pruefen(req: PruefungsRequest) -> dict[str, Any]:
    """Orchestriert die 3 Layer und schreibt apl2.pruefprotokoll."""
    start = time.monotonic()
    db = SupabaseClient.from_env()
    antrag = await _fetch_antrag(req.antrag_id, db)

    befunde: list[Befund] = []
    befunde.extend(check_strukturell(antrag))
    befunde.extend(await check_ontologie(antrag, plan_id="APL2", db=db))

    tree, version = await _fetch_doctree(db)
    if tree.get("children"):
        befunde.extend(await check_rag(tree, antrag))

    duration_ms = int((time.monotonic() - start) * 1000)
    ergebnis = PruefungsErgebnis(
        befunde=befunde, doctree_version=version, duration_ms=duration_ms,
    )

    protokoll = await db.insert("pruefprotokoll", {
        "antrag_id": req.antrag_id,
        "geprueft_von": req.geprueft_von,
        "doctree_version": version,
        "ergebnis_jsonb": ergebnis.model_dump(),
        "duration_ms": duration_ms,
    })
    protokoll_id = protokoll[0]["id"] if protokoll else None

    return {
        "protokoll_id": protokoll_id,
        "anzahl_verstoesse": ergebnis.anzahl_verstoesse(),
        "anzahl_hinweise": ergebnis.anzahl_hinweise(),
        "pruefungsstatus": ergebnis.pruefungsstatus(),
        "doctree_version": version,
        "duration_ms": duration_ms,
        "befunde": [b.model_dump() for b in befunde],
    }


@app.post("/api/pdf")
async def pdf(protokoll_id: str) -> dict[str, str]:
    """Rendert PDF aus existierendem Protokoll + Upload in Storage."""
    db = SupabaseClient.from_env()
    pr = await db.select(
        "pruefprotokoll",
        f"id=eq.{protokoll_id}&select=antrag_id,ergebnis_jsonb",
    )
    if not pr:
        raise HTTPException(404, "Protokoll nicht gefunden")
    antrag_id = pr[0]["antrag_id"]
    ergebnis = PruefungsErgebnis(**pr[0]["ergebnis_jsonb"])
    antrag_rows = await db.select(
        "antraege",
        f"id=eq.{antrag_id}&select=antragsnummer,name,traeger",
    )
    antrag = antrag_rows[0] if antrag_rows else {}
    # Lazy import: weasyprint braucht native libs (pango/cairo), die im Test-Env
    # nicht immer ohne DYLD_LIBRARY_PATH verfügbar sind.
    from pruefung.pdf_render import render_protokoll_pdf
    pdf_bytes = render_protokoll_pdf(antrag, ergebnis)
    path = f"{antrag_id}/{protokoll_id}.pdf"
    await db.upload_storage("pruefprotokolle", path, pdf_bytes, "application/pdf")
    async with httpx.AsyncClient(timeout=30) as c:
        await c.patch(
            f"{db.url}/rest/v1/pruefprotokoll?id=eq.{protokoll_id}",
            json={"pdf_storage_path": path},
            headers={**db._headers, "Prefer": "return=minimal"},
        )
    return {"pdf_storage_path": path}


# Container-Default: /app/materialien (siehe Dockerfile). Lokal/Dev:
# AHP_PDF_PATH überschreiben oder Symlink legen. So bleibt der Endpoint
# auch außerhalb des Containers nutzbar (z.B. CI / Reviewer-Workstation).
AHP_PDF_PATH_DEFAULT = "/app/materialien/foerderrichtlinie-ahp-2025-03-27.pdf"


@app.post("/api/rebuild-doctree")
async def rebuild_doctree(
    version: str | None = None,
    engine: str = "claude",
) -> dict[str, str]:
    """Liest AHP-PDF, baut Doctree, schreibt in apl2.ahp_doctree.

    engine='claude' (default): OCR-Volltext → Claude strukturiert
        semantisch (korrigiert OCR-Fehler, baut Hierarchie, ignoriert
        TOC/Bibliografie). Empfohlen.

    engine='regex': Legacy-Pfad mit `extract_text_blocks` → `build_tree`
        per Section-Heading-Heuristik. Fallback wenn Claude nicht
        verfügbar ist.

    Vorherige Zeile mit gleicher Version wird gelöscht — Versionierung
    pro Document-Snapshot."""
    pdf_path = Path(os.environ.get("AHP_PDF_PATH", AHP_PDF_PATH_DEFAULT))
    if not pdf_path.exists():
        raise HTTPException(500, f"PDF nicht gefunden unter {pdf_path}")

    if engine == "claude":
        pages = extract_page_texts(pdf_path)
        tree = await structure_with_claude(pages)
    elif engine == "regex":
        blocks = extract_text_blocks(pdf_path)
        tree = build_tree(blocks)
    else:
        raise HTTPException(400, f"Unbekannte engine: {engine!r}. Erlaubt: 'claude', 'regex'.")

    db = SupabaseClient.from_env()
    v = version or pdf_path.stem.replace("foerderrichtlinie-ahp-", "")
    async with httpx.AsyncClient(timeout=30) as c:
        await c.delete(
            f"{db.url}/rest/v1/ahp_doctree?version=eq.{v}",
            headers={**db._headers},
        )
    await db.insert("ahp_doctree", {
        "version": v,
        "tree_jsonb": tree,
        "source_file": pdf_path.name,
    })
    return {
        "status": "ok",
        "version": v,
        "engine": engine,
        "sections": str(len(tree.get("children", []))),
    }
