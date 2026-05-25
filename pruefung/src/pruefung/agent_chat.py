"""UE4 — Sozialamt-Assistent (agentisches Antragsformular, Reifegradstufe 4).

Konversations-Loop mit Anthropic Tool-Use. Der Agent
1. klassifiziert den Förderbereich aus Freitext,
2. fragt nacheinander die Pflichtfelder ab,
3. validiert Eingaben (E-Mail, IBAN, PLZ etc.),
4. submittet den fertigen Antrag.

Halluzinations-Schutz (oberste Priorität, nicht-verhandelbar):
- Der System-Prompt schreibt 5 harte Regeln vor (siehe SYSTEM_PROMPT).
- Tool-Outputs werden HART validiert (kein Pass-Through für erfundene
  FBs/Felder).
- Wenn der User nach Förderhöhe/§/Rechtsgrundlage fragt, weicht der Agent
  bewusst aus (das steht im Bescheid, nicht im Chat).
"""
from __future__ import annotations

import json
import os
from typing import Any

from .agent_tools import (
    ALLOWED_FBS,
    FB_BESCHREIBUNGEN,
    FB_III_VARIANTEN_BESCHREIBUNGEN,
    tool_get_pflichtfelder,
    tool_klassifiziere_foerderbereich,
    tool_submit_antrag,
    tool_validate_field,
)


SYSTEM_PROMPT = """\
Du bist „Anna", der digitale Sozialamt-Assistent der Stadt Würzburg.
Du hilfst **gemeinnützigen Trägern** (Wohlfahrtsverbände, Pfarreien,
eingetragene Vereine, Mehrgenerationenhäuser), Anträge nach der Würzburger
Altenhilfe-Förderrichtlinie 2025 (AHP) auszufüllen und einzureichen.

WAS DIE AHP IST (lies das, bevor du irgendetwas sagst):
Die AHP ist eine TRÄGER-Förderung — nicht Bürger-Einzelförderung. Es geht
NICHT um Wohnungsumbau, technische Hilfsmittel, Pflegegeld oder
individuelle Leistungen. Es geht um Strukturen und Angebote der Altenhilfe:

- **Förderbereich I — „Aufbau"**: Anschubfinanzierung für NEUE
  niedrigschwellige Angebote oder neue Engagement-Strukturen
  (Beispiele: neues Nachbarschaftscafé, neuer Besuchsdienst).
- **Förderbereich II — „Engagement"**: Pauschale Förderung von
  bürgerschaftlichem Engagement (Helferkreise, Besuchsdienste,
  Nachbarschaftshilfen). Pflicht: Helferliste mit Stunden.
- **Förderbereich III — „Bewährte Strukturen"**: laufende Förderung
  etablierter Strukturen — vier Varianten:
    A) Mehrgenerationenhaus (Bundesprogramm-Bestätigung nötig)
    B) Begegnungszentrum oder Bildungsträger
    C) Seniorenkreis/Seniorentreffen (Treffen-Staffel ≥10/≥20/≥40)
    D) Quartiersmanagement
- **Förderbereich IV — „Schwerpunkt"**: individuelle Vorhaben außerhalb
  der Standard-FBs (strukturierter Antrag mit Leitfragen).

Antragsteller sind IMMER Organisationen, nie Einzelpersonen.
Wenn jemand fragt „Wer ist antragsberechtigt?": „Gemeinnützige Träger
der Seniorenarbeit in Würzburg." Privatpersonen leite freundlich an die
Würzburger Sozialberatung weiter (Tel. 0931 37-0).

HARTE REGELN (NICHT verhandelbar):
1. Du darfst NUR die Förderbereiche I, II, III, IV nennen. Keine erfundenen
   FBs. Wenn dir das Tool keinen FB liefert (fb=null), erkläre, dass du
   unsicher bist, und bitte um eine genauere Beschreibung.
2. Du darfst NUR die Pflichtfelder abfragen, die `get_pflichtfelder()` für
   den gewählten FB zurückliefert. KEINE Felder erfinden.
3. Du darfst KEINE konkreten Förderhöhen oder Euro-Beträge nennen — die
   Höhe wird in der Sachbearbeitung anhand der Richtlinie berechnet und
   steht erst im Bescheid. Wenn der User danach fragt: „Die genaue Höhe
   richtet sich nach der AHP-Richtlinie und wird Ihnen im Bescheid
   mitgeteilt."
4. Du darfst KEINE Paragraphen (§) zitieren. Wenn der User nach
   Rechtsgrundlage fragt: „Die Rechtsgrundlage und alle Zitate stehen
   im späteren Bescheid."
5. Sei freundlich, klar, zurückhaltend. Frage IMMER nur EIN Feld auf
   einmal. Antworte auf Deutsch, gendergerecht.

ABLAUF:
- Beim allerersten User-Beitrag: rufe `klassifiziere_foerderbereich` auf.
  Wenn das Tool einen FB mit Konfidenz ≥ 0.5 liefert, bestätige ihn
  freundlich beim User („Verstanden — das klingt nach FB X. Stimmt das?").
- Sobald der FB bestätigt ist (oder du dir aus dem Kontext sicher bist),
  rufe `get_pflichtfelder` auf, um die nächste Frage zu kennen.
- Für jedes Pflichtfeld: stelle EINE freundliche Frage. Wenn der User
  antwortet, rufe `validate_field` auf. Bei Fehler: nett erklären und
  nochmal fragen.
- Wenn alle Pflichtfelder gefüllt sind: fasse den Antrag zusammen und
  frage explizit nach Bestätigung („Soll ich den Antrag jetzt für Sie
  einreichen?"). Erst NACH der Bestätigung `submit_antrag` aufrufen.
- Nach Submit: nenne die Antragsnummer und die nächsten Schritte
  („Sie erhalten eine Eingangsbestätigung per E-Mail, die
  Sachbearbeitung meldet sich i.d.R. innerhalb von 4 Wochen.").

WENN DAS THEMA NICHT PASST:
- KFZ-Förderung, Bau-Anträge, BAföG, Wohngeld etc. sind KEINE AHP-Themen.
- Erkläre höflich, dass du nur für die Altenhilfe-Förderung zuständig
  bist, und nenne als Alternative die zentrale Beratung (0931 37 0).
- NIEMALS einen passenden FB erfinden.
"""


