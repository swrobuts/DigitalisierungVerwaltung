"""HTML→PDF via weasyprint + Jinja-Template."""
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML
from pruefung.models import PruefungsErgebnis


_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html", "j2"]),
)


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
