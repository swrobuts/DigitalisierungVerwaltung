"""Geteilte Helfer für FB-Plugins.

Hier liegt absichtlich KEIN domänenspezifischer Code — nur Bausteine,
die jedes Plugin gleich nutzt (Norm-Filter, JSON-Postprocess,
Template-Render-Helper).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape


def filter_norm_statements_for_fb(
    norm_statements: list[dict[str, Any]],
    fb_id: str,
) -> list[dict[str, Any]]:
    """Filter Norm-Statements auf die für `fb_id` relevanten:
    - foerderbereich == fb_id  (explizit für diesen FB)
    - foerderbereich is None    (generisch — gilt für alle)

    Sortiert nach ref für stabile Prompt-Reihenfolge.
    """
    relevante = [
        s for s in norm_statements
        if s.get("foerderbereich") in (fb_id, None)
    ]
    return sorted(relevante, key=lambda s: s.get("ref", ""))


def norm_statements_to_prompt_block(
    statements: list[dict[str, Any]],
) -> str:
    """Rendert Norm-Statements als Klartext-Block für den Prompt.

    Format pro Zeile:
        - <ref>: <kurz_aussage> (Quelle: <quelle_pdf_pfad>#S.<quelle_seite>)

    Jede Zeile enthält den Source-Pin, sodass das LLM nichts erfinden
    kann, ohne dass die Source mitgeführt würde. Der Quellen-Validator
    prüft beim Bescheid-Render zusätzlich hart gegen die DB.
    """
    if not statements:
        return "(keine Norm-Statements verfügbar)"
    return "\n".join(
        f"- {s.get('ref', '?')}: {s.get('kurz_aussage', '')} "
        f"(Quelle: {s.get('quelle_pdf_pfad', '?')}#S.{s.get('quelle_seite', '?')})"
        for s in statements
    )


def parse_ki_json_or_fallback(raw: str) -> dict[str, Any]:
    """Parst die KI-Antwort.

    Erwartet idealerweise valides JSON mit {entscheidung, begruendung, zitate}.
    Bei nicht-parsebarer Antwort: Fallback mit entscheidung='unklar' und
    Rohtext als Begründung, sodass die Sachbearbeiter:in entscheiden kann.
    """
    if not raw or not raw.strip():
        return {"entscheidung": "unklar", "begruendung": "(leere KI-Antwort)", "zitate": []}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"entscheidung": "unklar", "begruendung": raw, "zitate": []}
    # Sicherstellen, dass die Pflichtschlüssel da sind (aber Inhalt nicht erzwingen).
    data.setdefault("entscheidung", "unklar")
    data.setdefault("begruendung", "")
    data.setdefault("zitate", [])
    return data


def _templates_dir() -> Path:
    """Pfad zum Jinja-Template-Verzeichnis (pruefung/src/pruefung/templates)."""
    return Path(__file__).resolve().parent.parent / "templates"


def render_bescheid_template(
    template_name: str,
    antrag: dict[str, Any],
    ki_result: dict[str, Any],
) -> str:
    """Rendert ein Bescheid-Template mit Antrag + KI-Ergebnis.

    Args:
        template_name: Dateiname relativ zum templates/-Verzeichnis,
            z.B. 'bescheid_fb_i.html.j2'.
        antrag: Antragsdaten-Dict (mind. antragsnummer, einrichtung).
        ki_result: Dict aus parse_ki_json_or_fallback().

    Returns:
        Gerenderter HTML-String.
    """
    env = Environment(
        loader=FileSystemLoader(str(_templates_dir())),
        autoescape=select_autoescape(["html", "j2"]),
    )
    tpl = env.get_template(template_name)
    return tpl.render(antrag=antrag, ki=ki_result)
