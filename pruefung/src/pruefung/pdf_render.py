"""HTML→PDF via weasyprint + Jinja-Template."""
from datetime import date, datetime
from pathlib import Path
from typing import Any
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML
from pruefung.models import PruefungsErgebnis


def _format_euro(v: Any) -> str:
    """1234.5 → '1.234,50 €'. Robust gegen str/decimal/float."""
    if v is None:
        return "—"
    try:
        n = float(v)
    except (ValueError, TypeError):
        return str(v)
    return f"{n:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _format_date(v: Any) -> str:
    """ISO-Datum oder date → '22.05.2026'."""
    if v is None:
        return "—"
    if isinstance(v, datetime):
        return v.strftime("%d.%m.%Y")
    if isinstance(v, date):
        return v.strftime("%d.%m.%Y")
    s = str(v)[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%d.%m.%Y")
    except ValueError:
        return s


_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html", "j2"]),
)
_env.globals["format_euro"] = _format_euro
_env.globals["format_date"] = _format_date


def render_protokoll_pdf(antrag: dict, ergebnis: PruefungsErgebnis) -> bytes:
    tpl = _env.get_template("protokoll.html.j2")
    html = tpl.render(
        antrag=antrag,
        ergebnis=ergebnis,
        geprueft_am=datetime.now().strftime("%d.%m.%Y %H:%M"),
        verstoesse=ergebnis.anzahl_verstoesse(),
        hinweise=ergebnis.anzahl_hinweise(),
        status=ergebnis.pruefungsstatus(),
    )
    return HTML(string=html).write_pdf()


def render_bescheid_pdf(
    *,
    bescheid_id: str,
    antrag: dict,
    entscheidung: str,
    bewilligte_summe_euro: float | None,
    befunde: list[dict],
    bearbeiter_kommentar: str | None,
    ausgestellt_von: str | None,
    ausgestellt_am: datetime,
    doctree_version: str | None,
) -> bytes:
    """Rendert einen Verwaltungsbescheid (bewilligt/abgelehnt/rueckfrage).

    Die Befunde stammen aus dem letzten Prüfprotokoll und werden bereits mit
    angereichertem AHP-Wortlaut übergeben (Caller muss den Doctree konsultieren).
    Das hält das Template frei von DB-Logik.
    """
    tpl = _env.get_template("bescheid.html.j2")
    html = tpl.render(
        bescheid_id=bescheid_id,
        antrag=antrag,
        entscheidung=entscheidung,
        bewilligte_summe_euro=bewilligte_summe_euro,
        befunde=befunde,
        bearbeiter_kommentar=bearbeiter_kommentar,
        ausgestellt_von=ausgestellt_von,
        ausgestellt_am=ausgestellt_am,
        doctree_version=doctree_version or "—",
    )
    return HTML(string=html).write_pdf()
