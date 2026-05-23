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
    geprueft_gegen: list[str] | None = None,
) -> bytes:
    """Rendert einen Verwaltungsbescheid (bewilligt/abgelehnt/rueckfrage).

    Die Befunde stammen aus dem letzten Prüfprotokoll und werden bereits mit
    angereichertem AHP-Wortlaut + Subsumtion übergeben (Caller konsultiert
    den Doctree). geprueft_gegen ist die Liste aller AHP-Sections, gegen die
    geprüft wurde — für Transparenz im Bescheid.
    """
    tpl = _env.get_template("bescheid.html.j2")
    # Pfad zum Würzburg-Wappen (SVG liegt im templates/-Ordner).
    # WeasyPrint braucht ein absolutes file://-URI.
    wappen_path = (Path(__file__).parent / "templates" / "wuerzburg_coa.svg").resolve()
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
        geprueft_gegen=geprueft_gegen or [],
        wappen_src=wappen_path.as_uri(),
    )
    # base_url muss gesetzt sein, damit WeasyPrint relative/file-URLs auflöst.
    return HTML(string=html, base_url=str(wappen_path.parent)).write_pdf()


def render_bescheid_docx(
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
    geprueft_gegen: list[str] | None = None,
) -> bytes:
    """Editierbare DOCX-Variante des Bescheids. Schlanker als das PDF
    (kein eingebettetes Wappen, keine farbigen Boxen) — Fokus liegt auf
    Bearbeitbarkeit in Word/LibreOffice.

    Sachbearbeiter können hier vor dem Versand letzte Hand anlegen
    (etwa formulierte Hinweise präzisieren) ohne den ganzen Renderer
    nochmal anzustoßen."""
    import io
    from docx import Document
    from docx.shared import Pt, Cm

    doc = Document()
    # Globaler Default-Font
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    # Briefkopf
    h = doc.add_paragraph()
    h_run = h.add_run("STADT WÜRZBURG · SOZIALREFERAT")
    h_run.bold = True
    h.add_run("\nFachbereich Integration, Inklusion und Senioren")
    h.add_run("\nKarmelitenstraße 43 · 97070 Würzburg")

    # Meta-Block (Aktenzeichen, Datum, Sachbearbeitung)
    meta = doc.add_paragraph()
    meta.add_run(f"Aktenzeichen: ").bold = True
    meta.add_run(f"{antrag.get('antragsnummer', '—')}\n")
    meta.add_run(f"Datum: ").bold = True
    meta.add_run(f"{_format_date(ausgestellt_am)}\n")
    if ausgestellt_von:
        meta.add_run(f"Sachbearbeitung: ").bold = True
        meta.add_run(f"{ausgestellt_von}")

    doc.add_paragraph()  # leere Zeile

    # Empfänger
    e = doc.add_paragraph()
    e.add_run(antrag.get("traeger", "")).bold = True
    e.add_run(f"\n{antrag.get('ansprechpartner','')}\n")
    e.add_run(f"{antrag.get('strasse','')} {antrag.get('hausnummer','')}\n")
    e.add_run(f"{antrag.get('plz','')} {antrag.get('ort','')}")

    doc.add_paragraph()

    # Betreff
    titel = {
        "bewilligt": "Bewilligung Ihres Förderantrags",
        "abgelehnt": "Ablehnung Ihres Förderantrags",
        "rueckfrage": "Rückfrage zu Ihrem Förderantrag",
    }.get(entscheidung, "Bescheid")
    b = doc.add_heading(
        f"{titel} vom {_format_date(antrag.get('antragsdatum'))}", level=1,
    )
    sub = doc.add_paragraph()
    sub.add_run(
        f"Altentagesstätten — APL 2 · Haushaltsjahr {antrag.get('haushaltsjahr','—')} · "
        f"Rechtsgrundlage: AHP-Förderrichtlinie der Stadt Würzburg (27.03.2025)"
    ).italic = True

    # Anrede
    doc.add_paragraph("Sehr geehrte Damen und Herren,")

    # Entscheidung
    ent = doc.add_paragraph()
    verb = {
        "bewilligt": "BEWILLIGT",
        "abgelehnt": "ABGELEHNT",
        "rueckfrage": "Es bestehen RÜCKFRAGEN",
    }.get(entscheidung, "")
    ent.add_run(f"Ihr Antrag wird {verb}.").bold = True
    if entscheidung == "bewilligt" and bewilligte_summe_euro:
        ent.add_run(
            f"\nBewilligte Fördersumme: {_format_euro(bewilligte_summe_euro)} / Jahr"
        )

    # Sachverhalt + Prüfung + Begründung
    if entscheidung != "bewilligt":
        doc.add_heading("I. Sachverhalt", level=2)
        sv = doc.add_paragraph(
            "Folgende Antragsdaten lagen der Prüfung zugrunde:"
        )
        kvs = [
            ("Aktenzeichen", antrag.get("antragsnummer", "—")),
            ("Antragsdatum", _format_date(antrag.get("antragsdatum"))),
            ("Haushaltsjahr", str(antrag.get("haushaltsjahr", "—"))),
            ("Träger", antrag.get("traeger", "—")),
            ("Einrichtung", antrag.get("name", "—")),
            ("Sitz", f"{antrag.get('strasse','')} {antrag.get('hausnummer','')}, "
                     f"{antrag.get('plz','')} {antrag.get('ort','')}"),
            ("Bankverbindung", f"{antrag.get('bankverbindung','—')} · IBAN {antrag.get('iban','—')}"),
        ]
        if antrag.get("foerderbereich"):
            kvs.append(("Förderbereich", str(antrag["foerderbereich"])))
        if antrag.get("geforderte_foerdersumme_euro") is not None:
            kvs.append(("Geforderte Fördersumme", _format_euro(antrag["geforderte_foerdersumme_euro"])))
        for label, value in kvs:
            p = doc.add_paragraph()
            p.add_run(f"{label}: ").bold = True
            p.add_run(str(value))

        doc.add_heading("II. Durchgeführte Prüfung", level=2)
        doc.add_paragraph(
            f"Der Antrag wurde am {_format_date(ausgestellt_am)} durch das "
            f"Sozialreferat einer dreistufigen Prüfung gegen die AHP-Förder"
            f"richtlinie der Stadt Würzburg (Doctree-Version {doctree_version}) "
            f"unterzogen: formal-strukturelle Prüfung, inhaltliche "
            f"Konformitätsprüfung (Ontologie), Wortlaut-basierte AHP-Prüfung."
        )
        if geprueft_gegen:
            doc.add_paragraph(
                "Geprüft wurde gegen folgende AHP-Stellen: "
                + ", ".join(geprueft_gegen)
            )

    verstoesse = [b for b in befunde if b.get("schwere") == "verstoss"]
    if verstoesse:
        doc.add_heading("III. Rechtliche Würdigung — festgestellte Verstöße", level=2)
        for i, b in enumerate(verstoesse, start=1):
            doc.add_heading(f"{i}. {b.get('beschreibung','')}", level=3)
            if b.get("sachverhalt"):
                p = doc.add_paragraph()
                p.add_run("Sachverhalt im Einzelnen — ").bold = True
                p.add_run(b["sachverhalt"])
            if b.get("ahp_wortlaut"):
                p = doc.add_paragraph()
                p.add_run(
                    f"Rechtsgrundlage · Wortlaut · "
                    f"{b.get('paragraph_ref','—')}: "
                ).bold = True
                p.add_run(b["ahp_wortlaut"]).italic = True
            if b.get("wuerdigung"):
                p = doc.add_paragraph()
                p.add_run("Rechtliche Würdigung — ").bold = True
                p.add_run(b["wuerdigung"])

    if entscheidung == "abgelehnt":
        doc.add_heading("IV. Entscheidungsgründe und Konsequenz", level=2)
        doc.add_paragraph(
            f"Auf Grund der unter Ziffer III dargestellten Verstöße ist der "
            f"Antrag nach pflichtgemäßer Prüfung abzulehnen. Im Übrigen "
            f"besteht nach AHP Kap. 3.4 grundsätzlich kein Rechtsanspruch "
            f"auf eine Förderung."
        )

    if entscheidung == "bewilligt":
        doc.add_heading("Auflagen zur Mittelverwendung", level=2)
        for auflage in [
            "Mittelverwendung: zweckgebunden für die geförderte Maßnahme (AHP 3.8).",
            f"Verwendungsnachweis bis 1. April {int(antrag.get('haushaltsjahr',0))+1} "
                "(sachlicher Bericht + zahlenmäßiger Nachweis, AHP 3.8).",
            "Originalbelege mindestens 3 Jahre aufbewahren (AHP 3.8).",
            "Logo der Stadt Würzburg in Veröffentlichungen verwenden (AHP 2).",
            "Prüfungsrecht der Stadt Würzburg gewährleisten (AHP 3.9).",
        ]:
            doc.add_paragraph(auflage, style="List Number")

    if bearbeiter_kommentar:
        doc.add_heading("Anmerkung der Sachbearbeitung", level=2)
        doc.add_paragraph(bearbeiter_kommentar)

    doc.add_paragraph()
    doc.add_paragraph("Mit freundlichen Grüßen")
    doc.add_paragraph()
    doc.add_paragraph(ausgestellt_von or "Im Auftrag · Sachbearbeitung Sozialreferat")
    doc.add_paragraph("(Unterschrift / Stempel)")

    doc.add_heading("Rechtsbehelfsbelehrung", level=2)
    doc.add_paragraph(
        "Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe "
        "Widerspruch erhoben werden. Der Widerspruch ist schriftlich oder zur "
        "Niederschrift bei der Stadt Würzburg, Sozialreferat, Karmeliten"
        "straße 43, 97070 Würzburg einzulegen."
    )
    doc.add_paragraph(
        "Hinweis nach AHP Kap. 3.4: Über Art und Höhe der Bewilligung "
        "entscheidet der Sozialausschuss der Stadt Würzburg nach Prüfung "
        "durch die Leitung Seniorenarbeit (FB IIS). Ein Rechtsanspruch auf "
        "Förderung besteht nicht."
    )

    foot = doc.add_paragraph()
    foot.add_run(
        f"Bescheid-ID: {bescheid_id} · Doctree-Version {doctree_version or '—'}"
    ).italic = True

    # In-Memory-Bytes
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
