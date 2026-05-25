"""Plugin-Registry für AHP-Förderbereiche (I/II/III/IV).

Jeder Förderbereich hat eine eigene Plugin-Klasse, die das
FoerderbereichPlugin-Protocol erfüllt. Der Dispatcher (geplant in
Phase 4B) entscheidet anhand von antrag.foerderbereich, welches
Plugin er aufruft.
"""
from __future__ import annotations

from .base import FoerderbereichPlugin
from .fb_i import FbIPlugin
from .fb_ii import FbIiPlugin
from .fb_iii import FbIiiPlugin
from .fb_iv import FbIvPlugin


PLUGINS: dict[str, FoerderbereichPlugin] = {
    "I": FbIPlugin(),
    "II": FbIiPlugin(),
    "III": FbIiiPlugin(),
    "IV": FbIvPlugin(),
}


def plugin_for(fb_id: str) -> FoerderbereichPlugin:
    """Liefert das Plugin für den angegebenen Förderbereich.

    Raises:
        ValueError: Wenn fb_id nicht in {'I','II','III','IV'} ist.
    """
    if fb_id not in PLUGINS:
        raise ValueError(f"Unbekannter Förderbereich: {fb_id!r}")
    return PLUGINS[fb_id]


async def render_bescheid_safe(
    fb_id: str,
    antrag: dict,
    ki_result: dict,
    *,
    db=None,
    bekannte_refs: set[str] | None = None,
    antrag_id: str | None = None,
) -> str:
    """Rendert einen Bescheid und validiert die Quellen HART vor Rückgabe.

    Spec §12.1: vor jedem PDF-Render wird jeder zitierte § gegen
    apl.ahp_norm_statements geprüft. Bei erfundenen § wird
    QuellenValidationError geworfen — KEIN Soft-Fail.

    Args:
        fb_id: 'I' | 'II' | 'III' | 'IV'.
        antrag: Antragsdaten-Dict.
        ki_result: bereits post-prozessiertes KI-Ergebnis.
        db: SupabaseClient (wenn bekannte_refs None ist).
        bekannte_refs: Optionales Pre-Loaded Set (für Tests/Caching).
        antrag_id: Für die Fehlermeldung.

    Returns:
        Gerenderter HTML-Bescheid-Text.

    Raises:
        QuellenValidationError: Wenn ein zitierter § nicht in
            apl.ahp_norm_statements existiert.
    """
    from pruefung.quellen_validator import validiere_oder_abbrechen

    plugin = plugin_for(fb_id)
    rendered = plugin.render_bescheid_template(antrag, ki_result)
    await validiere_oder_abbrechen(
        rendered, db=db, bekannte_refs=bekannte_refs, antrag_id=antrag_id,
    )
    return rendered


__all__ = [
    "FoerderbereichPlugin",
    "FbIPlugin", "FbIiPlugin", "FbIiiPlugin", "FbIvPlugin",
    "PLUGINS", "plugin_for", "render_bescheid_safe",
]
