"""Generiert ausgefüllte Demo-PDFs für UE0 (Hauptantrag + Anlage 1).

Layout angelehnt an das Original-Stadt-Würzburg-Antrags-PDF
(materialien/antrag-apl2.pdf bzw. materialien/anlage-antrag-apl2.pdf):
zentrierter Titel, zweispaltige Datentabelle, Kosten-Block bzw.
Wochenplan-Tabelle. Bewusst eigenes Layout (kein 1:1-Klon des
amtlichen PDFs — rechtliche Sauberkeit), aber für das KI-OCR
(Claude Vision) genauso lesbar.

Erzeugt:
  Hauptantrag:
    - demo-antrag-pfarrei-st-albert.pdf            (maschinell ausgefüllt)
    - demo-antrag-buergerverein-handschrift.pdf    (Handschrift-Font)
  Anlage 1 (Wochenplan):
    - demo-anlage1-pfarrei-st-albert.pdf           (maschinell ausgefüllt)
    - demo-anlage1-buergerverein-handschrift.pdf   (Handschrift-Font)

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

# ── WICHTIG: Daten sind EXAKT die aus apl2.antrag_mit_summen für
#    APL2-2026-FAKE-001 und APL2-2026-FAKE-002. Wenn das Demo-PDF
#    hochgeladen wird, soll die KI-OCR-Pipeline die GLEICHEN Werte
#    extrahieren, die vorher in der DB lagen — sodass beim Demo-Lauf
#    NACH dem Löschen der FAKE-Anträge der neue Datensatz inhaltlich
#    identisch wieder entsteht. Sonst gäbe es Duplikate oder Drift
#    zwischen PDF und Datenbank.
#    Stand: ssh vps psql -c "select * from apl2.antrag_mit_summen
#                            where antragsnummer like 'APL2-2026-FAKE-00[12]'"
PFARREI = {
    "haushaltsjahr": 2026,
    "name": "Seniorentreff St. Albert",
    "anschrift": "Sieboldstraße 14, 97082 Würzburg",
    "bankverbindung": "Sparkasse Mainfranken Würzburg",
    "iban": "DE89 3704 0044 0532 0130 00",  # DE89370400440532013000
    "bic": "COBADEFFXXX",
    "ansprechpartner": "Pfarrer Michael KleinTest",
    "telefon": "0931 78403-0",
    "email": "seniorentreff@pfarrei-st-albert.de",
    "traeger": "Katholische Kirchenstiftung St. Albert",
    "betriebskosten": "5.000,00 €",       # 5000.00 in DB
    "personalkosten": "18.400,00 €",      # 18400.00 in DB
    "raeume_vorhanden": "ja",
    "raeume_unentgeltlich": "nein",
    # DB-Feld miete_jahr_euro = 10.200 € (Jahresbetrag). Im Original-
    # PDF wird die MONATLICHE Miete abgefragt → 10200/12 = 850,00 €.
    # Der n8n-Prompt rechnet monatlich × 12 zurück.
    "miete": "850,00 €",
    "antragsdatum": "15.03.2026",         # 2026-03-15
    # Wochenplan (Anlage 1) — kath. Pfarrei: typisch Di/Do/So nach
    # Gottesdienst. Konsistent mit Fake_Belege/generate.py PFARREI
    # belegposition (Café/Spielenachmittag/Gymnastik), aber auf
    # die kirchliche Verankerung an Sonntag erweitert. Wochentage
    # nur die belegten (mo/di/mi/do/fr/sa/so), Rest bleibt im PDF
    # leer (Spaltennamen in DB: oeffnungszeit, angebot).
    "wochenplan": [
        # (wochentag_label, oeffnungszeit, angebot)
        ("Dienstag",   "09:30 – 11:30",  "Offener Treff, Kaffee, Gespräche"),
        ("Donnerstag", "14:00 – 17:00",  "Seniorengymnastik mit Frau EberleinTest"),
        ("Sonntag",    "10:30 – 12:00",  "Kirchencafé nach dem Gottesdienst"),
    ],
}

BUERGERVEREIN = {
    "haushaltsjahr": 2026,
    "name": "Senioren-Stammtisch Frauenland",
    "anschrift": "Rottendorfer Straße 56, 97074 Würzburg",
    "bankverbindung": "VR-Bank Würzburg",
    "iban": "DE87 7909 0000 0010 1010 10",  # DE87790900000010101010
    "bic": "GENODEF1WU1",
    "ansprechpartner": "Dr. Helga MertensTest (1. Vorsitzende)",
    "telefon": "0931 70402-12",
    "email": "vorstand@buergerverein-frauenland.de",
    "traeger": "Bürgerverein Frauenland e.V.",
    "betriebskosten": "2.400,00 €",       # 2400.00 in DB
    "personalkosten": "10.200,00 €",      # 10200.00 in DB
    "raeume_vorhanden": "ja",
    "raeume_unentgeltlich": "ja",
    "miete": "",                           # 0 in DB → Feld leer (unentgeltlich)
    "antragsdatum": "22.03.2026",         # 2026-03-22
    # Wochenplan (Anlage 1) — Bürgerverein: typisch Mittwoch +
    # Samstag (Wochenende-Schwerpunkt für Berufstätige/Familien).
    # Konsistent mit dem Hauptantrag (Café + Gedächtnistraining +
    # monatlicher Frühstückstreff).
    "wochenplan": [
        ("Mittwoch", "15:00 – 17:30", "Offener Treff + Gedächtnistraining (14-tägig)"),
        ("Samstag",  "10:00 – 12:00", "Frühstückstreff (1. Samstag im Monat)"),
    ],
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


# ──────────────────────────────────────────────────────────────────────
# Anlage 1 — Wochenplan (separate PDF, separates Layout)
# ──────────────────────────────────────────────────────────────────────
#
# Layout angelehnt an materialien/anlage-antrag-apl2.pdf:
#   - „Beratungsstelle für Senioren" (Titel, fett, zentriert)
#   - „Anlage 1 zum Antrag auf Zuschuss Altentagesstätten- Betriebs-
#     und Personalkostenzuschüsse - APL 2"
#   - Haushaltsjahr-Feld
#   - Träger-Feld
#   - Tabelle Wochentag × Öffnungszeiten × Angebot (alle 7 Tage)
#
# Die Tabelle enthält IMMER alle 7 Wochentage; nur die im wochenplan-
# dict gelisteten Tage erhalten Werte, die restlichen Zeilen bleiben
# leer (genau wie im Original-PDF-Formular).

WOCHENTAGE_REIHENFOLGE = [
    "Montag", "Dienstag", "Mittwoch", "Donnerstag",
    "Freitag", "Samstag", "Sonntag",
]


def generate_anlage1(daten: dict, out: Path, *, handschrift: bool):
    """Schreibt die Anlage-1-PDF (Wochenplan)."""
    value_font = "Helvetica"
    if handschrift:
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
            value_font = "Helvetica-Oblique"

    c = canvas.Canvas(str(out), pagesize=A4)
    c.setTitle(f"Anlage 1 — Wochenplan — {daten['name']}")

    # Kopf
    y = PAGE_H - 30 * mm
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(PAGE_W / 2, y, "Beratungsstelle für Senioren")
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(
        PAGE_W / 2, y,
        "Anlage 1 zum Antrag auf Zuschuss Altentagesstätten- "
        "Betriebs- und Personalkostenzuschüsse - APL 2",
    )
    y -= 18 * mm

    # Haushaltsjahr (Label + Box)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN_X + 40 * mm, y, "Haushaltsjahr")
    c.rect(MARGIN_X + 80 * mm, y - 3 * mm, 30 * mm, 8 * mm)
    c.setFont(value_font, 11)
    c.drawString(MARGIN_X + 84 * mm, y, str(daten["haushaltsjahr"]))
    y -= 14 * mm

    # Träger (Label + breite Box)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN_X, y, "Träger:")
    c.rect(MARGIN_X + 22 * mm, y - 3 * mm, 130 * mm, 8 * mm)
    c.setFont(value_font, 10)
    c.drawString(MARGIN_X + 24 * mm, y, daten["traeger"])
    y -= 16 * mm

    # Wochenplan-Tabelle
    col_tag_w = 32 * mm
    col_zeit_w = 40 * mm
    col_angebot_w = 88 * mm
    row_h = 11 * mm

    # Header-Zeile
    c.setFont("Helvetica-Bold", 10)
    c.rect(MARGIN_X, y - row_h + 4 * mm, col_tag_w, row_h)
    c.rect(MARGIN_X + col_tag_w, y - row_h + 4 * mm, col_zeit_w, row_h)
    c.rect(MARGIN_X + col_tag_w + col_zeit_w, y - row_h + 4 * mm,
           col_angebot_w, row_h)
    c.drawString(MARGIN_X + 2 * mm, y, "Wochentag")
    c.drawString(MARGIN_X + col_tag_w + 2 * mm, y, "Öffnungszeiten")
    c.drawString(
        MARGIN_X + col_tag_w + col_zeit_w + 2 * mm, y, "Angebot",
    )
    y -= row_h

    # Wochenplan in dict für O(1)-Lookup
    plan_dict = {tag: (zeit, angebot)
                 for (tag, zeit, angebot) in daten.get("wochenplan", [])}

    for tag in WOCHENTAGE_REIHENFOLGE:
        # 3 Zellen pro Zeile
        c.rect(MARGIN_X, y - row_h + 4 * mm, col_tag_w, row_h)
        c.rect(MARGIN_X + col_tag_w, y - row_h + 4 * mm, col_zeit_w, row_h)
        c.rect(MARGIN_X + col_tag_w + col_zeit_w, y - row_h + 4 * mm,
               col_angebot_w, row_h)
        # Wochentag-Label immer maschinell (Original-Formular hat
        # die Labels vorgedruckt — Bürger füllt nur die rechten
        # beiden Spalten aus).
        c.setFont("Helvetica", 10)
        c.drawString(MARGIN_X + 2 * mm, y, tag)
        # Werte: nur wenn im Plan vorhanden
        if tag in plan_dict:
            zeit, angebot = plan_dict[tag]
            c.setFont(value_font, 10)
            c.drawString(MARGIN_X + col_tag_w + 2 * mm, y, zeit)
            c.drawString(
                MARGIN_X + col_tag_w + col_zeit_w + 2 * mm, y, angebot,
            )
        y -= row_h

    c.showPage()
    c.save()
    print(f"  ✓ {out.name}")


def main():
    out_dir = HERE
    out_dir.mkdir(exist_ok=True)
    print("Generiere Demo-PDFs für UE0 …")
    print(" Hauptantrag:")
    generate(PFARREI, out_dir / "demo-antrag-pfarrei-st-albert.pdf",
             handschrift=False)
    generate(BUERGERVEREIN, out_dir / "demo-antrag-buergerverein-handschrift.pdf",
             handschrift=True)
    print(" Anlage 1 (Wochenplan):")
    generate_anlage1(
        PFARREI, out_dir / "demo-anlage1-pfarrei-st-albert.pdf",
        handschrift=False,
    )
    generate_anlage1(
        BUERGERVEREIN, out_dir / "demo-anlage1-buergerverein-handschrift.pdf",
        handschrift=True,
    )
    print("Fertig.")


if __name__ == "__main__":
    main()
