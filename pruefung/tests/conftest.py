"""Pytest-Konfiguration: erzeugt benötigte Fixtures (z.B. mini.pdf) bei Bedarf."""
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"
MINI_PDF = FIXTURES_DIR / "mini.pdf"

MINI_PDF_HTML = """
<html><body>
<h1>§ 1 Geltungsbereich</h1>
<p>Die Richtlinie gilt für Altentagesstätten.</p>
<h1>§ 2 Begriffsbestimmungen</h1>
<h2>§ 2.1 Altentagesstätte</h2>
<p>Eine Altentagesstätte ist eine Einrichtung der offenen Altenhilfe.</p>
</body></html>
"""


def _ensure_mini_pdf() -> None:
    if MINI_PDF.exists():
        return
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    from weasyprint import HTML  # nur bei Bedarf importieren

    HTML(string=MINI_PDF_HTML).write_pdf(str(MINI_PDF))


_ensure_mini_pdf()
