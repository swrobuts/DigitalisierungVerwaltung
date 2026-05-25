"""OCR-basierte Extraktion einer FB-II-Helferliste (PDF) zu apl.fb_ii_helfer-Format.

Bürger lädt Helferliste hoch → Backend extrahiert via Claude Vision →
returnt list[FbIiHelfer]-Dicts → UE1/UE3 kann vor Speichern editieren.

Halluzinations-Schutz: wir filtern Helfer-Einträge ohne name/vorname raus.
Bei nicht-parsbarem JSON returnen wir eine leere Liste, statt zu raten.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any


EXTRACT_PROMPT = """\
Du extrahierst eine Helferliste aus dem Anhang zum FB-II-Antrag der Stadt Würzburg.
Die Tabelle hat Spalten: Position, Name, Vorname, Einsatzbereich, Eintritt,
Austritt, Stunden/Monat, Stunden/Jahr.

Returne ein JSON-Array, ein Objekt pro Helfer:
[
  {
    "position": 1,
    "name": "Müller",
    "vorname": "Anna",
    "einsatzbereich": "Wohnbereich Süd",
    "eintritt": "2018-03-01",
    "austritt": null,
    "stunden_monat": 12.0,
    "stunden_jahr": 144.0
  }
]

WICHTIG:
- Keine erfundenen Helfer. Wenn unleserlich: gib nur die lesbaren zurück.
- Datums-Format: YYYY-MM-DD, sonst null.
- Stunden als Zahl, leere Felder als null.
"""


def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def extrahiere_helferliste(
    pdf_bytes: bytes,
    *,
    anthropic_client: Any | None = None,
    model: str = "claude-sonnet-4-5",
) -> list[dict[str, Any]]:
    """Extrahiert Helfer-Einträge aus einer PDF.

    Returnt list[dict] mit Schema kompatibel zu apl.fb_ii_helfer:
        {position, name, vorname, einsatzbereich, eintritt, austritt,
         stunden_monat, stunden_jahr}
    Einträge ohne Name/Vorname werden gefiltert (Halluzinations-Schutz).
    """
    if anthropic_client is None:
        from anthropic import AsyncAnthropic
        anthropic_client = AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"],
        )

    pdf_b64 = base64.b64encode(pdf_bytes).decode()
    response = await anthropic_client.messages.create(
        model=model,
        max_tokens=4096,
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
                {"type": "text", "text": EXTRACT_PROMPT},
            ],
        }],
    )

    raw = response.content[0].text if response.content else ""
    raw_clean = raw.replace("```json", "").replace("```", "").strip()
    try:
        helfer = json.loads(raw_clean)
    except json.JSONDecodeError:
        return []
    if not isinstance(helfer, list):
        return []

    out: list[dict[str, Any]] = []
    for i, h in enumerate(helfer):
        if not isinstance(h, dict):
            continue
        name = str(h.get("name") or "").strip()
        vorname = str(h.get("vorname") or "").strip()
        if not name or not vorname:
            # Pflichtfelder fehlen → eintrag verwerfen (Halluzinations-Schutz)
            continue
        try:
            position = int(h.get("position") or (i + 1))
        except (TypeError, ValueError):
            position = i + 1
        out.append({
            "position": position,
            "name": name,
            "vorname": vorname,
            "einsatzbereich": (h.get("einsatzbereich") or None),
            "eintritt": h.get("eintritt") or None,
            "austritt": h.get("austritt") or None,
            "stunden_monat": _coerce_float(h.get("stunden_monat")),
            "stunden_jahr": _coerce_float(h.get("stunden_jahr")),
        })
    return out
