"""Layer C — PageIndex-Stil RAG via Claude Tool-Use.

Strategie:
- Claude bekommt System-Prompt + Antrag-Payload + Tool-Definitionen
- Claude navigiert iterativ den Doctree (list_sections, get_section, search)
- Final-Antwort: strukturiertes JSON mit Befunden + Zitaten

Tests mocken `_run_claude_loop` — kein echter API-Call in Test-Suite.
"""
import json
import os
import re
from typing import Any
from anthropic import AsyncAnthropic
from pruefung.doctree_navigate import list_sections, get_section, search_tree
from pruefung.models import Befund


SYSTEM_PROMPT = """Du bist Verwaltungs-Prüfer der Stadt Würzburg.
Du prüfst einen APL2-Antrag (Altenhilfeplan Nr. 2 — Altentagesstätten) gegen
die AHP-Förderrichtlinie der Stadt Würzburg.

Die Richtlinie liegt als hierarchischer Doc-Tree vor — du navigierst sie via Tools.

Vorgehen:
1. Verschaffe dir Überblick: list_sections(parent_id='root')
2. Für relevante Themen: search(query="…") oder get_section(section_id="…")
3. Vergleiche Antrag-Werte mit Richtlinien-Vorgaben
4. Liefere strukturierte Befunde — Verstöße (gegen klare Grenzen) und Hinweise
   (Plausibilitäts-Auffälligkeiten ohne klare Regelverletzung)

Pro Befund:
- schwere: "verstoss" oder "hinweis"
- feld: betroffenes Antragsfeld (z.B. "miete_jahr_euro"), oder weglassen
- beschreibung: knapp deutsch, was beanstandet wird
- zitat: 1 Satz aus der Richtlinie (möglichst wörtlich)
- section_path: Pfad zur zitierten Section (z.B. "§ 4.2")
- konfidenz: 0..1, wie sicher du bist

Antworte FINAL mit reinem JSON in einem Code-Block:
```json
{"befunde": [...]}
```
Wenn keine Befunde: {"befunde": []}.

Wichtig: erfinde keine Paragraphen. Wenn du keine passende Vorgabe in der
Richtlinie findest, melde KEIN Verstoss (nur ein hinweis mit niedriger Konfidenz
oder gar nichts).
"""


TOOLS = [
    {
        "name": "list_sections",
        "description": "Direkte Kinder einer Section auflisten (id/title/path/level). Start mit parent_id='root'.",
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
        "description": "Volltextsuche im Tree (case-insensitive). Liefert bis max_results Treffer mit content-Vorschau (200 Zeichen).",
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


async def _run_claude_loop(tree: dict, antrag: dict, model: str) -> dict[str, Any]:
    """Tool-Use-Loop bis Claude eine final-message mit JSON liefert.
    Max 15 Tool-Iterationen als Safety-Bound (typisch werden 3-7 reichen)."""
    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages: list[dict] = [
        {
            "role": "user",
            "content": (
                "Antrag-Payload:\n```json\n"
                + json.dumps(antrag, indent=2, ensure_ascii=False)
                + "\n```\n\nBitte prüfe diesen Antrag gegen die AHP-Richtlinie."
            ),
        },
    ]

    for _ in range(15):
        resp = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )
        if resp.stop_reason == "tool_use":
            tool_uses = [b for b in resp.content if b.type == "tool_use"]
            messages.append({"role": "assistant", "content": resp.content})
            tool_results: list[dict] = []
            for tu in tool_uses:
                if tu.name == "list_sections":
                    result = list_sections(tree, tu.input["parent_id"])
                elif tu.name == "get_section":
                    result = get_section(tree, tu.input["section_id"]) or {}
                elif tu.name == "search":
                    result = search_tree(tree, tu.input["query"], tu.input.get("max_results", 5))
                else:
                    result = {"error": f"unknown tool {tu.name}"}
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })
            messages.append({"role": "user", "content": tool_results})
            continue

        # Final response — extract JSON
        text = "".join(b.text for b in resp.content if b.type == "text")
        m = re.search(r"\{[\s\S]*\}", text)
        if m is None:
            return {"befunde": []}
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return {"befunde": []}

    return {"befunde": []}


async def check_rag(tree: dict, antrag: dict, model: str = "claude-sonnet-4-5") -> list[Befund]:
    """Layer-C-Eintrittspunkt. Returnt list[Befund] mit layer='C'."""
    raw = await _run_claude_loop(tree, antrag, model)
    out: list[Befund] = []
    for r in raw.get("befunde", []):
        out.append(Befund(
            schwere=r.get("schwere", "hinweis"),
            layer="C",
            feld=r.get("feld"),
            beschreibung=r.get("beschreibung", ""),
            zitat=r.get("zitat"),
            section_path=r.get("section_path"),
            konfidenz=r.get("konfidenz"),
        ))
    return out
