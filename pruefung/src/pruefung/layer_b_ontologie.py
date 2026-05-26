"""Layer B — FB-spezifische Konformitätsregeln + KI-Subsumtion gegen
apl.ahp_norm_statements.

Zwei Stufen:
  1) Hard-Regeln aus dem FB-Plugin (plugin.check_konformitaet) — z.B.
     FB-III-Variante-C Treffen-Schwelle. Sind deterministisch, kein LLM.
  2) KI-Subsumtion gegen die kuratierten AHP-Norm-Aussagen aus
     apl.ahp_norm_statements (Migration 072). Pro Norm-Aussage liefert
     der pruefung.norm_subsumtion-Helper einen strukturierten Befund
     ('passt' → kein Befund, 'passt_nicht' → verstoss, 'unklar' → hinweis).
     Halluzinations-Schutz dort verankert (erfundene refs werden verworfen,
     zitat kommt aus DB).

Plan-Id-Parameter bleibt für Signatur-Stabilität (main.py), wird aktuell
nicht verwendet — Plan-spezifische Logik steckt in den FB-Plugins.
"""
from __future__ import annotations

import inspect
from typing import Any

from pruefung.foerderbereiche import plugin_for
from pruefung.models import Befund
from pruefung.norm_subsumtion import subsumiere_gegen_normstatements


async def check_ontologie(
    antrag: dict[str, Any],
    plan_id: str = "APL2",  # noqa: ARG001 — Signatur-Stabilität für main.py
    db: Any = None,
    llm: Any = None,
) -> list[Befund]:
    """Dispatcht an plugin.check_konformitaet() UND (optional) an die
    KI-Subsumtion gegen ahp_norm_statements.

    Args:
        antrag: Antrag (inkl. fb_details).
        plan_id: APL2 (reserviert).
        db: SupabaseClient für die Norm-Statements-Lese (Layer-B-Plus).
        llm: LlmClient für die KI-Subsumtion. Wenn None → nur Hard-Regeln.

    Returns:
        Liste von Befunden mit layer='B'.
    """
    fb = antrag.get("foerderbereich")
    if not fb:
        return []
    try:
        plugin = plugin_for(fb)
    except ValueError:
        return []

    befunde: list[Befund] = []

    # 1) Hard-Regeln des FB-Plugins (deterministisch)
    check_fn = getattr(plugin, "check_konformitaet", None)
    if check_fn is not None:
        if inspect.iscoroutinefunction(check_fn):
            result = await check_fn(antrag, db=db)
        else:
            result = check_fn(antrag, db=db)
        befunde.extend(result or [])

    # 2) KI-Subsumtion gegen apl.ahp_norm_statements — nur wenn db + llm
    #    verfügbar sind (Unit-Tests rufen check_ontologie oft ohne LLM auf).
    if db is not None and llm is not None:
        ki_befunde = await subsumiere_gegen_normstatements(
            antrag=antrag, plugin=plugin, db=db, llm=llm,
        )
        befunde.extend(ki_befunde)

    return befunde
