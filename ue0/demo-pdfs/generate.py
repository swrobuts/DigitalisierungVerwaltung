"""Generiert zwei ausgefüllte Demo-Antrags-PDFs für UE0.

Layout angelehnt an das Original-Stadt-Würzburg-Antrags-PDF
(materialien/antrag-apl2.pdf): zentrierter Titel, zweispaltige Daten-
tabelle, Kosten-Block. Bewusst eigenes Layout (kein 1:1-Klon des
amtlichen PDFs — rechtliche Sauberkeit), aber für das KI-OCR
(Claude Vision) genauso lesbar.

Erzeugt:
  - demo-antrag-pfarrei-st-albert.pdf   (maschinell ausgefüllt)
  - demo-antrag-buergerverein-handschrift.pdf  (Handschrift-anmutende Font,
    Demo für „auch handschriftlich lesbar")

Aufruf:
  uv run --with reportlab python3 ue0/demo-pdfs/generate.py
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = Path(__file__).parent

# ──────────────────────────────────────────────────────────────────────
# Layout-Helfer
# ──────────────────────────────────────────────────────────────────────

PAGE_W, PAGE_H = A4
MARGIN_X = 25 * mm
LABEL_X = MARGIN_X
VALUE_X = MARGIN_X + 65 * mm
ROW_H = 9 * mm


def draw_header(c: canvas.Canvas) -> float:
    """Briefkopf + Titel. Gibt Y-Position für den ersten Datensatz zurück."""
    y = PAGE_H - 30 * mm
    c.setFont("Helvetica", 10)
    c.drawCentredString(PAGE_W / 2, y, "Beratungsstelle für Senioren")
    y -= 5 * mm
    c.drawCentredString(PAGE_W / 2, y, "Karmelitenstraße 43  -  97070 Würzburg")
    y -= 18 * mm
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(PAGE_W / 2, y, "Antrag auf Gewährung eines Zuschusses nach dem")
    y -= 8 * mm
    c.drawCentredString(PAGE_W / 2, y, "ALTENHILFEPLAN Nr. 2 der STADT WÜRZBURG")
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W / 2, y, "Altentagesstätten - , Betriebs- und Personalkostenzuschüsse")
    y -= 14 * mm
    return y


def draw_haushaltsjahr(c: canvas.Canvas, y: float, jahr: int, value_font: str) -> float:
    c.setFont("Helvetica-Bold", 12)
    c.drawString(MARGIN_X + 50 * mm, y, "HAUSHALTSJAHR")
    c.rect(MARGIN_X + 95 * mm, y - 2 * mm, 25 * mm, 7 * mm)
    c.setFont(value_font, 12)
    c.drawString(MARGIN_X + 99 * mm, y, str(jahr))
    return y - 14 * mm


def draw_data_row(c: canvas.Canvas, y: float, label: str, value: str, value_font: str) -> float:
    c.setFont("Helvetica", 10)
    c.drawRightString(VALUE_X - 4 * mm, y, label)
    c.rect(VALUE_X, y - 3 * mm, 95 * mm, 7 * mm)
    if value:
        c.setFont(value_font, 10)
        c.drawString(VALUE_X + 2 * mm, y, value)
    return y - ROW_H


def draw_kosten_block(c: canvas.Canvas, y: float, daten: dict, value_font: str) -> float:
    c.setFont("Helvetica", 9.5)
    y -= 4 * mm
    c.drawString(MARGIN_X, y, "Nachgewiesene Höhe der Betriebskosten des Vorjahres")
    c.rect(MARGIN_X + 130 * mm, y - 3 * mm, 35 * mm, 7 * mm)
    c.setFont(value_font, 10)
    if daten.get("betriebskosten"):
        c.drawRightString(MARGIN_X + 162 * mm, y, daten["betriebskosten"])

    y -= 10 * mm
    c.setFont("Helvetica", 9.5)
    c.drawString(MARGIN_X, y, "Nachgewiesene Höhe der Personalkosten des Vorjahres")
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawString(MARGIN_X, y - 4 * mm,
                 "(bitte nur die tatsächlichen Kosten für diese Einrichtung angeben und belegen)")
    c.rect(MARGIN_X + 130 * mm, y - 3 * mm, 35 * mm, 7 * mm)
    c.setFont(value_font, 10)
    if daten.get("personalkosten"):
        c.drawRightString(MARGIN_X + 162 * mm, y, daten["personalkosten"])

    y -= 14 * mm
    c.setFont("Helvetica", 9.5)
    c.drawString(MARGIN_X, y, "Vorhandene Räumlichkeiten des Trägers")
    # Ja/Nein-Checkboxen
    c.rect(MARGIN_X + 95 * mm, y - 2 * mm, 4 * mm, 4 * mm)
    c.drawString(MARGIN_X + 102 * mm, y, "ja")
    c.rect(MARGIN_X + 115 * mm, y - 2 * mm, 4 * mm, 4 * mm)
    c.drawString(MARGIN_X + 122 * mm, y, "nein")
    if daten.get("raeume_vorhanden") == "ja":
        _draw_check(c, MARGIN_X + 95 * mm + 2 * mm, y)
    elif daten.get("raeume_vorhanden") == "nein":
        _draw_check(c, MARGIN_X + 115 * mm + 2 * mm, y)

    y -= 8 * mm
    c.drawString(MARGIN_X, y, "Unentgeltlich bereitgestellte Räume anderer Träger")
    c.rect(MARGIN_X + 95 * mm, y - 2 * mm, 4 * mm, 4 * mm)
    c.drawString(MARGIN_X + 102 * mm, y, "ja")
    c.rect(MARGIN_X + 115 * mm, y - 2 * mm, 4 * mm, 4 * mm)
    c.drawString(MARGIN_X + 122 * mm, y, "nein")
    if daten.get("raeume_unentgeltlich") == "ja":
        _draw_check(c, MARGIN_X + 95 * mm + 2 * mm, y)
    elif daten.get("raeume_unentgeltlich") == "nein":
        _draw_check(c, MARGIN_X + 115 * mm + 2 * mm, y)

    y -= 10 * mm
    c.drawString(MARGIN_X, y, "Monatliche Mietzahlungen in Höhe von (Kopie Mietvertrag)")
    c.rect(MARGIN_X + 130 * mm, y - 3 * mm, 35 * mm, 7 * mm)
    if daten.get("miete"):
        c.setFont(value_font, 10)
        c.drawRightString(MARGIN_X + 162 * mm, y, daten["miete"])

    return y - 18 * mm


def _draw_check(c: canvas.Canvas, x: float, y: float):
    """Zeichnet ein „×" als Checkbox-Kreuz."""
    c.setLineWidth(1.2)
    c.line(x - 1.5 * mm, y - 1 * mm, x + 1.5 * mm, y + 2 * mm)
    c.line(x - 1.5 * mm, y + 2 * mm, x + 1.5 * mm, y - 1 * mm)
    c.setLineWidth(1)


