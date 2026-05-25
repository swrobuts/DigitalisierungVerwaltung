"""Plugin für FB III — Förderung von Treffpunkten/Begegnungsstätten/Quartiersmanagement.

FB III hat 4 Varianten (A/B/C/D) mit unterschiedlichen Pflichtfeldern und
Höchstgrenzen. Die Pflichtfeld-Liste dispatcht intern nach Variante.

Höchstgrenzen (aus AHP-Richtlinie / Migration 063):
- A (Mehrgenerationenhaus):       10.000 €/Jahr
- B (Begegnungszentrum):          10.000 €/Jahr
- C (Seniorenkreis Treffen-Staffel): 750 / 1.250 / 2.000 €/Jahr
- D (Quartiersmanagement):         7.500 €/Jahr
"""
from __future__ import annotations

from typing import Any

from ._common import (
    filter_norm_statements_for_fb,
    norm_statements_to_prompt_block,
    parse_ki_json_or_fallback,
    render_bescheid_template,
)


# Höchstgrenzen pro Variante in EUR/Jahr.
# Variante C hängt von der Treffen-Schwelle ab (siehe HOECHSTGRENZE_C_BY_STAFFEL).
HOECHSTGRENZE_BY_VARIANTE: dict[str, int] = {
    "A": 10000,
    "B": 10000,
    "C": 2000,   # Maximum von C (≥40 Treffen)
    "D": 7500,
}

HOECHSTGRENZE_C_BY_STAFFEL: dict[str, int] = {
    "GT_10":  750,
    "GT_20": 1250,
    "GT_40": 2000,
}


class FbIiiPlugin:
    fb_id = "III"
    label = "Treffpunkte, Begegnungsstätten, Quartiersmanagement"

    def get_pflicht_felder(self, variante: str | None = None) -> list[str]:
        """Pflichtfelder pro Variante.

        Args:
            variante: 'A' | 'B' | 'C' | 'D' | None (None = Basis-Set ohne
                Varianten-Spezifika; brauchbar wenn variante noch unbekannt ist).
        """
        basis = [
            # apl.antraege
            "einrichtung", "ansprechpartner", "strasse", "plz", "ort",
            "telefon", "email", "bankname", "iban", "bic",
            "haushaltsjahr",
            # apl.fb_iii_variante — Pflichtfeld immer
            "variante",
        ]
        return basis + self._get_variante_pflichtfelder(variante)

    def _get_variante_pflichtfelder(self, variante: str | None) -> list[str]:
        if variante is None:
            return []
        if variante == "A":
            # MGH — Bestätigung Bundesprogramm ist Anlage, kein DB-Feld;
            # a_anmerkung ist optional. Pflicht: anlage_foerderbestaetigung_bund
            return ["anlage_foerderbestaetigung_bund"]
        if variante == "B":
            return [
                "b_anzahl_veranstaltungen",
                "b_teilnehmer_senioren",
            ]
        if variante == "C":
            return [
                "c_treffen_schwelle",
                "c_teilnehmer_durchschnitt",
            ]
        if variante == "D":
            return [
                "d_hauptamt_name",
                "d_hauptamt_stunden_woche",
            ]
        # Unbekannte Variante: kein zusätzliches Pflichtfeld (Validator wird
        # ohnehin auf das DB-Enum-Constraint laufen)
        return []

    def get_hoechstgrenze(
        self, variante: str | None, treffen_schwelle: str | None = None,
    ) -> int | None:
        """Höchstgrenze in EUR/Jahr für die Variante.

        Bei Variante C wird treffen_schwelle berücksichtigt (GT_10/GT_20/GT_40).
        """
        if variante is None:
            return None
        if variante == "C":
            if treffen_schwelle in HOECHSTGRENZE_C_BY_STAFFEL:
                return HOECHSTGRENZE_C_BY_STAFFEL[treffen_schwelle]
            # Schwelle unbekannt → konservative Untergrenze
            return min(HOECHSTGRENZE_C_BY_STAFFEL.values())
        return HOECHSTGRENZE_BY_VARIANTE.get(variante)

    def baue_subsumtions_prompt(
        self,
        antrag: dict[str, Any],
        norm_statements: list[dict[str, Any]],
    ) -> str:
        relevante = filter_norm_statements_for_fb(norm_statements, self.fb_id)
        # Wenn Variante bekannt: zusätzlich nach fb_iii_variante filtern
        variante = antrag.get("variante")
        if variante:
            relevante = [
                s for s in relevante
                if s.get("fb_iii_variante") in (variante, None)
            ]
        norm_block = norm_statements_to_prompt_block(relevante)
        hoechst = self.get_hoechstgrenze(variante, antrag.get("c_treffen_schwelle"))
        hoechst_hinweis = (
            f"Förderhöchstgrenze für Variante {variante}: {hoechst} €/Jahr"
            if hoechst is not None else
            "Förderhöchstgrenze: variante unbekannt — bitte erst klären"
        )
        return (
            "Du subsumierst einen Antrag nach AHP Würzburg, Förderbereich III "
            "(Treffpunkte / Begegnungsstätten / Quartiersmanagement).\n\n"
            f"Norm-Statements (Quellen-gepinnt, NUR diese sind erlaubt):\n{norm_block}\n\n"
            f"Antrag: {antrag}\n"
            f"{hoechst_hinweis}\n\n"
            "Erzeuge ein JSON-Objekt mit den Schlüsseln:\n"
            "  entscheidung: 'bewilligen' | 'ablehnen' | 'rueckfragen' | 'unklar'\n"
            "  begruendung: kurzer Fließtext (max 5 Sätze), nur basierend auf "
            "den Norm-Statements oben\n"
            "  zitate: Liste von {ref, woertliches_zitat} — JEDE ref MUSS oben "
            "in den Norm-Statements vorkommen\n\n"
            "WICHTIG (Halluzinations-Schutz):\n"
            "- Du darfst NUR § aus den oben gelisteten Norm-Statements zitieren.\n"
            "- Keine § erfinden, keine Höchstgrenzen halluzinieren — nimm "
            "ausschließlich den oben angegebenen Betrag.\n"
            "- Bei fehlenden Pflichtfeldern: entscheidung='rueckfragen'."
        )

    def post_process_kibescheid(self, raw: str) -> dict[str, Any]:
        return parse_ki_json_or_fallback(raw)

    def render_bescheid_template(
        self,
        antrag: dict[str, Any],
        ki_result: dict[str, Any],
    ) -> str:
        return render_bescheid_template(
            "bescheid_fb_iii.html.j2", antrag, ki_result,
        )
