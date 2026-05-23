"""FastAPI-Service für UE3 KI-gestützte Prüfung von APL2-Anträgen."""
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException
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
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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

    # Halluzinations-Schutz: VOR der Anreicherung prüfen, dass jeder
    # Verstoß-Befund mit paragraph_ref eine echte AHP-Section referenziert
    # und ein eventuelles Zitat tatsächlich im Wortlaut vorkommt. Wenn die
    # KI etwas erfunden hat, blockieren wir den Bescheid mit 422.
    from pruefung.quellen_validator import validiere_alle
    verstoesse_raw = [b for b in befunde_raw if b.get("schwere") == "verstoss"]
    halluzinations_fehler = validiere_alle(verstoesse_raw, tree)
    if halluzinations_fehler:
        raise HTTPException(
            status_code=422,
            detail={
                "fehler": "Bescheid blockiert — KI-Quellen nicht verifizierbar",
                "anzahl_betroffen": len(halluzinations_fehler),
                "befunde": halluzinations_fehler,
                "empfehlung": (
                    "Erstprüfung mit aktuellem Doctree wiederholen "
                    "(POST /api/pruefen) oder Bescheid manuell ohne diese "
                    "Befunde erzeugen."
                ),
            },
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
    # Wir ziehen die paragraph_refs aus ALLEN aktiven Ontologie-Regeln (nicht
    # nur den verletzten), plus Layer-A-Bezug AHP 3.6, plus Layer-C wenn vorhanden.
    rules_rows = await db.select(
        "ontologie_rules",
        "plan_id=eq.APL2&aktiv=eq.true&select=paragraph_ref",
    )
    geprueft_gegen = sorted({
        r["paragraph_ref"] for r in rules_rows if r.get("paragraph_ref")
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
        geprueft_gegen=geprueft_gegen,
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
    antrag = antrag_rows[0]

    # 3) Befunde direkt aus dem persistierten begruendung_jsonb übernehmen
    #    (sind beim POST /api/bescheid bereits mit Wortlaut + Subsumtion
    #    angereichert worden).
    befunde_for_template = (b.get("begruendung_jsonb") or {}).get("befunde", [])

    # 4) Liste aller geprüften AHP-Stellen (analog POST)
    rules_rows = await db.select(
        "ontologie_rules",
        "plan_id=eq.APL2&aktiv=eq.true&select=paragraph_ref",
    )
    geprueft_gegen = sorted({
        r["paragraph_ref"] for r in rules_rows if r.get("paragraph_ref")
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

    # Audit: in apl2.pruefprotokoll persistieren als eigener Eintrag mit
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
