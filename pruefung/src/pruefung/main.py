"""FastAPI-Service für UE3 KI-gestützte Prüfung von APL2-Anträgen."""
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pruefung.db import SupabaseClient
from pruefung.doctree_build import (
    build_tree,
    extract_page_texts,
    extract_text_blocks,
    structure_with_claude,
)
from pruefung.knowledge_extract import extract_all_norms
from pruefung.layer_a_strukturell import check_strukturell
from pruefung.layer_b_ontologie import check_ontologie
from pruefung.layer_c_rag import check_rag
from pruefung.models import Befund, PruefungsErgebnis, PruefungsRequest
from pruefung.voyage_embed import build_embeddings_for_doctree


app = FastAPI(title="UE3 APL2-Prüfung", version="0.1.0")

# CORS: amt-ki-Frontend (und UE2-amt für Kompatibilität) dürfen den
# pruefung-service direkt aus dem Browser aufrufen. Anderer Origin = 403
# implicit (kein Header → Browser blockiert).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://amt-ki.butscher.cloud",
        "https://amt.butscher.cloud",
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


async def _fetch_antrag(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    rows = await db.select(
        "antrag_mit_summen",
        (
            f"id=eq.{antrag_id}"
            "&select=id,antragsnummer,haushaltsjahr,antragsdatum,name,traeger,"
            "strasse,hausnummer,plz,ort,"
            "bankverbindung,iban,bic,ansprechpartner,telefon,email,"
            "raeume_vorhanden,raeume_unentgeltlich,geforderte_foerdersumme_euro,"
            "foerderbereich,anzahl_treffen_jahr,anzahl_teilnehmer,"
            "stadtbewohner_anteil,anzahl_ehrenamtliche,geleistete_stunden_jahr,"
            "foerderbereich_seit_jahren,zuwendungszweck,finanzplanung_vorhanden,"
            "projektskizze_eingereicht,logo_verwendet,"
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


class BescheidRequest(BaseModel):
    """Body von POST /api/bescheid."""
    antrag_id: str
    entscheidung: str  # 'bewilligt' | 'abgelehnt' | 'rueckfrage'
    bewilligte_summe_euro: float | None = None
    bearbeiter_kommentar: str | None = None
    ausgestellt_von: str | None = None


def _find_section_by_path(tree: dict, target: str) -> dict | None:
    """Sucht im Doctree den Knoten mit passendem path (z.B. '3.3')."""
    if tree.get("path") == target:
        return tree
    for c in tree.get("children", []) or []:
        r = _find_section_by_path(c, target)
        if r:
            return r
    return None


def _extract_ahp_path(paragraph_ref: str | None) -> str | None:
    """'AHP 3.3 Antragsfristen' → '3.3'."""
    if not paragraph_ref:
        return None
    import re
    m = re.search(r"(\d+(?:\.\d+)*)", paragraph_ref)
    return m.group(1) if m else None


@app.post("/api/bescheid")
async def bescheid(req: BescheidRequest) -> dict[str, Any]:
    """Erstellt einen Verwaltungsbescheid (PDF + apl2.bescheide-Eintrag)
    auf Basis des letzten Prüfprotokolls. Die Befunde werden mit AHP-Wortlaut
    angereichert, damit der Bescheid eine rechtlich belastbare Begründung trägt."""
    if req.entscheidung not in ("bewilligt", "abgelehnt", "rueckfrage"):
        raise HTTPException(400, f"Ungültige Entscheidung: {req.entscheidung}")

    db = SupabaseClient.from_env()

    # 1) Antrag laden (volle Adresse + Bezeichner)
    antrag_rows = await db.select(
        "antraege",
        f"id=eq.{req.antrag_id}&select=*",
    )
    if not antrag_rows:
        raise HTTPException(404, f"Antrag {req.antrag_id} nicht gefunden")
    antrag = antrag_rows[0]

    # 2) Letztes Prüfprotokoll holen (für Begründung)
    protokoll_rows = await db.select(
        "pruefprotokoll",
        f"antrag_id=eq.{req.antrag_id}&select=id,ergebnis_jsonb,doctree_version"
        "&order=geprueft_am.desc&limit=1",
    )
    protokoll = protokoll_rows[0] if protokoll_rows else None
    befunde_raw = (protokoll or {}).get("ergebnis_jsonb", {}).get("befunde", [])

    # 3) AHP-Doctree für Wortlaut-Anreicherung
    tree_rows = await db.select(
        "ahp_doctree",
        "select=version,tree_jsonb&order=built_at.desc&limit=1",
    )
    tree = tree_rows[0]["tree_jsonb"] if tree_rows else {}
    doctree_version = (
        (protokoll or {}).get("doctree_version")
        or (tree_rows[0]["version"] if tree_rows else None)
    )

    # 4) Befunde mit AHP-Wortlaut anreichern (nur Verstöße in den Bescheid,
    #    Hinweise sind interne Sachbearbeiter-Notizen)
    befunde_for_template: list[dict] = []
    for b in befunde_raw:
        if b.get("schwere") != "verstoss":
            continue
        ahp_path = _extract_ahp_path(b.get("paragraph_ref"))
        ahp_node = _find_section_by_path(tree, ahp_path) if ahp_path else None
        befunde_for_template.append({
            "schwere": b.get("schwere"),
            "beschreibung": b.get("beschreibung", ""),
            "paragraph_ref": b.get("paragraph_ref"),
            "ahp_section_title": ahp_node.get("title") if ahp_node else None,
            "ahp_wortlaut": ahp_node.get("content") if ahp_node else None,
        })

    # 5) Bescheid-Datensatz anlegen (vor PDF, damit wir die ID kennen)
    ausgestellt_am = datetime.now(UTC)
    inserted = await db.insert("bescheide", {
        "antrag_id": req.antrag_id,
        "entscheidung": req.entscheidung,
        "bewilligte_summe_euro": req.bewilligte_summe_euro,
        "begruendung_jsonb": {"befunde": befunde_for_template},
        "bearbeiter_kommentar": req.bearbeiter_kommentar,
        "ausgestellt_von": req.ausgestellt_von,
        "ausgestellt_am": ausgestellt_am.isoformat(),
        "pruefprotokoll_id": (protokoll or {}).get("id"),
        "doctree_version": doctree_version,
    })
    bescheid_id = inserted[0]["id"] if inserted else None

    # 6) PDF rendern (lazy-import wie bei /api/pdf wg. native libs)
    from pruefung.pdf_render import render_bescheid_pdf
    pdf_bytes = render_bescheid_pdf(
        bescheid_id=bescheid_id or "",
        antrag=antrag,
        entscheidung=req.entscheidung,
        bewilligte_summe_euro=req.bewilligte_summe_euro,
        befunde=befunde_for_template,
        bearbeiter_kommentar=req.bearbeiter_kommentar,
        ausgestellt_von=req.ausgestellt_von,
        ausgestellt_am=ausgestellt_am,
        doctree_version=doctree_version,
    )

    # 7) PDF in Storage upload + path in bescheide nachtragen
    storage_path = f"{req.antrag_id}/{bescheid_id}.pdf"
    await db.upload_storage("bescheide", storage_path, pdf_bytes, "application/pdf")
    async with httpx.AsyncClient(timeout=30) as c:
        await c.patch(
            f"{db.url}/rest/v1/bescheide?id=eq.{bescheid_id}",
            json={"pdf_storage_path": storage_path},
            headers={**db._headers, "Prefer": "return=minimal"},
        )

    return {
        "bescheid_id": bescheid_id,
        "pdf_storage_path": storage_path,
        "anzahl_verstoesse_in_bescheid": len(befunde_for_template),
        "doctree_version": doctree_version,
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


@app.post("/api/build-embeddings")
async def build_embeddings() -> dict[str, Any]:
    """L4 — Voyage-Embeddings für alle Sections des aktuellen Doctrees bauen.

    Endpoint ist idempotent: bei Re-Run werden die Embeddings derselben
    Doctree-Version gelöscht und neu eingesetzt. Sinnvoll nach jedem
    /api/rebuild-doctree oder bei Voyage-Modellwechsel."""
    db = SupabaseClient.from_env()
    return await build_embeddings_for_doctree(db)


@app.post("/api/extract-norms")
async def extract_norms() -> dict[str, Any]:
    """Layer L2 — Knowledge-Layer-Befüllung.

    Iteriert über alle Sections des aktuellen Doctrees und ruft Claude
    pro Section auf, um normative Aussagen zu extrahieren. Statements
    landen als status='pending' in apl2.ahp_norm_statements zur manuellen
    Kuratierung.

    Idempotent: das unique-Constraint auf (doctree_version, section_path,
    statement) verhindert Duplikate.
    """
    db = SupabaseClient.from_env()
    return await extract_all_norms(db)


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
