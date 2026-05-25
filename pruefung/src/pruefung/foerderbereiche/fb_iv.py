"""Plugin für FB IV — Struktur- und Schwerpunktförderung (formlos).

Pflichtfelder kombinieren apl.antraege (gemeinsamer Block, Migration 060)
mit apl.fb_iv_freitext (Migration 061). beantragte_summe_euro ist optional
— bei FB IV ist die Förderhöhe individuell auszuhandeln.
"""
from __future__ import annotations

from typing import Any

from ._common import (
    filter_norm_statements_for_fb,
    norm_statements_to_prompt_block,
    parse_ki_json_or_fallback,
    render_bescheid_template,
)


class FbIvPlugin:
    fb_id = "IV"
    label = "Struktur- und Schwerpunktförderung"

    def get_pflicht_felder(self) -> list[str]:
        """NOT-NULL-Felder aus apl.antraege + apl.fb_iv_freitext."""
        return [
            # apl.antraege
            "einrichtung", "ansprechpartner", "strasse", "plz", "ort",
            "telefon", "email", "bankname", "iban", "bic",
            "haushaltsjahr",
            # apl.fb_iv_freitext
            "vorhaben_titel",
            "kurzbeschreibung",
            "geplante_massnahmen",
        ]

    def baue_subsumtions_prompt(
        self,
        antrag: dict[str, Any],
        norm_statements: list[dict[str, Any]],
    ) -> str:
        relevante = filter_norm_statements_for_fb(norm_statements, self.fb_id)
        norm_block = norm_statements_to_prompt_block(relevante)
        return (
            "Du subsumierst einen Antrag nach AHP Würzburg, Förderbereich IV "
            "(Struktur- und Schwerpunktförderung, formlose Antragstellung).\n\n"
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
            "- Keine § erfinden, keine Förderhöhen halluzinieren. FB IV ist "
            "individuell — wenn die Norm-Statements keine konkrete Höhe nennen, "
            "schreib das in die Begründung statt eine Zahl zu nennen.\n"
            "- Bei unklarem Vorhaben: entscheidung='rueckfragen'."
        )

    def post_process_kibescheid(self, raw: str) -> dict[str, Any]:
        return parse_ki_json_or_fallback(raw)

    def render_bescheid_template(
        self,
        antrag: dict[str, Any],
        ki_result: dict[str, Any],
    ) -> str:
        return render_bescheid_template(
            "bescheid_fb_iv.html.j2", antrag, ki_result,
        )
