"""Layer B Plus — KI-Subsumtion eines Antrags gegen die kuratierten
AHP-Norm-Aussagen aus apl.ahp_norm_statements.

Halluzinations-Schutz (Robert-Regel, absolut bindend):
„Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in der
Rechtsgrundlage noch in den PDFs enthalten ist."

Konkret:
- Das LLM beurteilt nur die ihm übergebenen Norm-Aussagen.
- Erfundene `ref`-Werte (nicht in der gefilterten DB-Liste) werden vom
  Code verworfen — sie tauchen NICHT als Befund auf.
- Das `woertliches_zitat` im Befund wird aus der DB-Zeile übernommen,
  NICHT vom LLM frei generiert. Die Begründung darf das LLM formulieren
  (Subsumtion ist legitim, Zitat-Erfindung nicht).
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

from pruefung.models import Befund

logger = logging.getLogger("pruefung.norm_subsumtion")


class _LlmProtocol(Protocol):
    async def subsumiere_normstatements(
        self, prompt: str,
    ) -> list[dict[str, Any]]: ...


async def subsumiere_gegen_normstatements(
    antrag: dict[str, Any],
    plugin: Any,
    db: Any,
    llm: _LlmProtocol,
) -> list[Befund]:
    """Lädt FB-relevante Norm-Statements, lässt das LLM pro Statement
    eine Subsumtion liefern und mappt auf Befund-Schema.

    Returns:
        Liste von Befunden mit layer='B'. 'passt'-Beurteilungen werden
        verworfen, 'passt_nicht' → schwere='verstoss', 'unklar' →
        schwere='hinweis'.
    """
    fb = antrag.get("foerderbereich")
    if not fb:
        return []

    # 1) Norm-Statements für diesen FB laden (FB-spezifisch + übergreifend)
    rows = await db.select(
        "ahp_norm_statements",
        (
            "select=ref,foerderbereich,fb_iii_variante,statement_typ,"
            "kurz_aussage,ausfuehrlich,woertliches_zitat,aktiv"
            "&aktiv=eq.true"
            f"&or=(foerderbereich.eq.{fb},foerderbereich.is.null)"
        ),
    )
    if not rows:
        return []

    # 2) Subsumtions-Prompt vom FB-Plugin bauen (Halluzinations-Schutz
    #    ist im Prompt-Text durch die Plugins bereits verankert: „Du darfst
    #    NUR § aus den oben gelisteten Norm-Statements zitieren …").
    prompt = plugin.baue_subsumtions_prompt(antrag, rows)

    # 3) LLM-Call (Tool-Use erzwingt strukturiertes JSON pro Norm-Aussage)
    llm_befunde = await llm.subsumiere_normstatements(prompt)

    # 4) Halluzinations-Validator + Mapping auf Befund
    erlaubte_refs = {r["ref"]: r for r in rows if r.get("ref")}
    befunde: list[Befund] = []
    for entry in llm_befunde or []:
        ref = entry.get("ref")
        beurteilung = entry.get("beurteilung")
        if ref not in erlaubte_refs:
            # Erfundener ref → verwerfen + loggen, KEIN Befund
            logger.warning(
                "Hallu-Schutz: LLM lieferte ref=%r, der NICHT in den "
                "geladenen Norm-Statements für FB %s vorkommt — verworfen.",
                ref, fb,
            )
            continue
        if beurteilung == "passt":
            continue
        if beurteilung not in ("passt_nicht", "unklar"):
            # Unbekannte Beurteilung — defensiv ignorieren
            logger.warning(
                "Hallu-Schutz: unbekannte Beurteilung %r für ref=%r — ignoriert.",
                beurteilung, ref,
            )
            continue
        norm_row = erlaubte_refs[ref]
        schwere = "verstoss" if beurteilung == "passt_nicht" else "hinweis"
        befunde.append(Befund(
            schwere=schwere,
            layer="B",
            feld=None,
            beschreibung=entry.get("begruendung") or "—",
            # Zitat IMMER aus DB — LLM darf das nicht überschreiben
            zitat=norm_row.get("woertliches_zitat"),
            section_path=norm_row.get("statement_typ"),
            paragraph_ref=ref,
            konfidenz=entry.get("konfidenz"),
        ))
    return befunde
