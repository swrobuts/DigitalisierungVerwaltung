"""Plugin-Interface pro Förderbereich (FB I/II/III/IV).

Eine Klasse pro FB (fb_i.py / fb_ii.py / fb_iii.py / fb_iv.py).

Halluzinations-Schutz (Spec §12.1, oberste Priorität):
- baue_subsumtions_prompt darf NUR Daten aus dem Antrag UND den
  Norm-Statements (apl.ahp_norm_statements) verwenden — keine
  freien Texte, kein Web-Wissen.
- render_bescheid_template darf jedes zitierte § nur dann ausgeben,
  wenn es in apl.ahp_norm_statements existiert (Hard-Fail im
  quellen_validator.validiere_oder_abbrechen).
"""
from __future__ import annotations
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class FoerderbereichPlugin(Protocol):
    """Protocol für einen Förderbereich-Plugin.

    Attribute:
        fb_id: 'I' | 'II' | 'III' | 'IV' (matcht apl.foerderbereich_enum)
        label: Mensch-lesbarer Name (z.B. 'Aufbau niedrigschwelliger Angebote')
    """

    fb_id: str
    label: str

    def get_pflicht_felder(self) -> list[str]:
        """Liste der NOT-NULL-Felder, die für diesen FB im Antrag vorhanden
        sein müssen. Kombiniert apl.antraege (gemeinsamer Block) plus
        FB-spezifische Tabelle (apl.fb_i_projekt / fb_ii_ehrenamt / etc.).
        """
        ...

    def baue_subsumtions_prompt(
        self,
        antrag: dict[str, Any],
        norm_statements: list[dict[str, Any]],
    ) -> str:
        """Baut den LLM-Prompt für die Subsumtion.

        WICHTIG: Der Prompt darf NUR die in norm_statements gelisteten
        Quellen zur Verfügung stellen — keine freien Texte, kein Web-Wissen.
        Das LLM muss explizit angewiesen werden, NUR diese Quellen zu
        zitieren.
        """
        ...

    def post_process_kibescheid(self, raw: str) -> dict[str, Any]:
        """Wandelt die KI-Rohantwort (JSON-String oder Plain-Text) in ein
        strukturiertes Dict um. Fällt bei nicht-JSON auf einen Plain-Text-
        Fallback zurück (entscheidung='unklar')."""
        ...

    def render_bescheid_template(
        self,
        antrag: dict[str, Any],
        ki_result: dict[str, Any],
    ) -> str:
        """Rendert HTML/Markdown für PDF-Render. NICHT der finale Bescheid —
        das macht der bescheid_subsumtion-Dispatcher, der davor noch den
        quellen_validator.validiere_oder_abbrechen() gegen
        apl.ahp_norm_statements laufen lässt (Hard-Fail bei erfundenen §).
        """
        ...
