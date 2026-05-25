import pytest

# weasyprint braucht native libs (pango/cairo). Seit pdf_render den
# weasyprint-Import lazy macht, schlägt der OSError erst beim ersten
# HTML(...)-Aufruf zu — wir probieren den Import einmal proaktiv und
# skippen das ganze Modul, falls libgobject etc. nicht ladbar sind
# (z.B. macOS ohne DYLD_LIBRARY_PATH = /opt/homebrew/lib).
try:
    import weasyprint  # noqa: F401
except OSError as e:  # pragma: no cover
    pytest.skip(f"weasyprint native libs nicht ladbar: {e}", allow_module_level=True)

from pruefung.pdf_render import render_protokoll_pdf  # noqa: E402
from pruefung.models import Befund, PruefungsErgebnis  # noqa: E402


def test_render_pdf_returns_bytes():
    ergebnis = PruefungsErgebnis(
        befunde=[Befund(schwere="verstoss", layer="A", feld="iban", beschreibung="ungültig")],
        doctree_version="2025-03-27",
        duration_ms=234,
    )
    pdf = render_protokoll_pdf(
        antrag={"antragsnummer": "APL2-2026-X-1", "name": "Test", "traeger": "Träger X"},
        ergebnis=ergebnis,
    )
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF-")


def test_render_pdf_leere_befunde():
    """Keine Befunde → PDF zeigt 'konform'-Hinweis statt Tabelle."""
    ergebnis = PruefungsErgebnis(befunde=[], doctree_version="2025-03-27", duration_ms=50)
    pdf = render_protokoll_pdf(
        antrag={"antragsnummer": "APL2-2026-X-2", "name": "T", "traeger": "Y"},
        ergebnis=ergebnis,
    )
    assert pdf.startswith(b"%PDF-")
