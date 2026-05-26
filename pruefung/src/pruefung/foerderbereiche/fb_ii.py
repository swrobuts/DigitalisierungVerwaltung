"""Plugin für FB II — Pauschale Förderung von bürgerschaftlichem Engagement.

Pflichtfelder kombinieren apl.antraege (gemeinsamer Block, Migration 060)
mit apl.fb_ii_ehrenamt (Migration 061). Helferliste (apl.fb_ii_helfer)
ist 1:n und wird via get_helferliste() nachgeladen.
"""
from __future__ import annotations

from typing import Any

from ._common import (
    filter_norm_statements_for_fb,
    norm_statements_to_prompt_block,
    parse_ki_json_or_fallback,
    render_bescheid_template,
)


class FbIiPlugin:
    fb_id = "II"
    label = "Pauschale Förderung bürgerschaftlichen Engagements"

    def get_pflicht_felder(self) -> list[str]:
        """NOT-NULL-Felder aus apl.antraege + apl.fb_ii_ehrenamt."""
        return [
            # apl.antraege
            "einrichtung", "ansprechpartner", "strasse", "plz", "ort",
            "telefon", "email", "bankname", "iban", "bic",
            "haushaltsjahr",
            # apl.fb_ii_ehrenamt
            "ehrenamt_titel",
            "anzahl_helfer_vorjahr",
            "gesamt_helferstunden_vorjahr",
        ]

    async def get_helferliste(
        self, antrag_id: str, db: Any,
    ) -> list[dict[str, Any]]:
        """Lädt die zugehörige Helferliste aus apl.fb_ii_helfer.

        Args:
            antrag_id: UUID des Antrags.
            db: SupabaseClient-Instanz (pruefung.db.SupabaseClient).

        Returns:
            Liste von Helfer-Dicts, sortiert nach position.
        """
        return await db.select(
            "fb_ii_helfer",
            f"antrag_id=eq.{antrag_id}"
            "&select=position,name,vorname,einsatzbereich,"
            "eintritt,austritt,stunden_monat,stunden_jahr"
            "&order=position.asc",
        )

    def baue_subsumtions_prompt(
        self,
        antrag: dict[str, Any],
        norm_statements: list[dict[str, Any]],
    ) -> str:
        relevante = filter_norm_statements_for_fb(norm_statements, self.fb_id)
        norm_block = norm_statements_to_prompt_block(relevante)
        helfer = antrag.get("helferliste") or []
        helfer_zusammenfassung = (
            f"Helferliste: {len(helfer)} Helfer:innen erfasst" if helfer
            else "Helferliste: NICHT übermittelt (Pflicht-Anlage für FB II)"
        )
        return (
            "Du subsumierst einen Antrag nach AHP Würzburg, Förderbereich II "
            "(Pauschale Förderung bürgerschaftlichen Engagements).\n\n"
            f"Norm-Statements (Quellen-gepinnt, NUR diese sind erlaubt):\n{norm_block}\n\n"
            f"Antrag: {antrag}\n"
            f"{helfer_zusammenfassung}\n\n"
            "Erzeuge ein JSON-Objekt mit den Schlüsseln:\n"
            "  entscheidung: 'bewilligen' | 'ablehnen' | 'rueckfragen' | 'unklar'\n"
            "  begruendung: kurzer Fließtext (max 5 Sätze), nur basierend auf "
            "den Norm-Statements oben\n"
            "  zitate: Liste von {ref, woertliches_zitat} — JEDE ref MUSS oben "
            "in den Norm-Statements vorkommen\n\n"
            "WICHTIG (Halluzinations-Schutz):\n"
            "- Du darfst NUR § aus den oben gelisteten Norm-Statements zitieren.\n"
            "- Keine § erfinden, keine Werte halluzinieren, keine zusätzlichen "
            "Quellen erwähnen.\n"
            "- Wenn die Helferliste fehlt: entscheidung='rueckfragen'."
        )

    def post_process_kibescheid(self, raw: str) -> dict[str, Any]:
        return parse_ki_json_or_fallback(raw)

    def check_konformitaet(
        self, antrag: dict[str, Any], db: Any = None,  # noqa: ARG002
    ) -> list[Any]:
        """Keine FB-II-spezifischen Hard-Regeln in Layer B."""
        return []

    def render_bescheid_template(
        self,
        antrag: dict[str, Any],
        ki_result: dict[str, Any],
    ) -> str:
        return render_bescheid_template(
            "bescheid_fb_ii.html.j2", antrag, ki_result,
        )
