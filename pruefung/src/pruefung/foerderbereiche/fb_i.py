"""Plugin für FB I — Aufbau niedrigschwelliger Angebote.

Pflichtfelder kombinieren apl.antraege (gemeinsamer Antragsteller-Block,
Migration 060) mit apl.fb_i_projekt (Migration 061).
"""
from __future__ import annotations

from typing import Any

from ._common import (
    filter_norm_statements_for_fb,
    norm_statements_to_prompt_block,
    parse_ki_json_or_fallback,
    render_bescheid_template,
)


class FbIPlugin:
    fb_id = "I"
    label = "Aufbau niedrigschwelliger Angebote"

    def get_pflicht_felder(self) -> list[str]:
        """NOT-NULL-Felder aus apl.antraege + apl.fb_i_projekt."""
        return [
            # apl.antraege — gemeinsamer Antragsteller-Block
            "einrichtung", "ansprechpartner", "strasse", "plz", "ort",
            "telefon", "email", "bankname", "iban", "bic",
            "haushaltsjahr",
            # apl.fb_i_projekt
            "projekt_titel",
        ]

    def baue_subsumtions_prompt(
        self,
        antrag: dict[str, Any],
        norm_statements: list[dict[str, Any]],
    ) -> str:
        """Erzeugt einen Prompt, der NUR Antragsdaten und gefilterte
        Norm-Statements verwendet (Halluzinations-Schutz)."""
        relevante = filter_norm_statements_for_fb(norm_statements, self.fb_id)
        norm_block = norm_statements_to_prompt_block(relevante)
        return (
            "Du subsumierst einen Antrag nach AHP Würzburg, Förderbereich I "
            "(Aufbau niedrigschwelliger Angebote der Altenhilfe).\n\n"
            f"Norm-Statements (Quellen-gepinnt, NUR diese sind erlaubt):\n{norm_block}\n\n"
            f"Antrag: {antrag}\n\n"
            "Erzeuge ein JSON-Objekt mit den Schlüsseln:\n"
            "  entscheidung: 'bewilligen' | 'ablehnen' | 'rueckfragen' | 'unklar'\n"
            "  begruendung: kurzer Fließtext (max 5 Sätze), nur basierend auf "
            "den Norm-Statements oben\n"
            "  zitate: Liste von {ref, woertliches_zitat} — JEDE ref MUSS oben "
            "in den Norm-Statements vorkommen\n\n"
            "WICHTIG (Halluzinations-Schutz):\n"
            "- Du darfst NUR § aus den oben gelisteten Norm-Statements zitieren.\n"
            "- Keine § erfinden. Keine Werte halluzinieren. Keine zusätzlichen "
            "Quellen, Gesetze oder Verordnungen erwähnen.\n"
            "- Wenn die Norm-Statements für die Entscheidung nicht ausreichen, "
            "setze entscheidung='rueckfragen' und nenne in begruendung, welche "
            "Information fehlt."
        )

    def post_process_kibescheid(self, raw: str) -> dict[str, Any]:
        return parse_ki_json_or_fallback(raw)

    def check_konformitaet(
        self, antrag: dict[str, Any], db: Any = None,  # noqa: ARG002
    ) -> list[Any]:
        """Keine FB-I-spezifischen Hard-Regeln in Layer B — die
        Subsumtion erledigt das LLM in Layer C / Bescheid-Pfad."""
        return []

    def render_bescheid_template(
        self,
        antrag: dict[str, Any],
        ki_result: dict[str, Any],
    ) -> str:
        return render_bescheid_template(
            "bescheid_fb_i.html.j2", antrag, ki_result,
        )
