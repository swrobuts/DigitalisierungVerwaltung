"""FastAPI-Service für KI-gestützte Prüfung von APL-Anträgen.

TODO Phase 4A.2: Viele Endpoints in dieser Datei sprechen noch mit
nicht-mehr-existenten Tabellen (apl.pruefprotokoll, apl.pruefungen,
apl.ahp_doctree, apl.ahp_section_embeddings, apl.ontologie_rules,
apl.oeffnungszeit, apl.antrag_mit_summen). Diese Endpoints werden im
Live-Service mit 4xx/5xx fehlschlagen. Phase 4B baut die FB-Plugin-
Dispatcher-Architektur auf, danach werden die alten Endpoints entweder
auf die neuen Persistenz-Tabellen umgestellt oder durch Plugin-Endpoints
ersetzt.

Schema-Profile (db.SupabaseClient): apl2 → apl (Phase 4A.1 erfolgt).
"""
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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

# CORS: alle 5 UE-Frontends dürfen den pruefung-service direkt aus dem
# Browser aufrufen. Anderer Origin = 403 implicit (kein Header → Browser
# blockiert).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Alte Subdomains (Backward-Compat)
        "https://amt-ki.butscher.cloud",
        "https://amt.butscher.cloud",
        # Neue Multi-FB-Subdomains
        "https://upload.butscher.cloud",       # UE0
        "https://antrag.butscher.cloud",       # UE1
        "https://sachbearbeiter.butscher.cloud",  # UE2
        "https://ki.butscher.cloud",           # UE3
        "https://agent.butscher.cloud",        # UE4
        # GH Pages (UE0/UE1/UE4 statisch)
        "https://swrobuts.github.io",
        # Lokale Dev-Server
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
    ],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


_FB_DETAIL_TABLE: dict[str, tuple[str, str]] = {
    "I": (
        "fb_i_projekt",
        "projekt_titel,laufzeit,stadtteil,personalkosten_euro,sachkosten_euro,"
        "drittmittel_jsonb,andere_mittel_jsonb",
    ),
    "II": (
        "fb_ii_ehrenamt",
        "ehrenamt_titel,anzahl_helfer_vorjahr,gesamt_helferstunden_vorjahr,"
        "direkter_kontakt_senioren",
    ),
    "III": (
        "fb_iii_variante",
        "variante,a_anmerkung,b_anzahl_veranstaltungen,b_teilnehmer_senioren,"
        "b_teilnehmer_generationen,b_stadtbewohner_anteil,"
        "b_quartierstreffen_teilnahme,b_quartiere,b_quartier_person_name,"
        "c_treffen_schwelle,c_teilnehmer_durchschnitt,c_quartierstreffen_anzahl,"
        "c_quartier_kooperation,c_quartier_person_name,d_hauptamt_name,"
        "d_hauptamt_stunden_woche,d_hauptamt_stunden_monat,"
        "d_ehrenamt_personen_jsonb",
    ),
    "IV": (
        "fb_iv_freitext",
        "vorhaben_titel,kurzbeschreibung,dokument_path",
    ),
}

_ANTRAG_COLS = (
    "id,antragsnummer,haushaltsjahr,foerderbereich,status,submitted_at,"
    "submitted_language,dachverband,einrichtung,ansprechpartner,"
    "strasse,hausnummer,plz,ort,telefon,email,homepage,"
    "bankname,iban,bic"
)


