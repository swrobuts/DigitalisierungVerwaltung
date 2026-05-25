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


__all__ = [
    "FoerderbereichPlugin",
    "FbIPlugin", "FbIiPlugin", "FbIiiPlugin", "FbIvPlugin",
    "PLUGINS", "plugin_for",
]
