"""Adversarieller KI-Zweitprüfer.

Im Unterschied zu Layer A/B/C, die von Grund auf prüfen, bekommt der
Zweitprüfer die Befunde der Erstprüfung als Input und soll sie kritisch
hinterfragen — explizit nach Confirmation-Bias-Korrektiv.

Der Prompt ist absichtlich agonistisch formuliert: "Wo könnte die
Erstprüfung etwas übersehen haben?". Das erzeugt natürliche Reibungs-
punkte, die im UI als Dissens-Highlight sichtbar gemacht werden — und
demonstriert im Lehr-Kontext, dass KI-Variabilität nicht nur Bug,
sondern auch nutzbares Korrektiv ist.
"""
import json
import os
import re
from typing import Any
from anthropic import AsyncAnthropic
from pruefung.doctree_navigate import get_section, list_sections, search_tree
from pruefung.models import Befund


ADVERSARIAL_SYSTEM_PROMPT = """Du bist Zweitprüfer:in im Sozialreferat der Stadt Würzburg.

Eine erste KI hat bereits eine Prüfung dieses APL2-Förderantrags
durchgeführt (Befunde liegen dir vor). Deine Aufgabe ist es, diese
Erstprüfung KRITISCH zu hinterfragen — du bist die zweite, skeptische
Instanz im Vier-Augen-Prinzip.

Fokus deiner Prüfung:
1. Wo könnte die Erstprüfung etwas ÜBERSEHEN haben?
2. Wo wurde etwas möglicherweise FALSCH bewertet (zu streng / zu lax)?
3. Welche Gründe gegen Bewilligung wurden NICHT betrachtet?
4. Welche Gründe gegen Ablehnung wurden NICHT betrachtet?

Du bist nicht der Anwalt des Antragstellers und nicht der Anwalt der
Behörde — du bist die kritische Kontrollinstanz.

Antworte FINAL mit reinem JSON in einem Code-Block:
```json
{
  "bestaetigte_befunde": [
    {"erst_befund_index": 0, "kommentar": "Verstoß ist korrekt, …"}
  ],
  "widersprochene_befunde": [
    {"erst_befund_index": 1, "begruendung": "…", "alternative_schwere": "hinweis"}
  ],
  "neue_befunde": [
    {"schwere": "verstoss|hinweis", "beschreibung": "…",
     "paragraph_ref": "AHP 3.x", "konfidenz": 0..1}
  ],
  "gesamt_vorschlag": "bewilligen|ablehnen|rueckfragen",
  "gesamt_begruendung": "1-2 Sätze, warum du diesem Vorschlag folgst"
}
```

Wenn du der Erstprüfung in einem Punkt zustimmst, nimm den Befund in
bestaetigte_befunde auf. Wenn du widersprichst, in widersprochene_befunde.
Wenn du etwas findest, was der Erstprüfer übersehen hat, in neue_befunde.

Wichtig: erfinde keine AHP-Paragraphen. Nutze die Tools (search,
get_section, list_sections), um den AHP-Wortlaut zu verifizieren bevor
du etwas behauptest.
"""