async def _fetch_antrag(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    """Lädt apl.antraege + passende FB-Detail-Tabelle (Multi-FB-Schema).

    Liefert ein vereinheitlichtes Dict mit den gemeinsamen Antragsteller-
    Feldern aus apl.antraege plus `fb_details: {...}` für FB-spezifische
    Felder (FB I: apl.fb_i_projekt, FB II: apl.fb_ii_ehrenamt + helfer-
    Liste, FB III: apl.fb_iii_variante, FB IV: apl.fb_iv_freitext).
    """
    rows = await db.select(
        "antraege",
        f"id=eq.{antrag_id}&select={_ANTRAG_COLS}",
    )
    if not rows:
        raise HTTPException(404, f"Antrag {antrag_id} nicht gefunden")
    antrag = rows[0]
    fb = antrag.get("foerderbereich")
    table_cols = _FB_DETAIL_TABLE.get(fb) if fb else None
    fb_details: dict[str, Any] = {}
    if table_cols is not None:
        table, cols = table_cols
        d_rows = await db.select(
            table, f"antrag_id=eq.{antrag_id}&select={cols}",
        )
        fb_details = d_rows[0] if d_rows else {}
    # FB II: Helferliste 1:n nachladen
    if fb == "II":
        helfer = await db.select(
            "fb_ii_helfer",
            f"antrag_id=eq.{antrag_id}"
            "&select=position,name,vorname,einsatzbereich,"
            "eintritt,austritt,stunden_monat,stunden_jahr"
            "&order=position.asc",
        )
        fb_details["helfer"] = helfer
    antrag["fb_details"] = fb_details
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
    """Orchestriert die 3 Layer und schreibt apl.pruefprotokoll."""
    start = time.monotonic()
    db = SupabaseClient.from_env()
    antrag = await _fetch_antrag(req.antrag_id, db)

    # UsageTracker sammelt Token-/Kosten-Daten aller LLM-Calls dieses
    # Prüfungs-Laufs — wird ins pruefprotokoll mit persistiert.
    from pruefung.llm_client import UsageTracker
    usage = UsageTracker()

    befunde: list[Befund] = []
    befunde.extend(check_strukturell(antrag))
    befunde.extend(await check_ontologie(antrag, plan_id="APL2", db=db))

    tree, version = await _fetch_doctree(db)
    if tree.get("children"):
        befunde.extend(await check_rag(tree, antrag, usage=usage))

    duration_ms = int((time.monotonic() - start) * 1000)
    ergebnis = PruefungsErgebnis(
        befunde=befunde, doctree_version=version, duration_ms=duration_ms,
    )

    # Empfehlung wird mit ins ergebnis_jsonb gepackt, damit sie bei späterem
    # Reload des Protokolls verfügbar bleibt (UI + Bescheid-Generator)
    ergebnis_dict = ergebnis.model_dump()
    ergebnis_dict["empfehlung"] = ergebnis.empfehlung().model_dump()
    # LLM-Cost-Aggregat in ergebnis_jsonb, sichtbar in der UI (z.B. KPI-Bar)
    ergebnis_dict["llm_usage"] = usage.to_dict()
    protokoll = await db.insert("pruefprotokoll", {
        "antrag_id": req.antrag_id,
        "geprueft_von": req.geprueft_von,
        "doctree_version": version,
        "ergebnis_jsonb": ergebnis_dict,
        "duration_ms": duration_ms,
    })
    protokoll_id = protokoll[0]["id"] if protokoll else None

    return {
        "protokoll_id": protokoll_id,
        "anzahl_verstoesse": ergebnis.anzahl_verstoesse(),
        "anzahl_hinweise": ergebnis.anzahl_hinweise(),
        "pruefungsstatus": ergebnis.pruefungsstatus(),
        "empfehlung": ergebnis.empfehlung().model_dump(),
        "doctree_version": version,
        "duration_ms": duration_ms,
        "befunde": [b.model_dump() for b in befunde],
    }


class PruefungRequest(BaseModel):
    """Body von POST /api/pruefung — legt eine Prüfung an oder schließt sie ab.

    Wenn `id` gesetzt ist: Update der bestehenden Prüfung (abhakungen,
    Kommentar, Vorschlag, ggf. abschließen). Sonst: neue Prüfung anlegen
    (typischerweise Erstprüfung beim Klick 'Manuelle Prüfung starten').

    `abschliessen=True` schaltet das Antrag-Status-Modell weiter:
      - Erstprüfung abgeschlossen + Zweitprüfung erforderlich  → 'zweitpruefung_offen'
      - Sonst                                                    → bleibt 'in_pruefung'
    """
    id: str | None = None
    antrag_id: str
    rolle: str  # 'erstpruefung' | 'zweitpruefung'
    pruefer_typ: str  # 'mensch' | 'ki'
    pruefer_id: str
    pruefer_modus: str | None = None  # 'standard' | 'adversariell' (nur bei KI)
    pruefprotokoll_id: str | None = None
    abhakungen_jsonb: dict[str, Any] | None = None
    gesamt_kommentar: str | None = None
    entscheidungs_vorschlag: str | None = None  # 'bewilligen' | 'ablehnen' | 'rueckfragen'
    abschliessen: bool = False
    bewilligte_summe_euro: float | None = None  # nur für Trigger-Logik benötigt


def _zweitpruefung_erforderlich(
    entscheidungs_vorschlag: str | None,
    bewilligte_summe: float | None,
) -> bool:
    """Trigger-Logik: Vier-Augen-Prinzip ist Pflicht
      - bei Ablehnung (rechtssicherheit)
      - bei Bewilligungen über 5.000 € (Schwellwert per Konvention)."""
    if entscheidungs_vorschlag == "ablehnen":
        return True
    if entscheidungs_vorschlag == "bewilligen" and (bewilligte_summe or 0) > 5000:
        return True
    return False


@app.post("/api/pruefung")
async def upsert_pruefung(req: PruefungRequest) -> dict[str, Any]:
    """Erstellt oder aktualisiert eine Prüfungs-Bewertung. Wenn
    `abschliessen=True`, wird `abgeschlossen_am` gesetzt und ggf. der
    Antrags-Status fortgeschaltet (in_pruefung → zweitpruefung_offen, etc.)."""
    db = SupabaseClient.from_env()
    if req.rolle not in ("erstpruefung", "zweitpruefung"):
        raise HTTPException(400, f"Ungültige Rolle: {req.rolle}")
    if req.pruefer_typ not in ("mensch", "ki"):
        raise HTTPException(400, f"Ungültiger pruefer_typ: {req.pruefer_typ}")

    payload: dict[str, Any] = {
        "antrag_id": req.antrag_id,
        "rolle": req.rolle,
        "pruefer_typ": req.pruefer_typ,
        "pruefer_id": req.pruefer_id,
        "pruefer_modus": req.pruefer_modus,
        "pruefprotokoll_id": req.pruefprotokoll_id,
        "gesamt_kommentar": req.gesamt_kommentar,
        "entscheidungs_vorschlag": req.entscheidungs_vorschlag,
    }
    if req.abhakungen_jsonb is not None:
        payload["abhakungen_jsonb"] = req.abhakungen_jsonb
    if req.abschliessen:
        payload["abgeschlossen_am"] = datetime.now(UTC).isoformat()
    # None-Werte raus, damit wir keine bestehenden Felder überschreiben
    payload = {k: v for k, v in payload.items() if v is not None}

    if req.id:
        rows = await db.update("pruefungen", f"id=eq.{req.id}", payload)
    else:
        rows = await db.insert("pruefungen", payload)

    pruefung = rows[0] if rows else {}

    # Status-Fortschaltung beim Abschließen
    if req.abschliessen:
        new_status = await _fortschalten(db, req)
        return {"pruefung": pruefung, "neuer_status": new_status}
    return {"pruefung": pruefung}


async def _fortschalten(db: SupabaseClient, req: PruefungRequest) -> str | None:
    """Nach Abschluss einer Prüfung den Antrags-Status weiterschalten.

    Erstprüfung:
      - Zweitprüfung erforderlich  → status='zweitpruefung_offen'
      - Sonst: status bleibt 'in_pruefung' (Sachbearbeiter triggert manuell
        die finale Status-Änderung via bestehendem Workflow-Card)

    Zweitprüfung:
      - Beide Vorschläge gleich  → status bleibt (Sachbearbeiter klickt
        auf 'Bewilligen' / 'Ablehnen' im Workflow-Card wie bisher)
      - Dissens                   → status='zweitpruefung_dissens'
    """
    antrag_rows = await db.select(
        "antraege", f"id=eq.{req.antrag_id}&select=status",
    )
    if not antrag_rows:
        return None
    current = antrag_rows[0]["status"]

    if req.rolle == "erstpruefung":
        if _zweitpruefung_erforderlich(
            req.entscheidungs_vorschlag, req.bewilligte_summe_euro,
        ) and current == "in_pruefung":
            await db.update(
                "antraege", f"id=eq.{req.antrag_id}",
                {"status": "zweitpruefung_offen"},
            )
            return "zweitpruefung_offen"
        return current

    # Zweitprüfung abgeschlossen → Dissens-Check
    erst_rows = await db.select(
        "pruefungen",
        f"antrag_id=eq.{req.antrag_id}&rolle=eq.erstpruefung"
        "&select=entscheidungs_vorschlag",
    )
    erst_vorschlag = (erst_rows[0] or {}).get("entscheidungs_vorschlag") if erst_rows else None
    if (
        erst_vorschlag
        and req.entscheidungs_vorschlag
        and erst_vorschlag != req.entscheidungs_vorschlag
        and current == "zweitpruefung_offen"
    ):
        await db.update(
            "antraege", f"id=eq.{req.antrag_id}",
            {"status": "zweitpruefung_dissens"},
        )
        return "zweitpruefung_dissens"
    return current


@app.get("/api/pruefung")
async def list_pruefungen(antrag_id: str) -> dict[str, Any]:
    """Listet alle (max. 2) Prüfungen eines Antrags."""
    db = SupabaseClient.from_env()
    rows = await db.select(
        "pruefungen",
        f"antrag_id=eq.{antrag_id}&select=*&order=angelegt_am.asc",
    )
    return {"pruefungen": rows}


@app.delete("/api/pruefung/{pruefung_id}")
async def delete_pruefung(pruefung_id: str) -> dict[str, Any]:
    """Löscht eine Prüfungs-Bewertung und rollt den Antrags-Status zurück,
    falls er im Zweitprüfungs-Zustand hängt. Läuft über Service-Role und
    umgeht damit RLS — verlässlicher als Frontend-direkter Supabase-Call."""
    db = SupabaseClient.from_env()
    rows = await db.select(
        "pruefungen", f"id=eq.{pruefung_id}&select=antrag_id",
    )
    if not rows:
        raise HTTPException(404, f"Prüfung {pruefung_id} nicht gefunden")
    antrag_id = rows[0]["antrag_id"]

    deleted = await db.delete("pruefungen", f"id=eq.{pruefung_id}")

    # Antrags-Status zurücksetzen falls noch in zweitpruefung_*-State
    a_rows = await db.select("antraege", f"id=eq.{antrag_id}&select=status")
    current = a_rows[0]["status"] if a_rows else None
    if current in ("zweitpruefung_offen", "zweitpruefung_dissens"):
        await db.update(
            "antraege", f"id=eq.{antrag_id}", {"status": "in_pruefung"},
        )

    return {"deleted": deleted, "antrag_status": current}


@app.delete("/api/bescheid/{bescheid_id}")
async def delete_bescheid(bescheid_id: str) -> dict[str, Any]:
    """Löscht einen Bescheid + zugehöriges PDF aus dem Storage.
    Läuft über Service-Role und umgeht RLS-Owner-Probleme der bescheide-
    Tabelle (gehört supabase_admin, nicht postgres)."""
    db = SupabaseClient.from_env()
    rows = await db.select(
        "bescheide", f"id=eq.{bescheid_id}&select=pdf_storage_path",
    )
    if not rows:
        raise HTTPException(404, f"Bescheid {bescheid_id} nicht gefunden")
    pdf_path = rows[0].get("pdf_storage_path")

    if pdf_path:
        await db.delete_storage("bescheide", pdf_path)
    deleted = await db.delete("bescheide", f"id=eq.{bescheid_id}")

    return {"deleted": deleted, "pdf_storage_path": pdf_path}


class KiZweitpruefungRequest(BaseModel):
    """Body von POST /api/pruefung/ki-zweitpruefung."""
    antrag_id: str
    pruefprotokoll_id: str | None = None  # default: letztes Erst-Protokoll


@app.post("/api/pruefung/ki-zweitpruefung")
async def trigger_ki_zweitpruefung(req: KiZweitpruefungRequest) -> dict[str, Any]:
    """Triggert eine adversarielle KI-Zweitprüfung auf Basis einer
    existierenden Erstprüfung. Schreibt ein neues pruefprotokoll (Layer Z)
    und legt einen pruefungen-Eintrag mit Rolle=zweitpruefung, Typ=ki,
    Modus=adversariell + bereits berechneter Dissens-Liste an.

    UI ruft das auf, wenn der Sachbearbeiter im ZweitpruefungsCard auf
    'KI als Zweitprüfer starten' klickt."""
    start = time.monotonic()
    db = SupabaseClient.from_env()

    antrag = await _fetch_antrag(req.antrag_id, db)

    # Letzte Erstprüfung (= jüngstes pruefprotokoll) finden
    pp_query = (
        f"antrag_id=eq.{req.antrag_id}&select=id,ergebnis_jsonb,doctree_version"
        "&order=geprueft_am.desc&limit=1"
    )
    if req.pruefprotokoll_id:
        pp_query = f"id=eq.{req.pruefprotokoll_id}&select=id,ergebnis_jsonb,doctree_version"
    pp_rows = await db.select("pruefprotokoll", pp_query)
    if not pp_rows:
        raise HTTPException(
            409, "Keine Erstprüfung gefunden — bitte erst KI-Erstprüfung laufen lassen.",
        )
    erst_protokoll = pp_rows[0]
    erst_befunde: list[dict] = (erst_protokoll.get("ergebnis_jsonb") or {}).get("befunde", [])

    tree, version = await _fetch_doctree(db)

    # Adversariellen Lauf ausführen (mit Cost-Tracking)
    from pruefung.llm_client import UsageTracker
    from pruefung.zweitpruefer_ki import (
        run_adversarielle_zweitpruefung, zweitpruefung_zu_befunden,
    )
    usage = UsageTracker()
    zweit_ergebnis = await run_adversarielle_zweitpruefung(
        antrag=antrag,
        erst_befunde=erst_befunde,
        tree=tree,
        usage=usage,
    )

    # Dissens berechnen
    from pruefung.dissens import (
        berechne_dissens, dissens_zusammenfassung, hat_strukturierte_antwort,
    )
    dissens = berechne_dissens(erst_befunde, zweit_ergebnis)
    strukturiert = hat_strukturierte_antwort(zweit_ergebnis)

    # Zweit-Pprotokoll persistieren (selbe Tabelle, modus-Marker im ergebnis_jsonb)
    duration_ms = int((time.monotonic() - start) * 1000)
    zweit_befunde = zweitpruefung_zu_befunden(zweit_ergebnis)
    zweit_ergebnis_obj = PruefungsErgebnis(
        befunde=zweit_befunde,
        doctree_version=version,
        duration_ms=duration_ms,
    )
    zweit_ergebnis_dict = zweit_ergebnis_obj.model_dump()
    zweit_ergebnis_dict["modus"] = "adversariell"
    zweit_ergebnis_dict["zweit_ergebnis_raw"] = zweit_ergebnis  # vollständige Rohdaten
    zweit_ergebnis_dict["dissens"] = dissens
    zweit_ergebnis_dict["llm_usage"] = usage.to_dict()

    pp_insert = await db.insert("pruefprotokoll", {
        "antrag_id": req.antrag_id,
        "geprueft_von": "claude-sonnet-4-5",
        "doctree_version": version,
        "ergebnis_jsonb": zweit_ergebnis_dict,
        "duration_ms": duration_ms,
    })
    zweit_pp_id = pp_insert[0]["id"] if pp_insert else None

    # pruefungen-Row anlegen (oder updaten, falls schon vorhanden)
    existing = await db.select(
        "pruefungen",
        f"antrag_id=eq.{req.antrag_id}&rolle=eq.zweitpruefung&select=id",
    )
    # WICHTIG: abgeschlossen_am wird NICHT gesetzt — die KI liefert nur eine
    # Vorab-Bewertung. Der Mensch sieht den KI-Output in der UI, kann die
    # Befund-Checks (✓/✗/?) selbst setzen, den Vorschlag bestätigen oder
    # ändern und schließt erst dann die Zweitprüfung ab. Sonst wäre der
    # Mensch im KI→KI-Vier-Augen-Workflow nur Statist.
    payload = {
        "antrag_id": req.antrag_id,
        "rolle": "zweitpruefung",
        "pruefer_typ": "ki",
        "pruefer_id": "claude-sonnet-4-5",
        "pruefer_modus": "adversariell",
        "pruefprotokoll_id": zweit_pp_id,
        "abhakungen_jsonb": {
            "befunde": {},
            "abschnitte": {},
            "dissens": dissens,
            "ki_strukturiert": strukturiert,
        },
        "entscheidungs_vorschlag": _vorschlag_to_db(
            zweit_ergebnis.get("gesamt_vorschlag")
        ),
        "gesamt_kommentar": zweit_ergebnis.get("gesamt_begruendung"),
    }
    if existing:
        rows = await db.update(
            "pruefungen", f"id=eq.{existing[0]['id']}", payload,
        )
    else:
        rows = await db.insert("pruefungen", payload)

    return {
        "pruefung": rows[0] if rows else {},
        "pruefprotokoll_id": zweit_pp_id,
        "dissens": dissens,
        "dissens_summary": dissens_zusammenfassung(dissens),
        "gesamt_vorschlag": zweit_ergebnis.get("gesamt_vorschlag"),
        "gesamt_begruendung": zweit_ergebnis.get("gesamt_begruendung"),
        "duration_ms": duration_ms,
    }


def _vorschlag_to_db(vorschlag: str | None) -> str | None:
    """KI sagt 'bewilligen|ablehnen|rueckfragen' — wir mappen auf Enum."""
    if vorschlag in ("bewilligen", "ablehnen", "rueckfragen"):
        return vorschlag
    return None


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


def _apply_legacy_field_aliases(antrag: dict[str, Any]) -> dict[str, Any]:
    """Mappt neue apl.antraege-Feldnamen auf Legacy-Aliase, die das
    bestehende Bescheid-Template (templates/bescheid.html.j2) und das
    DOCX-Render noch erwarten.

    Mapping (neu → legacy-alias):
      - einrichtung    → name
      - dachverband    → traeger (Fallback: einrichtung)
      - bankname       → bankverbindung
      - submitted_at   → antragsdatum (ISO-Date, nur das Datums-Präfix)

    Nicht-destruktiv: Legacy-Aliase werden nur gesetzt, wenn sie nicht
    bereits einen Wert haben — so überschreibt der Adapter nichts.
    """
    out = dict(antrag)
    if not out.get("name"):
        out["name"] = out.get("einrichtung") or out.get("name")
    if not out.get("traeger"):
        out["traeger"] = (
            out.get("dachverband")
            or out.get("einrichtung")
            or out.get("traeger")
        )
    if not out.get("bankverbindung"):
        out["bankverbindung"] = out.get("bankname") or out.get("bankverbindung")
    if not out.get("antragsdatum"):
        sub = out.get("submitted_at")
        if sub:
            out["antragsdatum"] = str(sub)[:10]
    return out


@app.post("/api/bescheid")
async def bescheid(req: BescheidRequest) -> dict[str, Any]:
    """Erstellt einen Verwaltungsbescheid (PDF + apl.bescheide-Eintrag)
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
    antrag = _apply_legacy_field_aliases(antrag_rows[0])

    # Bescheid-Sperre: solange Zweitprüfung offen oder im Dissens ist, darf
    # noch kein Bescheid erzeugt werden — der Sachbearbeiter muss erst die
    # Zweitprüfung abschließen (und ggf. den Dissens auflösen).
    if antrag.get("status") in ("zweitpruefung_offen", "zweitpruefung_dissens"):
        raise HTTPException(
            409,
            f"Bescheid kann nicht erzeugt werden: Antrag im Status "
            f"'{antrag['status']}'. Zweitprüfung muss zuerst abgeschlossen werden.",
        )

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

    # Halluzinations-Schutz Stufe 1 (Soft, gegen Doctree):
    # Wenn der Doctree gefüllt ist, prüfen wir Wortlaut-Übereinstimmungen
    # (z.B. zitierter ahp_wortlaut kommt tatsächlich im Section-Content vor).
    # Wenn ahp_doctree leer/migriert/nicht vorhanden ist, liefert die
    # Funktion ohnehin nichts — Soft-Layer ist tolerant.
    # TODO: Sobald apl.ahp_doctree zuverlässig migriert ist, kann dieser
    # Layer wieder schärfer geschaltet werden (z.B. 422 statt Logging).
    from pruefung.quellen_validator import validiere_alle
    verstoesse_raw = [b for b in befunde_raw if b.get("schwere") == "verstoss"]
    halluzinations_fehler_soft = validiere_alle(verstoesse_raw, tree)
    if halluzinations_fehler_soft:
        # Soft-Fail: nur loggen, NICHT blockieren — der echte Hard-Fail
        # läuft weiter unten gegen apl.ahp_norm_statements.
        import logging
        logging.getLogger("pruefung.bescheid").warning(
            "Soft-Validator findet %d Wortlaut-Diskrepanzen für antrag %s: %s",
            len(halluzinations_fehler_soft),
            req.antrag_id,
            [(f.get("paragraph_ref"), f.get("art")) for f in halluzinations_fehler_soft],
        )

    # 4) Befunde mit AHP-Wortlaut + Subsumtion anreichern.
    #    NUR Verstöße kommen in den Bescheid — Hinweise sind interne
    #    Bearbeiter-Aufgaben (z.B. "IBAN-Inhaberschaft manuell prüfen") und
    #    gehören NICHT in eine Bürger-Begründung.
    from pruefung.bescheid_subsumtion import build_subsumtion
    befunde_for_template: list[dict] = []
    for b in verstoesse_raw:
        ahp_path = _extract_ahp_path(b.get("paragraph_ref"))
        ahp_node = _find_section_by_path(tree, ahp_path) if ahp_path else None
        subs = build_subsumtion(b, antrag)
        befunde_for_template.append({
            "schwere": b.get("schwere"),
            "beschreibung": b.get("beschreibung", ""),
            "paragraph_ref": b.get("paragraph_ref"),
            "ahp_section_title": ahp_node.get("title") if ahp_node else None,
            "ahp_wortlaut": ahp_node.get("content") if ahp_node else None,
            "sachverhalt": subs.get("sachverhalt"),
            "wuerdigung": subs.get("wuerdigung"),
        })

    # Liste aller AHP-Sections, gegen die geprüft wurde — für die
    # Transparenz-Sektion im Bescheid ("Geprüft gegen folgende AHP-Stellen").
    # Ableitung aus den paragraph_refs ALLER Befunde des Protokolls (auch
    # Hinweise) — die alte ontologie_rules-Tabelle existiert im neuen
    # apl-Schema nicht mehr. So enthält die Liste reale AHP-Stellen, gegen
    # die im konkreten Fall geprüft wurde.
    geprueft_gegen = sorted({
        b["paragraph_ref"] for b in befunde_raw if b.get("paragraph_ref")
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

    # 6) PDF rendern (lazy-import wie bei /api/pdf wg. native libs).
    #    Wir trennen HTML-Render vom PDF-Schritt, damit dazwischen der
    #    Hard-Fail-Quellen-Validator gegen apl.ahp_norm_statements läuft.
    from pruefung.pdf_render import render_bescheid_html
    from pruefung.quellen_validator import (
        QuellenValidationError, validiere_oder_abbrechen,
    )
    bescheid_html, wappen_path = render_bescheid_html(
        bescheid_id=bescheid_id or "",
        antrag=antrag,
        entscheidung=req.entscheidung,
        bewilligte_summe_euro=req.bewilligte_summe_euro,
        befunde=befunde_for_template,
        bearbeiter_kommentar=req.bearbeiter_kommentar,
        ausgestellt_von=req.ausgestellt_von,
        ausgestellt_am=ausgestellt_am,
        doctree_version=doctree_version,
        geprueft_gegen=geprueft_gegen,
    )

    # Hard-Fail-Halluzinations-Schutz (Spec §12.1): jeder im finalen
    # Bescheid-Text zitierte § muss in apl.ahp_norm_statements existieren.
    # KEIN Toggle, KEIN Soft-Fail — wenn die KI etwas erfunden hat, wird
    # der Bescheid mit 422 abgelehnt und KEIN bescheide-Eintrag mit PDF
    # angelegt. Der bescheide-Datensatz oben wird durch das raise NICHT
    # rückgängig gemacht (kein Transaction-Scope hier), aber er trägt noch
    # KEIN pdf_storage_path und kann vom Sachbearbeiter im Frontend per
    # DELETE /api/bescheid/{id} entfernt werden — sauberer als ein
    # halb-deployed PDF.
    try:
        await validiere_oder_abbrechen(
            bescheid_html, db=db, antrag_id=req.antrag_id,
        )
    except QuellenValidationError as e:
        import logging
        logger = logging.getLogger("pruefung.bescheid")
        logger.error(
            "Hard-Fail Quellen-Validator HAT GEGRIFFEN für bescheid %s: %s",
            bescheid_id, str(e),
        )
        # Den nicht-renderbaren Bescheid-Datensatz wieder entfernen, damit
        # die Liste sauber bleibt. Best-effort — wenn der DELETE auch fehl-
        # schlägt, melden wir trotzdem 422.
        if bescheid_id:
            try:
                await db.delete("bescheide", f"id=eq.{bescheid_id}")
            except Exception as cleanup_err:  # noqa: BLE001
                logger.warning(
                    "Konnte bescheid %s nach Hard-Fail nicht entfernen: %s",
                    bescheid_id, cleanup_err,
                )
        raise HTTPException(
            status_code=422,
            detail={
                "fehler": "Halluzinations-Schutz: erfundene Paragraphen im Bescheid-Text",
                "details": str(e),
                "hinweis": (
                    "Die KI hat im Bescheid einen § zitiert, der NICHT in "
                    "apl.ahp_norm_statements existiert. KI-Subsumtion "
                    "wiederholen oder Bescheid manuell ohne diese Befunde "
                    "erzeugen."
                ),
            },
        ) from e

    from weasyprint import HTML as _WeasyHTML
    pdf_bytes = _WeasyHTML(
        string=bescheid_html, base_url=str(wappen_path.parent),
    ).write_pdf()

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


@app.get("/api/bescheid/{bescheid_id}/docx")
async def bescheid_docx(bescheid_id: str) -> Response:
    """Editierbare DOCX-Variante eines existierenden Bescheids.

    On-demand-Rendering: Wir persistieren nur das PDF im Storage; DOCX wird
    bei Bedarf aus der gleichen Datenbasis (Antrag + Bescheid-Begründung)
    neu erzeugt. So bleibt der Bescheid-Datensatz die single source of truth
    und das Storage-Volumen klein."""
    db = SupabaseClient.from_env()

    # 1) Bescheid laden — enthält die bereits angereicherte Begründung
    rows = await db.select(
        "bescheide",
        f"id=eq.{bescheid_id}&select=*",
    )
    if not rows:
        raise HTTPException(404, f"Bescheid {bescheid_id} nicht gefunden")
    b = rows[0]

    # 2) Antrag laden (volle Adresse + Bezeichner)
    antrag_rows = await db.select(
        "antraege",
        f"id=eq.{b['antrag_id']}&select=*",
    )
    if not antrag_rows:
        raise HTTPException(404, f"Antrag {b['antrag_id']} nicht gefunden")
    antrag = _apply_legacy_field_aliases(antrag_rows[0])

    # 3) Befunde direkt aus dem persistierten begruendung_jsonb übernehmen
    #    (sind beim POST /api/bescheid bereits mit Wortlaut + Subsumtion
    #    angereichert worden).
    befunde_for_template = (b.get("begruendung_jsonb") or {}).get("befunde", [])

    # 4) Liste aller geprüften AHP-Stellen — aus den Befunden ableiten
    #    (ontologie_rules-Tabelle existiert im neuen apl-Schema nicht mehr).
    geprueft_gegen = sorted({
        x["paragraph_ref"]
        for x in befunde_for_template
        if x.get("paragraph_ref")
    })

    ausgestellt_am = b.get("ausgestellt_am")
    if isinstance(ausgestellt_am, str):
        # Postgres liefert ISO-8601 mit '+00:00' — robust parsen
        ausgestellt_am = datetime.fromisoformat(ausgestellt_am.replace("Z", "+00:00"))
    elif ausgestellt_am is None:
        ausgestellt_am = datetime.now(UTC)

    from pruefung.pdf_render import render_bescheid_docx
    docx_bytes = render_bescheid_docx(
        bescheid_id=bescheid_id,
        antrag=antrag,
        entscheidung=b["entscheidung"],
        bewilligte_summe_euro=b.get("bewilligte_summe_euro"),
        befunde=befunde_for_template,
        bearbeiter_kommentar=b.get("bearbeiter_kommentar"),
        ausgestellt_von=b.get("ausgestellt_von"),
        ausgestellt_am=ausgestellt_am,
        doctree_version=b.get("doctree_version"),
        geprueft_gegen=geprueft_gegen,
    )

    nummer = antrag.get("antragsnummer") or bescheid_id[:8]
    filename = f"Bescheid_{nummer}.docx"
    return Response(
        content=docx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


@app.get("/api/antrag/{antrag_id}/vergleich-vorjahr")
async def vergleich_vorjahr(antrag_id: str) -> dict[str, Any]:
    """Heuristischer Diff zwischen aktuellem Antrag und Vorjahres-Antrag
    desselben Trägers. Kein KI-Aufruf — reine Geschäftsregeln (siehe
    vergleich_vorjahr.py)."""
    from pruefung.vergleich_vorjahr import vergleich_mit_vorjahr
    db = SupabaseClient.from_env()
    return await vergleich_mit_vorjahr(antrag_id, db)


@app.post("/api/antrag/{antrag_id}/validiere-extern")
async def validiere_extern(antrag_id: str) -> dict[str, Any]:
    """Layer D — externe Validierung via Perplexity.

    Prüft Träger, Adresse und Einrichtung gegen öffentliche Web-Quellen.
    Antwort enthält Quellen-URLs für Audit-Trail. Personenbezogene Daten
    (Ansprechpartner, Email) werden bewusst NICHT an die externe API
    geschickt (Datenminimierung gem. DSGVO).

    Ergebnis-Befunde sind immer 'hinweis'-Schwere (nie 'verstoss') —
    externe Quellen sind nicht rechtsverbindlich, Sachbearbeiter:in muss
    bei Auffälligkeiten manuell prüfen."""
    from pruefung.extern_validierung import validiere_alles
    db = SupabaseClient.from_env()
    antrag = await _fetch_antrag(antrag_id, db)
    befunde = await validiere_alles(antrag)

    # Audit: in apl.pruefprotokoll persistieren als eigener Eintrag mit
    # ergebnis_jsonb.modus='extern' — dann sichtbar im Verlauf-Trace
    # ('Externe Validierung durchgeführt 23.05. …').
    summary = {
        "kritisch": sum(1 for b in befunde if b["art"] == "kritisch"),
        "neutral": sum(1 for b in befunde if b["art"] == "neutral"),
        "fehler": sum(1 for b in befunde if b["art"] == "fehler"),
    }
    await db.insert("pruefprotokoll", {
        "antrag_id": antrag_id,
        "geprueft_von": "perplexity-sonar",
        "ergebnis_jsonb": {
            "modus": "extern",
            "befunde": [],  # Layer-A/B/C-Befunde sind hier leer
            "extern_befunde": befunde,
            "summary": summary,
        },
        "duration_ms": None,
    })
    return {"befunde": befunde, "summary": summary}


class RegelkatalogToggleRequest(BaseModel):
    """Body von PATCH /api/regelkatalog/{id}/toggle."""
    aktiv: bool
    geaendert_von: str   # Email der Sachbearbeitung (Admin-Rolle)
    aenderungsgrund: str  # Pflicht-Begründung für Audit-Trail


@app.patch("/api/regelkatalog/{rule_id}/toggle")
async def regelkatalog_toggle(
    rule_id: str, req: RegelkatalogToggleRequest,  # noqa: ARG001
) -> dict[str, Any]:
    """DEPRECATED — apl.ontologie_rules wurde im Multi-FB-Refactor entfernt
    (Migrationen 060-067). FB-spezifische Konformitäts-Regeln stecken jetzt
    in den FB-Plugins (pruefung.foerderbereiche.<fb>.check_konformitaet);
    ein dynamisches Toggle ist ohne separate Persistenz-Tabelle nicht mehr
    möglich. Endpoint liefert 410 Gone, damit Frontends den Bruch
    deterministisch erkennen statt auf 500-Serverfehler zu warten."""
    raise HTTPException(
        status_code=410,
        detail={
            "fehler": (
                "apl.ontologie_rules existiert nicht mehr. "
                "FB-spezifische Konformitätsregeln werden jetzt im "
                "FB-Plugin (pruefung.foerderbereiche.<fb>.check_konformitaet) "
                "gepflegt — Änderungen erfordern Code-/Migration-PR."
            ),
        },
    )


@app.get("/api/compliance/status")
async def compliance_status() -> dict[str, Any]:
    """AI-Act-/DSGVO-Compliance-Übersicht. Statische Konfig + Live-Metriken
    aus DB. Dient als Selbst-Audit + externe Transparenz, ersetzt aber
    keine formelle Konformitätsbewertung."""
    from pruefung.compliance import status
    db = SupabaseClient.from_env()
    return await status(db)


@app.get("/api/dashboard/adoption")
async def dashboard_adoption() -> dict[str, Any]:
    """Adoption-Dashboard: zeigt, wie oft die finale Entscheidung der
    KI-Empfehlung folgt. Macht Automation Bias sichtbar.

    Healthy-Bandbreite (Literatur): 60-80% Übernahme. > 90% = Verdacht
    auf blindes Folgen, < 40% = KI-Empfehlung nicht hilfreich."""
    from pruefung.adoption_metrics import berechne_adoption
    db = SupabaseClient.from_env()
    return await berechne_adoption(db)


@app.get("/api/antrag/{antrag_id}/risiko-score")
async def risiko_score(antrag_id: str) -> dict[str, Any]:
    """Heuristischer Risiko-Score (0..100) für die Inbox-Triage."""
    from pruefung.risiko_score import berechne_risiko_score
    db = SupabaseClient.from_env()
    return await berechne_risiko_score(antrag_id, db)


@app.post("/api/extract-norms")
async def extract_norms() -> dict[str, Any]:
    """Layer L2 — Knowledge-Layer-Befüllung.

    Iteriert über alle Sections des aktuellen Doctrees und ruft Claude
    pro Section auf, um normative Aussagen zu extrahieren. Statements
    landen als status='pending' in apl.ahp_norm_statements zur manuellen
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
    """Liest AHP-PDF, baut Doctree, schreibt in apl.ahp_doctree.

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


# ─────────────────────────────────────────────────────────────────────
# Smart-Upload-Endpoints (Phase 4B Tasks 4.8–4.10)
# ─────────────────────────────────────────────────────────────────────

# 10 MB ist genug für eine Antrag-Seite mit Wappen + Tabelle. Größere
# Uploads sollten kein Smart-Upload sein (separate Belege etc.).
_UPLOAD_MAX_BYTES = 10 * 1024 * 1024


@app.post("/api/klassifiziere-pdf")
async def klassifiziere_pdf_endpoint(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """UE3-Smart-Upload: erkennt den Förderbereich (I/II/III/IV) + ggf.
    FB-III-Variante aus der hochgeladenen PDF-Seite. Bürger kann den
    Vorschlag im Frontend korrigieren bevor der Antrag erzeugt wird.

    Halluzinations-Schutz im Modul: liefert das LLM einen unbekannten
    FB, kommt None+konfidenz=0 zurück."""
    pdf_bytes = await file.read()
    if len(pdf_bytes) > _UPLOAD_MAX_BYTES:
        raise HTTPException(413, "PDF > 10 MB")
    from pruefung.klassifiziere_pdf import klassifiziere
    return await klassifiziere(pdf_bytes)


@app.post("/api/extrahiere-helferliste")
async def extrahiere_helferliste_endpoint(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """OCR-Extraktion einer FB-II-Helferliste (PDF) via Claude Vision.

    Returnt {helfer: [...]} im apl.fb_ii_helfer-Schema. Bürger/UE1 kann
    die Liste vor dem persist editieren."""
    pdf_bytes = await file.read()
    if len(pdf_bytes) > _UPLOAD_MAX_BYTES:
        raise HTTPException(413, "PDF > 10 MB")
    from pruefung.extrahiere_helferliste import extrahiere_helferliste
    helfer = await extrahiere_helferliste(pdf_bytes)
    return {"helfer": helfer, "anzahl": len(helfer)}


# ─────────────────────────────────────────────────────────────────────
# UE4 — Sozialamt-Assistent (agentisches Antragsformular, Reifegrad 4)
# ─────────────────────────────────────────────────────────────────────


class AgentChatRequest(BaseModel):
    """Body von POST /api/agent/chat."""
    session_id: str
    history: list[dict[str, Any]] = []
    user_message: str
    current_draft: dict[str, Any] = {}


@app.post("/api/agent/chat")
async def agent_chat_endpoint(req: AgentChatRequest) -> dict[str, Any]:
    """UE4: Konversationeller Antrags-Assistent.

    Ein Turn: User-Message rein → Tool-Use-Loop läuft → Assistant-Text +
    aktualisierter Draft + Next-Action-Hint raus. Persistiert weder die
    Session (Frontend hält localStorage) noch die History (Frontend
    sendet sie bei jedem Call wieder mit).

    Submit-Tool schreibt direkt in apl.antraege via service_role.
    """
    from pruefung.agent_chat import run_agent_turn
    db = None
    # Wenn ENV vorhanden → echter DB-Modus für Submit. Sonst Dry-Run.
    try:
        db = SupabaseClient.from_env()
    except RuntimeError:
        db = None

    try:
        result = await run_agent_turn(
            history=req.history,
            user_message=req.user_message,
            current_draft=req.current_draft,
            db=db,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=f"Agent-Fehler: {e!r}") from e
    return {
        "session_id": req.session_id,
        **result,
    }


@app.post("/api/import-excel-schablone")
async def import_excel_schablone_endpoint(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Deterministischer Excel-Import (openpyxl) für die FB-II-
    Helferliste-Schablone. Header-Mismatch → 400."""
    xlsx_bytes = await file.read()
    if len(xlsx_bytes) > _UPLOAD_MAX_BYTES:
        raise HTTPException(413, "Excel > 10 MB")
    from pruefung.excel_import import import_helferliste
    try:
        helfer = import_helferliste(xlsx_bytes)
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
    return {"helfer": helfer, "anzahl": len(helfer)}
