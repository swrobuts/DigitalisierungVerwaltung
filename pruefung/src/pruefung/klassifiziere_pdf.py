"""Klassifiziert ein hochgeladenes PDF in einen Förderbereich + Variante.

Aufruf vom UE3-Smart-Upload: Bürger lädt PDF, Backend erkennt den FB,
gibt Vorschlag zurück. Bürger kann korrigieren bevor der Antrag gespeichert wird.

Halluzinations-Schutz: der vom LLM gelieferte FB wird HART gegen die
bekannten Plugin-IDs validiert. Liefert das LLM was Unbekanntes, geben
wir `fb=None, konfidenz=0.0` zurück — nie raten.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any


# Definitiv kein Halluzinations-Spielraum — wir prüfen den Output gegen
# unsere bekannten Plugin-IDs (matched mit foerderbereiche.PLUGINS).
ALLOWED_FBS: set[str] = {"I", "II", "III", "IV"}
ALLOWED_VARIANTEN: set[str] = {"A", "B", "C", "D"}

KLASSIFIZIERUNGS_PROMPT = """\
Du analysierst eine Seite aus einem Antrag der Stadt Würzburg
(AHP — Altenhilfe-Förderrichtlinie 2025).

Erkenne den Förderbereich (FB I, II, III oder IV) anhand:
- Überschrift (z.B. "Antrag AHP III" oder "Förderung des bürgerschaftlichen Engagements")
- Pflichtfelder (FB II hat Helferliste, FB III hat Varianten-Auswahl A/B/C/D)
- Beleg-Struktur

Antwort als JSON:
{
  "fb": "I" | "II" | "III" | "IV",
  "variante": "A" | "B" | "C" | "D" | null,   // nur wenn FB III erkannt
  "konfidenz": 0.0 - 1.0,
  "begruendung": "kurze textuelle Erklärung"
}

Wenn unsicher: "fb": null, "konfidenz" < 0.5. KEIN Erraten.
"""


def _empty_result(begruendung: str) -> dict[str, Any]:
    return {
        "fb": None,
        "variante": None,
        "konfidenz": 0.0,
        "begruendung": begruendung[:500],
    }


async def klassifiziere(
    pdf_bytes: bytes,
    *,
    anthropic_client: Any | None = None,
    model: str = "claude-sonnet-4-5",
) -> dict[str, Any]:
    """Returnt {fb, variante, konfidenz, begruendung}.

    fb-Wert IST validiert — wenn das LLM was Unbekanntes liefert, wird
    `fb` auf None gesetzt und konfidenz auf 0.0 geclamped.
    """
    if anthropic_client is None:
        from anthropic import AsyncAnthropic
        anthropic_client = AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"],
        )

    pdf_b64 = base64.b64encode(pdf_bytes).decode()

    response = await anthropic_client.messages.create(
        model=model,
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": pdf_b64,
                    },
                },
                {"type": "text", "text": KLASSIFIZIERUNGS_PROMPT},
            ],
        }],
    )

    # Robust gegen Markdown-Fences ('```json ... ```')
    raw = response.content[0].text if response.content else ""
    raw_clean = raw.replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(raw_clean)
    except json.JSONDecodeError:
        return _empty_result(f"JSON-Parse fehlgeschlagen: {raw[:200]}")

    if not isinstance(result, dict):
        return _empty_result(f"Unerwartetes Top-Level-Format: {type(result).__name__}")

    # Halluzinations-Schutz: validiere den FB-Wert
    fb = result.get("fb")
    if fb not in ALLOWED_FBS:
        return _empty_result(
            f"LLM lieferte unbekannten FB {fb!r} — nicht in {sorted(ALLOWED_FBS)}",
        )

    # Variante nur bei FB III erlaubt
    variante = result.get("variante")
    if fb != "III":
        variante = None
    elif variante not in ALLOWED_VARIANTEN:
        variante = None

    konfidenz_raw = result.get("konfidenz", 0.0)
    try:
        konfidenz = max(0.0, min(1.0, float(konfidenz_raw)))
    except (TypeError, ValueError):
        konfidenz = 0.0

    return {
        "fb": fb,
        "variante": variante,
        "konfidenz": konfidenz,
        "begruendung": str(result.get("begruendung", ""))[:500],
    }