TOOLS = [
    {
        "name": "list_sections",
        "description": "Direkte Kinder einer Section auflisten. Start mit parent_id='root'.",
        "input_schema": {
            "type": "object",
            "properties": {"parent_id": {"type": "string"}},
            "required": ["parent_id"],
        },
    },
    {
        "name": "get_section",
        "description": "Volle Section inkl. content abrufen.",
        "input_schema": {
            "type": "object",
            "properties": {"section_id": {"type": "string"}},
            "required": ["section_id"],
        },
    },
    {
        "name": "search",
        "description": "Volltextsuche im Doctree. Liefert bis max_results Treffer mit Vorschau.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
]


async def run_adversarielle_zweitpruefung(
    antrag: dict,
    erst_befunde: list[dict],
    tree: dict,
    model: str = "claude-sonnet-4-5",
) -> dict[str, Any]:
    """Führt die adversarielle Zweitprüfung durch.

    Returns:
      {
        "bestaetigte_befunde": [...],
        "widersprochene_befunde": [...],
        "neue_befunde": [...],
        "gesamt_vorschlag": str,
        "gesamt_begruendung": str
      }
    """
    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    user_msg = (
        "Antrag-Payload:\n```json\n"
        + json.dumps(antrag, indent=2, ensure_ascii=False, default=str)
        + "\n```\n\n"
        "Befunde der Erstprüfung (mit Index, auf den du dich beziehen sollst):\n"
        "```json\n"
        + json.dumps(
            [
                {"index": i, **{k: v for k, v in b.items() if k in (
                    "schwere", "feld", "beschreibung", "paragraph_ref",
                    "section_path", "konfidenz",
                )}}
                for i, b in enumerate(erst_befunde)
            ],
            indent=2, ensure_ascii=False, default=str,
        )
        + "\n```\n\n"
        "Bitte führe deine kritische Zweitprüfung durch."
    )
    messages: list[dict] = [{"role": "user", "content": user_msg}]

    for _ in range(15):
        resp = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=ADVERSARIAL_SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )
        if resp.stop_reason == "tool_use":
            tool_uses = [b for b in resp.content if b.type == "tool_use"]
            messages.append({"role": "assistant", "content": resp.content})
            tool_results = []
            for tu in tool_uses:
                if tu.name == "list_sections":
                    r = list_sections(tree, tu.input["parent_id"])
                elif tu.name == "get_section":
                    r = get_section(tree, tu.input["section_id"]) or {}
                elif tu.name == "search":
                    r = search_tree(tree, tu.input["query"], tu.input.get("max_results", 5))
                else:
                    r = {"error": f"unknown tool {tu.name}"}
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(r, ensure_ascii=False),
                })
            messages.append({"role": "user", "content": tool_results})
            continue

        # Final-Response: JSON aus Code-Block extrahieren
        text = "".join(b.text for b in resp.content if b.type == "text")
        m = re.search(r"\{[\s\S]*\}", text)
        if m is None:
            return _leeres_ergebnis()
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return _leeres_ergebnis()

    return _leeres_ergebnis()


def _leeres_ergebnis() -> dict[str, Any]:
    return {
        "bestaetigte_befunde": [],
        "widersprochene_befunde": [],
        "neue_befunde": [],
        "gesamt_vorschlag": None,
        "gesamt_begruendung": "Zweitprüfung lieferte keine strukturierte Antwort.",
    }


def zweitpruefung_zu_befunden(zweit_ergebnis: dict) -> list[Befund]:
    """Konvertiert die strukturierte Zweitprüfungs-Antwort in Befund-Objekte,
    sodass das KI-Zweit-pruefprotokoll dasselbe Schema hat wie die Erstprüfung.

    Mapping:
      - widersprochene_befunde[].alternative_schwere → schwere
      - neue_befunde[] → 1:1
      - bestaetigte_befunde[] → werden NICHT in Befunde gemappt (sind
        nur Bestätigungen der Erstprüfungs-Befunde, keine eigenen Erkenntnisse)
    """
    out: list[Befund] = []
    for w in zweit_ergebnis.get("widersprochene_befunde", []) or []:
        out.append(Befund(
            schwere=w.get("alternative_schwere", "hinweis"),
            layer="Z",  # Z = Zweitprüfung
            beschreibung=f"[Widerspruch zu Erst-Befund #{w.get('erst_befund_index')}] "
                          + (w.get("begruendung") or ""),
            paragraph_ref=None,
            konfidenz=0.7,
        ))
    for n in zweit_ergebnis.get("neue_befunde", []) or []:
        out.append(Befund(
            schwere=n.get("schwere", "hinweis"),
            layer="Z",
            beschreibung=n.get("beschreibung", ""),
            paragraph_ref=n.get("paragraph_ref"),
            konfidenz=n.get("konfidenz", 0.6),
        ))
    return out