def draw_footer(c: canvas.Canvas, y: float, datum: str, value_font: str) -> None:
    c.setFont("Helvetica", 9.5)
    c.drawString(MARGIN_X, y, "Weitere Angaben siehe Anlage 1 sowie Programm der Altentagesstätte")
    y -= 12 * mm
    c.drawString(MARGIN_X, y, "Würzburg,")
    c.rect(MARGIN_X + 22 * mm, y - 3 * mm, 30 * mm, 7 * mm)
    c.setFont(value_font, 10)
    c.drawString(MARGIN_X + 24 * mm, y, datum)
    # Unterschriftslinie
    c.line(MARGIN_X + 90 * mm, y, MARGIN_X + 160 * mm, y)
    c.setFont("Helvetica", 8.5)
    c.drawCentredString(MARGIN_X + 125 * mm, y - 5 * mm, "Unterschrift")


# ──────────────────────────────────────────────────────────────────────
# Demo-Daten
# ──────────────────────────────────────────────────────────────────────

PFARREI = {
    "haushaltsjahr": 2026,
    "name": "Seniorentreff St. Albert",
    "anschrift": "Pestalozzistr. 12, 97082 Würzburg",
    "bankverbindung": "Sparkasse Mainfranken Würzburg",
    "iban": "DE89 7905 0000 0012 3456 78",
    "bic": "",
    "ansprechpartner": "Frau Maria Bauer",
    "telefon": "0931 32145-0",
    "email": "seniorentreff@pfarrei-st-albert-wue.de",
    "traeger": "Katholische Kirchenstiftung St. Albert",
    "betriebskosten": "8.450,00 €",
    "personalkosten": "21.800,00 €",
    "raeume_vorhanden": "ja",
    "raeume_unentgeltlich": "nein",
    "miete": "320,00 €",
    "antragsdatum": "15.03.2026",
}