# ── Tool-Schemas (Anthropic Tool-Use Format) ─────────────────────────


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "klassifiziere_foerderbereich",
        "description": (
            "Klassifiziert eine Antrags-Beschreibung in einen "
            "AHP-Förderbereich (I/II/III/IV). Returnt fb, variante "
            "(nur bei FB III), konfidenz, begruendung."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "beschreibung": {
                    "type": "string",
                    "description": "Was der Bürger fördern lassen möchte (Freitext).",
                },
            },
            "required": ["beschreibung"],
        },
    },
    {
        "name": "get_pflichtfelder",
        "description": (
            "Liefert die Pflichtfeld-Liste für den gegebenen FB (+ FB-III-Variante). "
            "Returnt felder_mit_labels mit menschlich-lesbaren Labels und Beispielen."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "fb": {
                    "type": "string", "enum": ["I", "II", "III", "IV"],
                    "description": "Förderbereich.",
                },
                "variante": {
                    "type": ["string", "null"],
                    "enum": ["A", "B", "C", "D", None],
                    "description": "FB-III-Variante, sonst null.",
                },
            },
            "required": ["fb"],
        },
    },
    {
        "name": "validate_field",
        "description": (
            "Validiert einen Wert für ein bestimmtes Pflichtfeld "
            "(Email, IBAN, PLZ, Zahl-Felder, FB-III-Variante etc.). "
            "Returnt {ok, fehler}."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "field_name": {"type": "string"},
                "value": {"type": "string"},
            },
            "required": ["field_name", "value"],
        },
    },
    {
        "name": "submit_antrag",
        "description": (
            "Reicht den fertigen Antrag ein. NUR aufrufen, NACHDEM der User "
            "den Antrag in seiner Gesamtheit bestätigt hat. Returnt "
            "antrag_id, antragsnummer, status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "draft": {
                    "type": "object",
                    "description": (
                        "Antrags-Draft mit foerderbereich, antragsteller, "
                        "fb_specific."
                    ),
                },
            },
            "required": ["draft"],
        },
    },
]


# ── Dispatcher ───────────────────────────────────────────────────────


async def _dispatch_tool(
    name: str, input_: dict[str, Any], *,
    db: Any | None = None,
    anthropic_client: Any | None = None,
) -> dict[str, Any]:
    """Routet Tool-Calls auf die Implementierungen in agent_tools.py.

    Wirft NIE — Fehler werden als Tool-Ergebnis durchgereicht, damit das
    LLM darauf reagieren kann (z.B. Höflich umformulieren).
    """
    if name == "klassifiziere_foerderbereich":
        try:
            return await tool_klassifiziere_foerderbereich(
                input_.get("beschreibung", ""),
                anthropic_client=anthropic_client,
            )
        except Exception as e:  # noqa: BLE001
            return {
                "fb": None, "variante": None, "konfidenz": 0.0,
                "begruendung": f"Klassifikation fehlgeschlagen: {e!r}"[:300],
            }
    if name == "get_pflichtfelder":
        return tool_get_pflichtfelder(
            input_.get("fb"), input_.get("variante"),
        )
    if name == "validate_field":
        return tool_validate_field(
            input_.get("field_name", ""),
            input_.get("value", ""),
        )
    if name == "submit_antrag":
        return await tool_submit_antrag(
            input_.get("draft", {}), db=db,
        )
    return {"fehler": f"Unbekanntes Tool: {name}"}


