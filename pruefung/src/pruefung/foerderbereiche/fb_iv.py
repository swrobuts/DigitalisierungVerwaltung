"""Plugin für FB IV — Struktur- und Schwerpunktförderung (formlos).

Stadt Würzburg sagt „FB IV: Formlos" (siehe https://www.wuerzburg.de/
themen/gesundheit-soziales/senioren/antragswesen/index.html, Stand
2026-05-26) — es gibt KEIN offizielles Antragsformular-PDF.

Pflicht ist deshalb nur das hochgeladene PDF (apl.fb_iv_freitext.
dokument_path, Migration 071). Vorhaben-Titel, Kurzbeschreibung und alle
weiteren Freitext-Felder sind optionale KI-Klassifikations-Hilfen — die
alten Strict-Checks darauf waren eine Erfindung der ersten
Implementierung und verletzen den Halluzinations-Schutz (siehe
docs/PDF-FELDER-AUDIT-2026-05-26.md).

Ein Cap-Check auf beantragte_summe_euro entfällt: die Website der Stadt
Würzburg nennt KEINEN FB-IV-spezifischen Förder-Cap; bei FB IV ist die
Förderhöhe individuell auszuhandeln.
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
        """Pflichtfelder bei FB IV.

        Aus apl.antraege bleibt der gemeinsame Antragsteller-Block Pflicht
        (einrichtung, ansprechpartner, Adresse, Bank, Haushaltsjahr).
        Aus apl.fb_iv_freitext ist nach Migration 071 nur noch
        `dokument_path` strukturell verpflichtend — der formlose PDF-
        Antrag, den der Bürger selbst verfasst und hochlädt.

        vorhaben_titel/kurzbeschreibung sind explizit KEINE Pflichtfelder
        mehr; geplante_massnahmen/beantragte_summe_euro/laufzeit waren
        ohnehin Erfindungen und werden hier ebenfalls nicht mehr gefordert.
        """
        return [
            # apl.antraege
            "einrichtung", "ansprechpartner", "strasse", "plz", "ort",
            "telefon", "email", "bankname", "iban", "bic",
            "haushaltsjahr",
            # apl.fb_iv_freitext (formloser Antrag)
            "dokument_path",
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
            "(Struktur- und Schwerpunktförderung, FORMLOSE Antragstellung — "
            "es gibt kein offizielles PDF-Formular der Stadt Würzburg).\n\n"
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
            "- Wenn das Pflicht-PDF (dokument_path) fehlt: "
            "entscheidung='rueckfragen' mit Hinweis auf die fehlende Anlage.\n"
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
