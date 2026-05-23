"""Layer L2 — Knowledge-Layer-Extraktion.

Iteriert über alle Sections des aktuellen Doctrees und nutzt Claude
(Tool-Use), um normative Aussagen daraus zu extrahieren. Schreibt
Ergebnisse als status='pending' in apl2.ahp_norm_statements, wo sie der
Sachbearbeiter im /normen-Inspector kuratieren kann.
"""
import os
from typing import Any
from pruefung.llm_client import LlmClient, get_llm_client
from pruefung.db import SupabaseClient


_SYSTEM_PROMPT = """Du bist ein juristischer Knowledge-Extraktor für die \
AHP-Förderrichtlinie der Stadt Würzburg.

Du bekommst eine einzelne Section der Richtlinie (Titel + Fließtext) und \
extrahierst daraus ALLE normativen Aussagen — also alles, was Pflichten, \
Verbote, Grenzwerte, Fristen oder qualitative Anforderungen formuliert.

Eine normative Aussage ist eine Regel, die einen Antrag oder Träger \
prüfen, einschränken oder begründen würde. Beschreibender Fließtext \
(Vorwort, Erläuterungen, Hintergrund) ist KEINE normative Aussage.

REGELN:
1. Pro Aussage einen Tool-Aufruf von submit_statement mit:
   - statement: die Aussage in EIGENEN, präzisen Worten (kein Zitat,
     keine "Die Richtlinie sagt..."-Form, sondern direkt:
     "Der Zuschuss beträgt max 10.000 € pro Jahr.")
   - statement_type: einer der folgenden:
       'cap'           = Geldwert-Obergrenze (z.B. 10.000 €/Jahr)
       'frist'         = Datum/Periode (z.B. bis 1. April)
       'verbot'        = etwas ist ausgeschlossen
       'verpflichtung' = etwas muss getan werden
       'pflichtfeld'   = etwas muss im Antrag enthalten sein
       'staffel'       = konditionale Förderhöhe (z.B. nach Treffen-Anzahl)
       'qualitativ'    = nicht maschinell prüfbar (z.B. "anerkannt und bewährt")
   - applicable_to: JSON-Objekt, das angibt, worauf sich die Aussage bezieht:
       {"foerderbereiche": ["begegnungszentren","bildungstraeger"]}
       {"alle_traeger": true}
       {"verfahren": "antragstellung"}
       {"verfahren": "verwendungsnachweis"}
   - maschinell_pruefbar: true wenn die Aussage gegen ein konkretes Antrag-
     Feld geprüft werden könnte (Datum, Zahl, Boolean, Feld-Vorhandensein);
     false bei qualitativen Begriffen wie "bewährt", "ordnungsgemäß", etc.
2. Wenn die Section KEINE normativen Aussagen enthält (z.B. reines Vorwort),
   ruf das Tool gar nicht auf. Antworte mit "Keine Norm-Aussagen."
3. Konzentriere dich auf Klarheit: jede Aussage soll eigenständig
   verständlich sein, OHNE den Original-Kontext zu kennen.
4. Vermeide Wiederholungen: wenn dieselbe Regel mehrmals im Text steht,
   nur EIN Tool-Aufruf.
5. Sei vollständig: lieber eine Aussage zu viel als zu wenig — der
   Sachbearbeiter verwirft Falsche im UI.
"""


_SUBMIT_STATEMENT_TOOL = {
    "name": "submit_statement",
    "description": (
        "Übergibt eine einzelne normative Aussage aus der Section. "
        "Mehrere Aussagen werden durch mehrere Aufrufe übergeben."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "statement": {
                "type": "string",
                "description": "Die normative Aussage in eigenen Worten.",
            },
            "statement_type": {
                "type": "string",
                "enum": [
                    "cap", "frist", "verbot", "verpflichtung",
                    "pflichtfeld", "staffel", "qualitativ",
                ],
            },
            "applicable_to": {
                "type": "object",
                "description": (
                    "Worauf bezieht sich die Aussage? "
                    'z.B. {"foerderbereiche": ["begegnungszentren"]} '
                    'oder {"alle_traeger": true} oder {"verfahren": "antragstellung"}'
                ),
            },
            "maschinell_pruefbar": {
                "type": "boolean",
                "description": (
                    "True wenn gegen ein konkretes Antrag-Feld prüfbar, "
                    "false bei qualitativen Begriffen."
                ),
            },
        },
        "required": ["statement", "statement_type", "maschinell_pruefbar"],
    },
}