def _serialize_messages(
    history: list[dict[str, Any]], user_message: str,
) -> list[dict[str, Any]]:
    """Konvertiert das Chat-Log-Format des Frontends in Anthropic-Messages.

    Frontend-Format: [{role, content, timestamp}, ...]
    Anthropic-Format: [{role, content: str | [{type, text, ...}]}]
    System-Role wird aus dem Frontend-Log gestrippt (System-Prompt ist
    backend-seitig fest).
    """
    out: list[dict[str, Any]] = []
    for m in history:
        if m.get("role") not in ("user", "assistant"):
            continue
        content = m.get("content")
        if not content:
            continue
        out.append({"role": m["role"], "content": content})
    # Aktuelle User-Message anhängen
    if user_message:
        out.append({"role": "user", "content": user_message})
    return out


def _flatten_assistant_text(content_blocks: list[Any]) -> str:
    """Sammelt alle text-Blöcke einer Assistant-Response zu einem String."""
    parts: list[str] = []
    for b in content_blocks:
        if isinstance(b, dict):
            if b.get("type") == "text":
                parts.append(b.get("text", ""))
        else:
            # SDK-Objekt mit .type-/.text-Attribut
            if getattr(b, "type", None) == "text":
                parts.append(getattr(b, "text", ""))
    return "\n".join(p for p in parts if p).strip()


def _extract_tool_uses(content_blocks: list[Any]) -> list[dict[str, Any]]:
    """Zieht alle tool_use-Blöcke aus einer Assistant-Response."""
    out: list[dict[str, Any]] = []
    for b in content_blocks:
        if isinstance(b, dict):
            if b.get("type") == "tool_use":
                out.append({
                    "id": b.get("id"),
                    "name": b.get("name"),
                    "input": b.get("input", {}),
                })
        else:
            if getattr(b, "type", None) == "tool_use":
                out.append({
                    "id": getattr(b, "id", None),
                    "name": getattr(b, "name", None),
                    "input": getattr(b, "input", {}) or {},
                })
    return out


def _content_blocks_for_history(content_blocks: list[Any]) -> list[dict[str, Any]]:
    """Konvertiert SDK-Content-Blocks in Plain-Dicts (für Re-Send)."""
    out: list[dict[str, Any]] = []
    for b in content_blocks:
        if isinstance(b, dict):
            out.append(b)
            continue
        t = getattr(b, "type", None)
        if t == "text":
            out.append({"type": "text", "text": getattr(b, "text", "")})
        elif t == "tool_use":
            out.append({
                "type": "tool_use",
                "id": getattr(b, "id", None),
                "name": getattr(b, "name", None),
                "input": getattr(b, "input", {}) or {},
            })
    return out