BUERGERVEREIN = {
    "haushaltsjahr": 2026,
    "name": "Senioren-Stammtisch Frauenland",
    "anschrift": "Mergentheimer Str. 78, 97082 Würzburg",
    "bankverbindung": "VR-Bank Würzburg",
    "iban": "DE12 7906 9001 0000 4455 66",
    "bic": "",
    "ansprechpartner": "Herr Peter Hoffmann",
    "telefon": "",
    "email": "vorstand@buergerverein-frauenland.de",
    "traeger": "Bürgerverein Frauenland e.V.",
    "betriebskosten": "2.150,00 €",
    "personalkosten": "1.450,00 €",
    "raeume_vorhanden": "nein",
    "raeume_unentgeltlich": "ja",
    "miete": "",
    "antragsdatum": "22.03.2026",
}


# ──────────────────────────────────────────────────────────────────────
# PDF-Generierung
# ──────────────────────────────────────────────────────────────────────

def generate(daten: dict, out: Path, *, handschrift: bool):
    """Schreibt ein PDF. handschrift=True nutzt eine handschrift-anmutende
    Schriftart, falls verfügbar — sonst kursiv als Fallback."""
    value_font = "Helvetica"
    if handschrift:
        # Versuch, eine System-Handschrift-Font zu finden (macOS).
        candidates = [
            "/System/Library/Fonts/Supplemental/Bradley Hand.ttc",
            "/System/Library/Fonts/Supplemental/Marker Felt.ttc",
            "/Library/Fonts/HandwritingFont.ttf",
        ]
        for p in candidates:
            if Path(p).exists():
                try:
                    pdfmetrics.registerFont(TTFont("Handschrift", p))
                    value_font = "Handschrift"
                    break
                except Exception:
                    pass
        if value_font == "Helvetica":
            # Fallback: Oblique (kursiv) — sieht wenigstens „weniger maschinell" aus
            value_font = "Helvetica-Oblique"

    c = canvas.Canvas(str(out), pagesize=A4)
    c.setTitle(f"Antrag APL2 — {daten['name']}")

    y = draw_header(c)
    y = draw_haushaltsjahr(c, y, daten["haushaltsjahr"], value_font)

    # Datentabelle
    rows = [
        ("Name", daten["name"]),
        ("Anschrift", daten["anschrift"]),
        ("Bankverbindung", daten["bankverbindung"]),
        ("IBAN", daten["iban"]),
        ("BIC", daten["bic"]),
        ("Ansprechpartner/in", daten["ansprechpartner"]),
        ("Telefon/Handy", daten["telefon"]),
        ("E-Mail", daten["email"]),
        ("Träger", daten["traeger"]),
    ]
    for label, value in rows:
        y = draw_data_row(c, y, label, value, value_font)

    y = draw_kosten_block(c, y, daten, value_font)
    draw_footer(c, y, daten["antragsdatum"], value_font)

    c.showPage()
    c.save()
    print(f"  ✓ {out.name}")


def main():
    out_dir = HERE
    out_dir.mkdir(exist_ok=True)
    print("Generiere Demo-PDFs für UE0 …")
    generate(PFARREI, out_dir / "demo-antrag-pfarrei-st-albert.pdf",
             handschrift=False)
    generate(BUERGERVEREIN, out_dir / "demo-antrag-buergerverein-handschrift.pdf",
             handschrift=True)
    print("Fertig.")


if __name__ == "__main__":
    main()