async def extract_from_section(
    section: dict[str, Any],
    client: LlmClient,
    model: str = "claude-sonnet-4-5",
) -> list[dict[str, Any]]:
    """Extrahiert Norm-Statements aus einer einzelnen Doctree-Section.

    Args:
        section: Doctree-Knoten mit title + content
        client: bereits initialisierter LlmClient (siehe llm_client.py)
        model: LLM-Modell

    Returns:
        Liste der Tool-Inputs (jedes mit statement, statement_type, ...).
        Leere Liste wenn Section keine Norm-Aussagen hat.
    """
    title = section.get("title", "")
    path = section.get("path", "")
    content = (section.get("content") or "").strip()
    if not content or len(content) < 80:
        # Zu kurze Sections (z.B. reine Überschriften) enthalten meist nichts
        return []

    user_msg = (
        f"Section: {path} {title}\n\n"
        f"Inhalt:\n{content}\n\n"
        "Extrahiere ALLE normativen Aussagen via submit_statement-Tool. "
        "Falls keine vorhanden, antworte nur mit 'Keine Norm-Aussagen.'"
    )

    response = await client.complete(
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
        tools=[_SUBMIT_STATEMENT_TOOL],
        max_tokens=4096,
        model=model,
    )
    statements: list[dict[str, Any]] = []
    for block in response.content:
        if getattr(block, "type", "") == "tool_use" and block.name == "submit_statement":
            statements.append(dict(block.input))
    return statements


def _iter_sections(node: dict[str, Any]) -> list[dict[str, Any]]:
    """Flach-iteriert alle Sections (DFS) — auch geschachtelte Kinder."""
    out: list[dict[str, Any]] = []
    out.append(node)
    for c in node.get("children", []) or []:
        out.extend(_iter_sections(c))
    return out


async def extract_all_norms(
    db: SupabaseClient,
    *,
    model: str = "claude-sonnet-4-5",
    api_key: str | None = None,
) -> dict[str, int]:
    """Vollständige Pipeline: Doctree laden → pro Section extrahieren →
    in apl2.ahp_norm_statements einfügen.

    Dedup auf doctree_version + section_path + statement (unique-constraint
    in der Tabelle).

    Returns:
        Counter-Dict mit sections_processed, statements_inserted, skipped.
    """
    # 1) Aktuellen Doctree laden
    rows = await db.select(
        "ahp_doctree",
        "select=version,tree_jsonb&order=built_at.desc&limit=1",
    )
    if not rows:
        return {"error": 1, "sections_processed": 0, "statements_inserted": 0}
    version = rows[0]["version"]
    tree = rows[0]["tree_jsonb"]

    # 2) Über alle Sections iterieren — Provider-Abstraktion liest
    #    Credentials zentral via env; api_key-Override entfällt.
    _ = api_key
    client = get_llm_client(default_model=model)
    sections = _iter_sections(tree)
    stats = {
        "sections_processed": 0,
        "sections_with_statements": 0,
        "statements_inserted": 0,
        "skipped_short": 0,
    }

    for sec in sections:
        path = sec.get("path", "")
        title = sec.get("title", "")
        content = (sec.get("content") or "").strip()
        if not content or len(content) < 80:
            stats["skipped_short"] += 1
            continue

        statements = await extract_from_section(sec, client, model=model)
        stats["sections_processed"] += 1
        if not statements:
            continue
        stats["sections_with_statements"] += 1

        # 3) Pro Statement: in DB einsetzen (unique-violations ignorieren)
        for s in statements:
            row = {
                "doctree_version": version,
                "section_path": path,
                "section_title": title,
                "statement": s.get("statement", ""),
                "statement_type": s.get("statement_type", "qualitativ"),
                "applicable_to": s.get("applicable_to") or {},
                "maschinell_pruefbar": bool(s.get("maschinell_pruefbar", False)),
                "extracted_by": model,
                "status": "pending",
            }
            try:
                await db.insert("ahp_norm_statements", row)
                stats["statements_inserted"] += 1
            except Exception:
                # Dedup-Konflikt — ignorieren
                pass

    return stats