def _merge_tool_results_into_draft(
    draft: dict[str, Any],
    tool_calls: list[dict[str, Any]],
    tool_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Aktualisiert den Draft serverseitig basierend auf Tool-Outputs.

    Das macht den Draft robust gegen halluzinierte Werte: selbst wenn das
    LLM beim Render der Antwort schummeln würde, basiert die UI-Vorschau
    auf den TATSÄCHLICHEN Tool-Returnwerten.
    """
    updated = dict(draft)
    for call, res in zip(tool_calls, tool_results):
        if not isinstance(res, dict):
            continue
        name = call.get("name")
        if name == "klassifiziere_foerderbereich":
            fb = res.get("fb")
            variante = res.get("variante")
            konfidenz = res.get("konfidenz", 0.0)
            # Nur übernehmen wenn Konfidenz ausreichend hoch ist UND der
            # User noch keinen FB gesetzt hat (sonst überschreiben wir
            # eine bewusste User-Wahl).
            if fb in ALLOWED_FBS and konfidenz >= 0.5 and not updated.get("foerderbereich"):
                updated["foerderbereich"] = fb
                if variante:
                    updated["fb_iii_variante"] = variante
        elif name == "submit_antrag":
            if res.get("antrag_id"):
                updated["antrag_id"] = res["antrag_id"]
                updated["antragsnummer"] = res.get("antragsnummer")
                updated["status"] = "submitted"
    return updated


# ── Main Entry-Point ─────────────────────────────────────────────────


async def run_agent_turn(
    *,
    history: list[dict[str, Any]],
    user_message: str,
    current_draft: dict[str, Any] | None = None,
    db: Any | None = None,
    anthropic_client: Any | None = None,
    model: str = "claude-sonnet-4-5",
    max_tool_iters: int = 5,
) -> dict[str, Any]:
    """Führt EINEN konversationellen Turn aus und returnt das Ergebnis.

    Args:
        history: Bisherige Messages im Frontend-Format
                 [{role, content, timestamp}, ...].
        user_message: Neue Nachricht vom User.
        current_draft: Bisheriger Antrags-Draft (FB, Antragsteller, ...).
        db: SupabaseClient (für submit_antrag). None = Dry-Run.
        anthropic_client: AsyncAnthropic-Instanz (für Tests Mock injizieren).
        model: Claude-Modell.
        max_tool_iters: Sicherheitslimit für Tool-Loop.

    Returns:
        {
            assistant_message: str,           # Text, der dem User angezeigt wird
            updated_draft: dict,              # Neuer Draft-Stand
            next_action: str,                 # Hint für die UI
            tool_trace: [{name, input, output}],  # Debug-/Transparenz
        }
    """
    if anthropic_client is None:
        from anthropic import AsyncAnthropic
        anthropic_client = AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"],
        )

    messages = _serialize_messages(history, user_message)
    draft = dict(current_draft or {})
    tool_trace: list[dict[str, Any]] = []

    for _iter in range(max_tool_iters):
        response = await anthropic_client.messages.create(
            model=model,
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS,
            messages=messages,
        )

        content_blocks = response.content if response.content else []
        tool_uses = _extract_tool_uses(content_blocks)
        assistant_text = _flatten_assistant_text(content_blocks)
        stop_reason = getattr(response, "stop_reason", None)

        # Stop-Bedingung 1: kein Tool-Use mehr → fertig
        if not tool_uses:
            updated_draft = draft
            next_action = _infer_next_action(updated_draft, assistant_text)
            return {
                "assistant_message": assistant_text
                    or "Ich konnte gerade nicht antworten — versuchen Sie es bitte noch einmal.",
                "updated_draft": updated_draft,
                "next_action": next_action,
                "tool_trace": tool_trace,
            }

        # Stop-Bedingung 2: Tool-Use → ausführen und in History anhängen
        # Erst die Assistant-Response (mit tool_use-Blocks) anhängen
        messages.append({
            "role": "assistant",
            "content": _content_blocks_for_history(content_blocks),
        })
        # Dann die Tool-Results sammeln
        tool_results_for_message: list[dict[str, Any]] = []
        tool_outputs: list[dict[str, Any]] = []
        for tc in tool_uses:
            output = await _dispatch_tool(
                tc["name"], tc["input"] or {},
                db=db, anthropic_client=anthropic_client,
            )
            tool_outputs.append(output)
            tool_results_for_message.append({
                "type": "tool_result",
                "tool_use_id": tc["id"],
                "content": json.dumps(output, ensure_ascii=False),
            })
            tool_trace.append({
                "name": tc["name"], "input": tc["input"], "output": output,
            })
        messages.append({"role": "user", "content": tool_results_for_message})
        draft = _merge_tool_results_into_draft(draft, tool_uses, tool_outputs)

        # Falls das LLM end_turn signalisiert und trotzdem noch tool_use
        # geliefert hat (sollte nicht passieren), brechen wir nach diesem
        # Loop-Durchgang ab — aber normaler Fall ist „tool_use" stop_reason.
        if stop_reason not in ("tool_use", None):
            break

    # Fallback wenn max_tool_iters überschritten
    return {
        "assistant_message": (
            "Entschuldigung, ich bin gerade in einer Endlos-Schleife geraten. "
            "Bitte starten Sie das Gespräch neu oder formulieren Sie Ihre "
            "Frage anders."
        ),
        "updated_draft": draft,
        "next_action": "error",
        "tool_trace": tool_trace,
    }


def _infer_next_action(draft: dict[str, Any], assistant_text: str) -> str:
    """Heuristische Nächste-Schritt-Markierung für die UI."""
    if draft.get("status") == "submitted":
        return "submitted"
    if not draft.get("foerderbereich"):
        return "ask_foerderbereich"
    text_lower = assistant_text.lower() if assistant_text else ""
    if any(s in text_lower for s in (
        "soll ich den antrag", "darf ich den antrag", "antrag einreichen", "bestätigen sie",
    )):
        return "ready_to_submit"
    return "ask_field"


__all__ = ["run_agent_turn", "SYSTEM_PROMPT", "TOOL_SCHEMAS"]
