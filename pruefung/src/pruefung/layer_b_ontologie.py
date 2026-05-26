"""Layer B — FB-spezifische Konformitätsregeln, dispatcht via Plugin.

Ablöse für die alte Tabelle apl.ontologie_rules, die im neuen apl-Schema
nicht mehr existiert. Pro FB definiert das Plugin in
`check_konformitaet(antrag, db)` seine spezifischen Cross-Field-Regeln —
z.B. FB III: Variante-C Treffen-Schwelle muss aus der Richtlinie sein.

Plan-Id-Parameter bleibt erhalten (Signatur stabil für main.py), wird
aktuell aber nicht verwendet — die Plan-spezifischen Regeln stecken in
den FB-Plugins.
"""
from __future__ import annotations

import inspect
from typing import Any

from pruefung.foerderbereiche import plugin_for
from pruefung.models import Befund


async def check_ontologie(
    antrag: dict[str, Any],
    plan_id: str = "APL2",  # noqa: ARG001 — Signatur-Stabilität für main.py
    db: Any = None,
) -> list[Befund]:
    """Dispatcht an plugin.check_konformitaet().

    Returns:
        Liste von Befunden mit layer='B'. Plugin ohne check_konformitaet:
        leere Liste.
    """
    fb = antrag.get("foerderbereich")
    if not fb:
        return []
    try:
        plugin = plugin_for(fb)
    except ValueError:
        return []
    check_fn = getattr(plugin, "check_konformitaet", None)
    if check_fn is None:
        return []
    if inspect.iscoroutinefunction(check_fn):
        result = await check_fn(antrag, db=db)
    else:
        result = check_fn(antrag, db=db)
    return list(result or [])
