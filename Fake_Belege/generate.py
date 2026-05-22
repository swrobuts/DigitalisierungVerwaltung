"""Generator für realistische Fake-Antrags-Pakete (AHP APL 2).

Jedes Paket besteht aus:
- 01_antrag-deckblatt.pdf  — formularähnliches Deckblatt mit allen Antrag-Feldern
- 02_*.pdf                  — Beleg #1 (Mietvertrag oder Raum-unentgeltlich-Bescheinigung)
- 03_personalkosten.pdf     — Personalkosten-Übersicht
- 04_programm.pdf           — Programm-Wochenplan + Beschreibung
- antrag.json               — strukturierte Antragsdaten

Daneben wird `seed.sql` produziert: INSERTs für apl2.antraege +
apl2.belegposition + apl2.oeffnungszeit für alle 6 Pakete.

Aufruf (deterministisch):
    .venv/bin/python generate.py
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)

# ---------- IBAN-Helfer (mod-97) ----------

def compute_iban(country: str, bban: str) -> str:
    """Baut gültige IBAN aus Country-Code + BBAN."""
    rearranged = bban + country + "00"
    expanded = "".join(
        str(ord(c.upper()) - ord("A") + 10) if c.isalpha() else c
        for c in rearranged
    )
    check = 98 - (int(expanded) % 97)
    return f"{country}{check:02d}{bban}"


def break_iban(iban: str) -> str:
    """Flipt das letzte Zeichen — produziert ungültige IBAN für Fraud-Tests."""
    last = iban[-1]
    new = "1" if last != "1" else "2"
    return iban[:-1] + new


# ---------- Datenmodell ----------

@dataclass
class Belegpos:
    belegtyp: str   # 'miete' | 'personalkosten' | 'betriebskosten'
    bezeichnung: str
    betrag_euro: float


@dataclass
class Oeffnungszeit:
    wochentag: str   # 'mo'..'so'
    zeit: str | None
    angebot: str | None


@dataclass
class Paket:
    slug: str
    label: str
    erwartetes_ergebnis: str
    test_layer: str

    antrag_id: str
    name: str               # Einrichtungs-Name
    traeger: str            # Trägerverein/Org
    strasse: str
    hausnummer: str
    plz: str
    ort: str
    bankverbindung: str
    iban: str
    bic: str | None
    ansprechpartner: str
    telefon: str
    email: str
    haushaltsjahr: int
    raeume_vorhanden: str      # 'ja' | 'nein'
    raeume_unentgeltlich: str  # 'ja' | 'nein'
    antragsdatum: str          # YYYY-MM-DD
    # Beantragte Fördersumme in EUR — wird gegen AHP 2.3.2 (10.000 €/Jahr) geprüft.
    # None = nicht angegeben → Hinweis-Befund.
    geforderte_foerdersumme_euro: float | None

    belege: list[Belegpos]
    oeffnungszeiten: list[Oeffnungszeit]

    programm_titel: str
    programm_beschreibung: list[str]   # Absätze
    miet_objekt: str | None = None     # für Mietvertrag-Beleg
    vermieter: str | None = None
    miete_monat_euro: float | None = None
    raum_geber: str | None = None      # für Raum-unentgeltlich

    fraud_notes: list[str] = field(default_factory=list)
    # interne Felder für Belege:
    personal_positionen: list[tuple[str, str, float]] = field(default_factory=list)
    #                       (rolle, name, jahres_brutto)


# ---------- Pakete ----------

PAKETE: list[Paket] = [
    # ────────────────────────────────────────────────────────────────────
    Paket(
        slug="01_pfarrei-st-albert",
        label="Pfarrei St. Albert Heidingsfeld",
        erwartetes_ergebnis="✅ sauber — nur IBAN-Manuell-Hinweis (AHP 3.6)",
        test_layer="Negativ-Kontrolle",
        antrag_id=str(uuid.UUID("a1111111-1111-1111-1111-111111111111")),
        name="Seniorentreff St. Albert",
        traeger="Katholische Kirchenstiftung St. Albert",
        strasse="Sieboldstraße",
        hausnummer="14",
        plz="97082",
        ort="Würzburg",
        bankverbindung="Sparkasse Mainfranken Würzburg",
        iban=compute_iban("DE", "79050000" + "0301234567"),
        bic="BYLADEM1SWU",
        ansprechpartner="Pfarrer Michael KleinTest",
        telefon="0931 78403-0",
        email="seniorentreff@pfarrei-st-albert.de",
        haushaltsjahr=2026,
        raeume_vorhanden="ja",
        raeume_unentgeltlich="nein",
        antragsdatum="2026-03-15",
        geforderte_foerdersumme_euro=8500.00,
        miet_objekt="Pfarrsaal St. Albert, Erdgeschoss",
        vermieter="Bischöfliche Verwaltung Würzburg",
        miete_monat_euro=850.00,
        belege=[
            Belegpos("miete", "Miete Pfarrsaal St. Albert (12 Monate à 850 €)", 10200.00),
            Belegpos("personalkosten", "Sozialpädagogin Frau Sabine HofmannTest (Teilzeit 12h/Woche)", 18400.00),
            Belegpos("betriebskosten", "Strom, Heizung, Wasser anteilig", 3800.00),
            Belegpos("betriebskosten", "Versicherung, Reinigungsmaterial, Kaffee/Tee", 1200.00),
        ],
        oeffnungszeiten=[
            Oeffnungszeit("mo", "14:00 – 17:00", "Offener Treff, Kaffee"),
            Oeffnungszeit("mi", "14:00 – 17:00", "Spielenachmittag, Skat / Rommé"),
            Oeffnungszeit("fr", "14:00 – 17:00", "Seniorengymnastik mit Frau EberleinTest"),
        ],
        personal_positionen=[
            ("Sozialpädagogin (BPT 12 h/Wo)", "Sabine HofmannTest", 18400.00),
        ],
        programm_titel="Wöchentliches Programm Seniorentreff St. Albert",
        programm_beschreibung=[
            "Der Seniorentreff St. Albert ist ein niedrigschwelliges, offenes Angebot "
            "für Menschen ab 60 Jahren aus dem Stadtteil Heidingsfeld und Umgebung. "
            "Der Treff ist konfessionell offen — eine Mitgliedschaft in der Pfarrei "
            "ist ausdrücklich nicht erforderlich.",
            "Montags und mittwochs lädt das Café-Team zum offenen Treff mit Kaffee, "
            "Kuchen und Begegnung. Freitags leitet Frau EberleinTest (zertifizierte "
            "Übungsleiterin) die Seniorengymnastik in zwei altersgemischten Gruppen.",
            "Begleitend gibt es vierteljährliche Themennachmittage (Stadtgeschichte, "
            "Ernährung im Alter, digitale Teilhabe). Im Sommer findet ein "
            "gemeinsamer Tagesausflug statt, der über Eigenanteile finanziert wird.",
        ],
    ),

    # ────────────────────────────────────────────────────────────────────
    Paket(
        slug="02_buergerverein-frauenland",
        label="Bürgerverein Frauenland e.V.",
        erwartetes_ergebnis="✅ sauber — Räume unentgeltlich, nur IBAN-Manuell-Hinweis (AHP 3.6)",
        test_layer="Negativ-Kontrolle #2",
        antrag_id=str(uuid.UUID("a2222222-2222-2222-2222-222222222222")),
        name="Senioren-Stammtisch Frauenland",
        traeger="Bürgerverein Frauenland e.V.",
        strasse="Rottendorfer Straße",
        hausnummer="56",
        plz="97074",
        ort="Würzburg",
        bankverbindung="VR-Bank Würzburg",
        iban=compute_iban("DE", "79090000" + "0010101010"),
        bic="GENODEF1WU1",
        ansprechpartner="Dr. Helga MertensTest (1. Vorsitzende)",
        telefon="0931 70402-12",
        email="vorstand@buergerverein-frauenland.de",
        haushaltsjahr=2026,
        raeume_vorhanden="ja",
        raeume_unentgeltlich="ja",
        antragsdatum="2026-03-22",
        geforderte_foerdersumme_euro=4200.00,
        raum_geber="Stadt Würzburg / Sozialreferat — Stadtteilbüro Frauenland",
        belege=[
            Belegpos("personalkosten", "Honorar Kursleitung Gedächtnistraining (Frau EichingerTest)", 4800.00),
            Belegpos("personalkosten", "Honorar Bewegungsangebot (Herr SchäferTest, ÜL-B Sport)", 5400.00),
            Belegpos("betriebskosten", "Verbrauchsmaterial, Getränke, Bastel-/Spielmaterial", 1600.00),
            Belegpos("betriebskosten", "Anteilige Reinigung (Eigenleistung Verein)", 800.00),
        ],
        oeffnungszeiten=[
            Oeffnungszeit("di", "13:30 – 16:30", "Offener Treff + Gedächtnistraining (14-tägig)"),
            Oeffnungszeit("do", "13:30 – 16:30", "Bewegungsangebot + Café"),
            Oeffnungszeit("sa", "10:00 – 12:00", "Frühstückstreff (1. Sa/Monat)"),
        ],
        personal_positionen=[
            ("Honorarkraft Gedächtnistraining (40 €/h × 120 h)", "Renate EichingerTest", 4800.00),
            ("Honorarkraft Bewegungsangebot (45 €/h × 120 h)", "Thomas SchäferTest", 5400.00),
        ],
        programm_titel="Programm Senioren-Stammtisch Frauenland",
        programm_beschreibung=[
            "Der Senioren-Stammtisch Frauenland ist ein selbstorganisiertes "
            "Stadtteil-Angebot des Bürgervereins. Räume werden uns durch die "
            "Stadt Würzburg im Stadtteilbüro Frauenland unentgeltlich zur "
            "Verfügung gestellt. Aus diesem Grund werden keine Mietkosten "
            "geltend gemacht.",
            "Dienstags wechseln sich offener Treff und Gedächtnistraining im "
            "14-Tage-Rhythmus ab. Donnerstags findet ein leichtes Bewegungsangebot "
            "(funktionelles Training, Sturzprophylaxe) statt, gefolgt von gemeinsamem "
            "Kaffeetrinken.",
            "Am ersten Samstag jeden Monats bieten wir einen Frühstückstreff an, "
            "der speziell auch Alleinlebende anspricht.",
        ],
    ),

    # ────────────────────────────────────────────────────────────────────
    Paket(
        slug="03_awo-heidingsfeld",
        label="AWO-Begegnungsstätte Heidingsfeld",
        erwartetes_ergebnis="🟡 Layer-A-Verstoß: IBAN mod-97-ungültig (Bezug AHP 3.6)",
        test_layer="A",
        antrag_id=str(uuid.UUID("a3333333-3333-3333-3333-333333333333")),
        name="AWO-Begegnungsstätte Heidingsfeld",
        traeger="Arbeiterwohlfahrt Kreisverband Würzburg e.V.",
        strasse="Klingenstraße",
        hausnummer="11",
        plz="97084",
        ort="Würzburg",
        bankverbindung="Sparkasse Mainfranken Würzburg",
        # Layer-A-Trigger: IBAN ist mod-97-ungültig (letzte Ziffer geflippt)
        iban=break_iban(compute_iban("DE", "79050000" + "0102030405")),
        bic="BYLADEM1SWU",
        ansprechpartner="Frau Beate KornTest (Einrichtungsleitung)",
        telefon="0931 88044-23",
        email="heidingsfeld@awo-wuerzburg.de",
        haushaltsjahr=2026,
        raeume_vorhanden="ja",
        raeume_unentgeltlich="nein",
        antragsdatum="2026-03-25",
        geforderte_foerdersumme_euro=9800.00,
        miet_objekt="EG-Räume Klingenstraße 11 (ca. 95 m²)",
        vermieter="Wohnungsgenossenschaft Heidingsfeld eG",
        miete_monat_euro=620.00,
        belege=[
            Belegpos("miete", "Kaltmiete 12 × 620 €", 7440.00),
            Belegpos("personalkosten", "Fachkraft soziale Arbeit (Teilzeit 18h/Woche)", 26800.00),
            Belegpos("betriebskosten", "Nebenkosten Heizung/Strom/Wasser (Vorauszahlung)", 3120.00),
            Belegpos("betriebskosten", "Versicherung, Telekom, Hygiene", 980.00),
        ],
        oeffnungszeiten=[
            Oeffnungszeit("mo", "10:00 – 16:00", "Mittagstisch + offener Treff"),
            Oeffnungszeit("mi", "10:00 – 16:00", "Mittagstisch + Beratung"),
            Oeffnungszeit("do", "13:00 – 17:00", "Themen-Café"),
            Oeffnungszeit("fr", "10:00 – 14:00", "Mittagstisch"),
        ],
        personal_positionen=[
            ("Sozialarbeiterin (BPT 18 h/Wo)", "Beate KornTest", 26800.00),
        ],
        programm_titel="Programm AWO-Begegnungsstätte Heidingsfeld",
        programm_beschreibung=[
            "Die AWO-Begegnungsstätte Heidingsfeld bietet ein verlässliches "
            "tages-strukturierendes Angebot mit Schwerpunkt Mittagstisch (3 Tage/Woche), "
            "Beratungssprechstunden und themenoffenem Café.",
            "Der Mittagstisch wird in Kooperation mit dem AWO-Catering bereitgestellt; "
            "Teilnehmende zahlen einen Eigenanteil von 5,50 €.",
            "Donnerstags-Café behandelt wechselnde Themen: Vorsorgevollmacht, "
            "Wohnen im Alter, Mobilität, Digitale Sprechstunde.",
        ],
        fraud_notes=[
            "IBAN hat einen Zeichendreher (letztes Zeichen) — Layer A mod-97 soll triggern.",
        ],
    ),

    # ────────────────────────────────────────────────────────────────────
    Paket(
        slug="04_caritas-versbach",
        label="Caritas-Tagestreff Versbach",
        erwartetes_ergebnis="✅ sauber — 1 Öffnungstag/Wo ist auffällig, aber AHP nennt keine Mindestzahl",
        test_layer="Negativ-Kontrolle #3",
        antrag_id=str(uuid.UUID("a4444444-4444-4444-4444-444444444444")),
        name="Caritas-Tagestreff Versbach",
        traeger="Caritasverband für die Stadt und den Landkreis Würzburg e.V.",
        strasse="Versbacher Straße",
        hausnummer="142",
        plz="97078",
        ort="Würzburg",
        bankverbindung="LIGA Bank Regensburg",
        iban=compute_iban("DE", "75090300" + "0002400500"),
        bic="GENODEF1M05",
        ansprechpartner="Herr Stefan ReiserTest",
        telefon="0931 38664-50",
        email="versbach@caritas-wuerzburg.org",
        haushaltsjahr=2026,
        raeume_vorhanden="ja",
        raeume_unentgeltlich="nein",
        antragsdatum="2026-03-20",
        # Bewusst über AHP-Cap 10.000 €/Jahr (2.3.2) → Layer-B-Verstoß
        geforderte_foerdersumme_euro=12500.00,
        miet_objekt="Räume Kath. Pfarrgemeinde St. Burkard Versbach",
        vermieter="Kath. Pfarrgemeinde St. Burkard, Versbach",
        miete_monat_euro=380.00,
        belege=[
            Belegpos("miete", "Raumpauschale 12 × 380 €", 4560.00),
            # Layer-B-Trigger: 78.000 € Personalkosten bei nur 1 Öffnungstag/Woche
            Belegpos("personalkosten", "Einrichtungsleitung Vollzeit (Diplom-Sozialpädagogin)", 58000.00),
            Belegpos("personalkosten", "Hauswirtschafterin Teilzeit + Springer", 20000.00),
            Belegpos("betriebskosten", "Nebenkosten, Material, Versicherung", 2400.00),
        ],
        oeffnungszeiten=[
            # NUR ein Wochentag → 52 Öffnungstage/Jahr
            Oeffnungszeit("mi", "14:00 – 16:00", "Offener Treff"),
        ],
        personal_positionen=[
            ("Einrichtungsleitung Vollzeit (Dipl.-Sozialpäd., AVR-Caritas EG 8)", "Stefan ReiserTest", 58000.00),
            ("Hauswirtschaft Teilzeit + Springer-Pool", "Team (3 Personen)", 20000.00),
        ],
        programm_titel="Programm Caritas-Tagestreff Versbach",
        programm_beschreibung=[
            "Der Tagestreff Versbach öffnet derzeit nur einmal pro Woche "
            "(mittwochs 14–16 Uhr) wegen Personalengpässen bei der Hauswirtschaft. "
            "Es ist geplant, das Angebot 2026 wieder auf 3 Wochentage auszuweiten.",
            "Aktuell findet ein zweistündiger offener Treff mit Kaffee und "
            "wechselnden Kleingruppen-Angeboten (Gedächtnistraining, Singkreis) statt.",
        ],
        fraud_notes=[
            "Hohe Personalkosten (78.000 €) bei nur 1 Wochentag Öffnung erscheinen "
            "auffällig, aber die AHP-Förderrichtlinie nennt KEINE konkrete "
            "Personalkosten-Obergrenze und keine Mindest-Öffnungstage. Layer B "
            "darf hier nur HINWEISEN, nicht VERSTOSS deklarieren — sonst willkürlich.",
            "Lehrwert: zeigt, dass nicht jede Auffälligkeit automatisch ein Verstoß "
            "ist. Sachbearbeiter muss manuell prüfen, ob Personal/Öffnungstag-"
            "Verhältnis durch Sondersituation (z.B. Aufbauphase) gerechtfertigt ist.",
        ],
    ),

    # ────────────────────────────────────────────────────────────────────
    Paket(
        slug="05_diakonie-sanderau",
        label="Diakonie-Treff Sanderau",
        erwartetes_ergebnis="✅ sauber — Bingo/Tupperware sind in AHP nicht explizit verboten (vgl. fraud_notes)",
        test_layer="Lehrbeispiel: Lücke der Rechtsgrundlage",
        antrag_id=str(uuid.UUID("a5555555-5555-5555-5555-555555555555")),
        name="Diakonie-Treff Sanderau",
        traeger="Diakonisches Werk Würzburg e.V.",
        strasse="Wittelsbacherstraße",
        hausnummer="9",
        plz="97072",
        ort="Würzburg",
        bankverbindung="Evangelische Bank eG",
        iban=compute_iban("DE", "52060450" + "0001234567"),
        bic="GENODEF1EK1",
        ansprechpartner="Diakonin Anja VogtDemo",
        telefon="0931 80498-17",
        email="sanderau@diakonie-wuerzburg.de",
        haushaltsjahr=2026,
        raeume_vorhanden="ja",
        raeume_unentgeltlich="nein",
        antragsdatum="2026-03-18",
        geforderte_foerdersumme_euro=7500.00,
        miet_objekt="Gemeindezentrum Wittelsbacherstraße",
        vermieter="Evangelisch-Lutherische Kirchengemeinde Sanderau",
        miete_monat_euro=540.00,
        belege=[
            Belegpos("miete", "Miete Gemeindezentrum 12 × 540 €", 6480.00),
            Belegpos("personalkosten", "Diakonin (Teilzeit 15 h/Woche)", 22500.00),
            Belegpos("betriebskosten", "Nebenkosten, Versicherung", 3200.00),
        ],
        oeffnungszeiten=[
            Oeffnungszeit("mo", "14:00 – 17:00", "Offener Treff, Café"),
            Oeffnungszeit("mi", "18:30 – 21:30", "Bingo-Abend mit Geldgewinnen"),
            Oeffnungszeit("fr", "14:00 – 17:00", "Tupperware-Vorstellung / Verkaufsnachmittag (monatlich)"),
        ],
        personal_positionen=[
            ("Diakonin (BPT 15 h/Wo, TVöD SuE S8b)", "Anja VogtDemo", 22500.00),
        ],
        programm_titel="Programm Diakonie-Treff Sanderau",
        programm_beschreibung=[
            "Der Diakonie-Treff Sanderau bietet montags einen klassischen offenen "
            "Café-Treff. Schwerpunkt unseres erweiterten Programms 2026 ist jedoch "
            "der mittwöchliche Bingo-Abend mit Geldgewinnen — Hauptpreis bis zu "
            "500 € pro Abend, finanziert aus den Teilnahmegebühren (5 €/Karte). "
            "Wir gehen davon aus, dass dieses Format auch jüngere "
            "Senior:innen anzieht.",
            "Freitags wechseln wir uns mit externen Anbietern ab: Tupperware-"
            "Verkaufsveranstaltungen (Frau MüllerTest), Genuss-Reisevermittlung der "
            "Firma 'Senior-Trips GmbH' (provisionsbeteiligt) sowie ein "
            "kommerzieller Vortragsabend zu Kapitalanlagen im Alter, durchgeführt "
            "vom Finanzberater Herrn WagnerTest (Allfinanz WagnerTest & Partner).",
            "Diese Angebotsstruktur ermöglicht es uns, zusätzliche Einnahmen für "
            "den Treff zu generieren.",
        ],
        fraud_notes=[
            "Lehrbeispiel zur Lücke der Rechtsgrundlage: Bingo mit Geldgewinnen, "
            "Tupperware-Verkauf und kommerzielle Reisevermittlung sind inhaltlich "
            "klar gegen den Geist der Altenhilfe-Förderung — die AHP-Richtlinie "
            "2025-03-27 nennt aber KEINE expliziten Programminhalt-Verbote.",
            "Konsequenz: Layer C (RAG/Claude) findet keinen direkten Verstoß und "
            "ist damit ehrlich. Sachbearbeiter würde manuell auf SGB XII § 71 "
            "(Altenhilfe-Zweckbestimmung) oder Stadtrats-Beschluss zur AHP "
            "verweisen — das ist nicht maschinell prüfbar ohne erweiterte "
            "Wissensbasis. Lehrwert: zeigt Grenze des automatisierten Prüfens.",
        ],
    ),

    # ────────────────────────────────────────────────────────────────────
    Paket(
        slug="06_senioren-aktiv-gmbh",
        label='"Senioren-aktiv GmbH" (Fraud-Multi)',
        erwartetes_ergebnis="🔴 Multi-Verstoß: IBAN ungültig, Sitz nicht in Würzburg, Antragsfrist (1.4.) verpasst",
        test_layer="A + B (Sitz, Frist)",
        antrag_id=str(uuid.UUID("a6666666-6666-6666-6666-666666666666")),
        name="Senioren-aktiv Treffpunkt Würzburg",
        traeger="Senioren-aktiv GmbH",   # NICHT gemeinnützig
        # Geschäftssitz Nürnberg — Verstoß gegen AHP 3.1 'Sitz in der Stadt Würzburg'
        strasse="Nordstraße",
        hausnummer="12",
        plz="90439",
        ort="Nürnberg",
        bankverbindung="Commerzbank Nürnberg (Geschäftskonto)",
        iban=break_iban(compute_iban("DE", "79040047" + "0099887766")),
        bic="COBADEFFXXX",
        ansprechpartner="Klaus MüllerTest (Geschäftsführer)",
        telefon="0911 99887-66",
        email="k.mueller@senioren-aktiv-gmbh.de",
        haushaltsjahr=2026,
        raeume_vorhanden="ja",
        raeume_unentgeltlich="nein",
        # Verfristet: nach AHP 3.3 Frist 1. April des Antragsjahres
        antragsdatum="2026-04-15",
        # Bewusst weit über AHP-Cap 10.000 €/Jahr (2.3.2) → zusätzlicher Verstoß
        geforderte_foerdersumme_euro=15000.00,
        miet_objekt="Geschäftsräume Industriestraße 38, 1. OG",
        vermieter="Klaus MüllerTest Immobilien GmbH & Co. KG",   # GF-Familienunternehmen!
        miete_monat_euro=1850.00,
        belege=[
            Belegpos("miete", "Geschäftsmiete 12 × 1.850 € (Vermieter: MüllerTest Immobilien)", 22200.00),
            # Identische Beträge → Fraud-Indikator
            Belegpos("personalkosten", "Geschäftsführer-Bezug (Klaus MüllerTest)", 24000.00),
            Belegpos("personalkosten", "Beratungshonorar K. MüllerTest Consulting", 24000.00),
            Belegpos("personalkosten", "Aushilfen-Pauschalen (5 Personen á 4.800 €)", 24000.00),
            Belegpos("betriebskosten", "EDV-Lizenzen / SAP-Beratung MüllerTest Consulting", 6000.00),
        ],
        oeffnungszeiten=[
            # Nur ein Wochentag → wochenplan kaum vorhanden
            Oeffnungszeit("do", "14:00 – 16:00", "Info-Veranstaltung Kapitalanlagen 50+"),
        ],
        personal_positionen=[
            ("Geschäftsführer", "Klaus MüllerTest", 24000.00),
            ("Beratungshonorar (Eigenrechnung)", "Klaus MüllerTest Consulting", 24000.00),
            ("Aushilfen-Pauschalen", "5 × Mini-Job", 24000.00),
        ],
        programm_titel="Programm Senioren-aktiv Treffpunkt",
        programm_beschreibung=[
            "Senioren-aktiv GmbH bietet 50+-Bürger:innen Würzburgs eine moderne "
            "Anlauf­stelle zu Themen rund um die finanzielle Vorsorge im Alter.",
            "Donnerstags-Veranstaltung: Strukturvertriebsähnliches Format zu "
            "Investmentprodukten, Lebensversicherungen und Immobilien-Crowdfunding. "
            "Vortragende sind Vermittler:innen mit Provisionsanspruch.",
            "Weitere Programmpunkte: Premium-Reisevermittlung 'Silver Cruises', "
            "Kosmetik-Hausbesuche und Hörgeräte-Anpassungen vor Ort (Kooperation "
            "mit Allgemein-Akustik MüllerTest, einer Schwestergesellschaft).",
        ],
        fraud_notes=[
            "Maschinell prüfbar (AHP-belegt, Migration 024):",
            "  • Sitz nicht in Würzburg (PLZ 90439 Nürnberg) → Verstoß gegen AHP 3.1",
            "  • Antragsdatum 15.04.2026 > 01.04. → verfristet nach AHP 3.3",
            "  • IBAN ungültig (mod-97) → Verstoß gegen AHP 3.6",
            "Nicht maschinell prüfbar, aber pädagogisch relevant (für Sachbearbeiter):",
            "  • Träger ist GmbH (gewerblich) — AHP 3.1 nennt 'Wohlfahrtsverbände, "
            "Vereine, Stadtteilinitiativen', GmbH ist Auslegungsfrage",
            "  • Selbstkontrahierung: Miete an GF-Familienfirma (MüllerTest Immobilien)",
            "  • Drei Personalpositionen exakt à 24.000 € — Round-Number-Auffälligkeit",
            "  • Beratungshonorar an eigene Consulting-Firma",
            "  • Programm: Kapitalanlagen-Vermittlung — kein expliziter AHP-Verstoß",
        ],
    ),
]


# ---------- PDF-Bausteine ----------

STYLES = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=STYLES["Heading1"], fontSize=16, spaceAfter=12)
H2 = ParagraphStyle("h2", parent=STYLES["Heading2"], fontSize=12, spaceAfter=8)
BODY = ParagraphStyle("body", parent=STYLES["BodyText"], fontSize=10, leading=13)
SMALL = ParagraphStyle("small", parent=STYLES["BodyText"], fontSize=8, textColor=colors.grey)
LABEL = ParagraphStyle("label", parent=STYLES["BodyText"], fontSize=9, textColor=colors.grey)


def briefkopf(traeger: str, strasse: str, hausnummer: str, plz: str, ort: str) -> list:
    """Returnt Story-Fragmente für einen einfachen Briefkopf."""
    return [
        Paragraph(f"<b>{traeger}</b>", H2),
        Paragraph(f"{strasse} {hausnummer} · {plz} {ort}", SMALL),
        Spacer(1, 6 * mm),
    ]


def _doc(path: Path) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        str(path), pagesize=A4,
        topMargin=18 * mm, bottomMargin=18 * mm,
        leftMargin=22 * mm, rightMargin=22 * mm,
        title=path.stem,
    )


def euro(v: float) -> str:
    return f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


# ---------- Beleg-Typen ----------

WOCHENTAG_LABEL = {
    "mo": "Montag", "di": "Dienstag", "mi": "Mittwoch", "do": "Donnerstag",
    "fr": "Freitag", "sa": "Samstag", "so": "Sonntag",
}


def render_deckblatt(p: Paket, path: Path) -> None:
    """Antrag-Deckblatt — formularähnliches Layout mit allen Antrag-Feldern."""
    doc = _doc(path)
    story: list = []

    story.append(Paragraph("Antrag auf Zuschuss nach AHP — APL 2", H1))
    story.append(Paragraph("Altentagesstätten — Betriebs- und Personalkostenzuschüsse", SMALL))
    story.append(Paragraph(f"Stadt Würzburg · Sozialreferat · Haushaltsjahr {p.haushaltsjahr}", SMALL))
    story.append(Spacer(1, 6 * mm))

    # Block 1: Einrichtung
    story.append(Paragraph("1 — Einrichtung", H2))
    story.append(_kv_table([
        ("Bezeichnung der Einrichtung", p.name),
        ("Anschrift", f"{p.strasse} {p.hausnummer}, {p.plz} {p.ort}"),
        ("Räume vorhanden", p.raeume_vorhanden),
        ("Räume unentgeltlich überlassen", p.raeume_unentgeltlich),
    ]))
    story.append(Spacer(1, 4 * mm))

    # Block 2: Träger
    story.append(Paragraph("2 — Träger / Antragsteller", H2))
    story.append(_kv_table([
        ("Trägerverein / Organisation", p.traeger),
        ("Ansprechpartner/in", p.ansprechpartner),
        ("Telefon", p.telefon),
        ("E-Mail", p.email),
    ]))
    story.append(Spacer(1, 4 * mm))

    # Block 3: Bankverbindung
    story.append(Paragraph("3 — Bankverbindung", H2))
    story.append(_kv_table([
        ("Kreditinstitut", p.bankverbindung),
        ("IBAN", p.iban),
        ("BIC", p.bic or "—"),
    ]))
    story.append(Spacer(1, 4 * mm))

    # Block 4: Beantragte Fördersumme
    story.append(Paragraph("4 — Beantragte Fördersumme", H2))
    story.append(_kv_table([
        (
            "Geforderter Zuschuss (Jahr)",
            euro(p.geforderte_foerdersumme_euro) if p.geforderte_foerdersumme_euro else "—",
        ),
        (
            "Hinweis Förderhöchstgrenze",
            "AHP 2.3.2 Begegnungszentren: bis 10.000 € pro Jahr",
        ),
    ]))
    story.append(Spacer(1, 4 * mm))

    # Block 5: Kostenpositionen
    story.append(Paragraph("5 — Kostenpositionen (Jahresplanung)", H2))
    story.append(_belege_table(p.belege))
    story.append(Spacer(1, 4 * mm))

    # Block 6: Öffnungszeiten
    story.append(Paragraph("6 — Öffnungszeiten / Wochenplan", H2))
    story.append(_wochenplan_table(p.oeffnungszeiten))
    story.append(Spacer(1, 4 * mm))

    # Block 7: Unterschrift
    story.append(Paragraph("7 — Erklärung und Unterschrift", H2))
    story.append(Paragraph(
        "Die Antragstellerin/der Antragsteller versichert die Richtigkeit "
        "und Vollständigkeit der Angaben.",
        BODY,
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(_kv_table([
        ("Ort, Datum", f"{p.ort}, {p.antragsdatum}"),
        ("Unterschrift", f"[Stempel/Unterschrift {p.traeger}]"),
    ]))

    doc.build(story)


def render_mietvertrag(p: Paket, path: Path) -> None:
    doc = _doc(path)
    story: list = []
    story += briefkopf(p.vermieter or "Vermieter", "Sieboldstraße", "1", "97082", "Würzburg")

    story.append(Paragraph("Mietvertrag (Auszug)", H1))
    story.append(Paragraph(
        f"Zwischen <b>{p.vermieter}</b> (Vermieter) und <b>{p.traeger}</b> (Mieter) "
        f"wird für die Nutzung der Räumlichkeit "
        f"<b>{p.miet_objekt}</b> folgender Mietvertrag geschlossen:",
        BODY,
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(_kv_table([
        ("Mietobjekt", p.miet_objekt or ""),
        ("Mietzweck", f"Betrieb der Einrichtung „{p.name}“"),
        ("Mietzeit", f"01.01.{p.haushaltsjahr} – 31.12.{p.haushaltsjahr} (Verlängerung möglich)"),
        ("Monatliche Kaltmiete", euro(p.miete_monat_euro or 0.0)),
        ("Jahresmiete", euro((p.miete_monat_euro or 0.0) * 12)),
        ("Nebenkosten", "gemäß gesonderter Abrechnung (Strom, Heizung, Wasser)"),
        ("Kaution", euro((p.miete_monat_euro or 0.0) * 2)),
    ]))
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        f"Würzburg, den {p.antragsdatum} — [Stempel/Unterschrift Vermieter]   [Stempel/Unterschrift Mieter]",
        SMALL,
    ))
    doc.build(story)


def render_raum_unentgeltlich(p: Paket, path: Path) -> None:
    doc = _doc(path)
    story: list = []
    story += briefkopf(p.raum_geber or "Raumgeber", "Rathaus", "1", "97070", "Würzburg")

    story.append(Paragraph("Bescheinigung Raumüberlassung (unentgeltlich)", H1))
    story.append(Paragraph(
        f"Hiermit wird bescheinigt, dass dem <b>{p.traeger}</b> für den Betrieb "
        f"der Einrichtung „{p.name}“ Räumlichkeiten im "
        f"<b>{p.raum_geber}</b> dauerhaft und <b>unentgeltlich</b> "
        f"zur Verfügung gestellt werden.",
        BODY,
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(_kv_table([
        ("Nutzungszeitraum", f"01.01.{p.haushaltsjahr} – 31.12.{p.haushaltsjahr}"),
        ("Anzahl Räume", "1 Veranstaltungsraum + Sanitär + Küche"),
        ("Wöchentlicher Umfang", "ca. 12 Stunden gemäß Wochenplan"),
        ("Nebenkosten", "werden durch Raumgeber getragen"),
        ("Mietkosten", "0,00 € (unentgeltliche Überlassung)"),
    ]))
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        f"Würzburg, den {p.antragsdatum} — [Stempel/Unterschrift {p.raum_geber}]",
        SMALL,
    ))
    doc.build(story)


def render_personalkosten(p: Paket, path: Path) -> None:
    doc = _doc(path)
    story: list = []
    story += briefkopf(p.traeger, p.strasse, p.hausnummer, p.plz, p.ort)

    story.append(Paragraph("Personalkosten-Übersicht für den Antragszeitraum", H1))
    story.append(Paragraph(
        f"Einrichtung: <b>{p.name}</b> · Haushaltsjahr {p.haushaltsjahr}",
        BODY,
    ))
    story.append(Spacer(1, 4 * mm))

    rows = [["Rolle / Beschäftigungsverhältnis", "Name / Stelle", "Jahreskosten (brutto)"]]
    summe = 0.0
    for rolle, name, betrag in p.personal_positionen:
        rows.append([rolle, name, euro(betrag)])
        summe += betrag
    rows.append(["", "Summe Personalkosten", euro(summe)])

    tbl = Table(rows, colWidths=[75 * mm, 55 * mm, 35 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Die Angaben entsprechen den Lohn- und Honorarunterlagen des Trägers. "
        "Nachweise (Verträge, Lohnabrechnungen, Honorarrechnungen) können auf "
        "Anforderung vorgelegt werden.",
        SMALL,
    ))
    doc.build(story)


def render_programm(p: Paket, path: Path) -> None:
    doc = _doc(path)
    story: list = []
    story += briefkopf(p.traeger, p.strasse, p.hausnummer, p.plz, p.ort)

    story.append(Paragraph(p.programm_titel, H1))
    story.append(Paragraph(f"Einrichtung: <b>{p.name}</b>", BODY))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("Wochenplan", H2))
    story.append(_wochenplan_table(p.oeffnungszeiten))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Inhaltliche Beschreibung", H2))
    for absatz in p.programm_beschreibung:
        story.append(Paragraph(absatz, BODY))
        story.append(Spacer(1, 3 * mm))

    doc.build(story)


# ---------- Table-Helfer ----------

def _kv_table(rows: list[tuple[str, str]]) -> Table:
    tbl_data = [[Paragraph(k, LABEL), Paragraph(v, BODY)] for k, v in rows]
    tbl = Table(tbl_data, colWidths=[55 * mm, 110 * mm])
    tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


def _belege_table(belege: list[Belegpos]) -> Table:
    rows = [["Belegtyp", "Bezeichnung", "Betrag (Jahr)"]]
    summen: dict[str, float] = {}
    for b in belege:
        rows.append([b.belegtyp.capitalize(), b.bezeichnung, euro(b.betrag_euro)])
        summen[b.belegtyp] = summen.get(b.belegtyp, 0.0) + b.betrag_euro
    gesamt = sum(b.betrag_euro for b in belege)
    rows.append(["", "Summe Betriebs- + Personal- + Mietkosten", euro(gesamt)])

    tbl = Table(rows, colWidths=[30 * mm, 100 * mm, 35 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


def _wochenplan_table(zeiten: list[Oeffnungszeit]) -> Table:
    # Erst alle Tage zeigen, dann nur die definierten haben Werte
    by_tag = {z.wochentag: z for z in zeiten}
    rows = [["Tag", "Öffnungszeit", "Angebot"]]
    for tag in ["mo", "di", "mi", "do", "fr", "sa", "so"]:
        z = by_tag.get(tag)
        rows.append([
            WOCHENTAG_LABEL[tag],
            z.zeit if z and z.zeit else "—",
            z.angebot if z and z.angebot else "—",
        ])
    tbl = Table(rows, colWidths=[28 * mm, 38 * mm, 99 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


# ---------- SQL-Generator ----------

def _sql_escape(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("'", "''")
    return f"'{s}'"


def render_seed_sql(pakete: list[Paket], path: Path) -> None:
    lines: list[str] = []
    lines.append("-- Fake_Belege/seed.sql — 6 Antrag-Pakete für UE3-Prüfungs-Test.")
    lines.append("-- Generiert von Fake_Belege/generate.py — NICHT händisch editieren.")
    lines.append("-- Vorgehen: gegen apl2-Schema einspielen (truncate ist Voraussetzung).")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")
    lines.append("SET search_path TO apl2, public;")
    lines.append("")

    # ANTRAEGE
    lines.append("-- antraege")
    for idx, p in enumerate(pakete, start=1):
        antragsnummer = f"APL2-{p.haushaltsjahr}-FAKE-{idx:03d}"
        cols = [
            "id", "antragsnummer", "haushaltsjahr", "name", "traeger",
            "strasse", "hausnummer", "plz", "ort",
            "bankverbindung", "iban", "bic",
            "ansprechpartner", "telefon", "email",
            "raeume_vorhanden", "raeume_unentgeltlich",
            "antragsdatum", "geforderte_foerdersumme_euro",
            "submitted_language", "status",
        ]
        vals = [
            p.antrag_id, antragsnummer, p.haushaltsjahr, p.name, p.traeger,
            p.strasse, p.hausnummer, p.plz, p.ort,
            p.bankverbindung, p.iban, p.bic,
            p.ansprechpartner, p.telefon, p.email,
            p.raeume_vorhanden, p.raeume_unentgeltlich,
            p.antragsdatum, p.geforderte_foerdersumme_euro,
            "de", "eingegangen",
        ]
        lines.append(
            "INSERT INTO antraege (" + ", ".join(cols) + ") VALUES ("
            + ", ".join(_sql_escape(v) for v in vals) + ");"
        )
    lines.append("")

    # BELEGPOSITION
    lines.append("-- belegposition")
    for p in pakete:
        for b in p.belege:
            lines.append(
                "INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ("
                + ", ".join(_sql_escape(v) for v in [p.antrag_id, b.belegtyp, b.bezeichnung, b.betrag_euro])
                + ");"
            )
    lines.append("")

    # OEFFNUNGSZEIT
    lines.append("-- oeffnungszeit")
    for p in pakete:
        for z in p.oeffnungszeiten:
            lines.append(
                "INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ("
                + ", ".join(_sql_escape(v) for v in [p.antrag_id, z.wochentag, z.zeit, z.angebot])
                + ");"
            )
    lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def render_readme(pakete: list[Paket], path: Path) -> None:
    rows = []
    for idx, p in enumerate(pakete, start=1):
        rows.append(
            f"| {idx} | `{p.slug}` | {p.label} | {p.erwartetes_ergebnis} | {p.test_layer} |"
        )
    md = f"""# Fake_Belege — Test-Pakete für UE3 Prüfungs-Pipeline

Generator: `python generate.py` (idempotent, deterministische UUIDs).

## Pakete

| # | Slug | Träger | Erwartetes Prüfergebnis | Layer |
|---|---|---|---|---|
{chr(10).join(rows)}

## Verwendung

1. `Fake_Belege/.venv/bin/python generate.py` → erzeugt PDFs + `seed.sql`
2. `seed.sql` gegen Datenbank einspielen (truncate apl2.antraege ist Voraussetzung — Status `eingegangen`):
   ```bash
   ssh vps "docker exec -i supabase-db psql -U supabase_admin -d postgres" < seed.sql
   ```
3. GUI öffnen: https://amt-ki.butscher.cloud → 6 Anträge sichtbar → "Antrag prüfen" je Paket.

## Erwartete Befunde (nach Migration 024 — Ontologie aus echter AHP abgeleitet)

| # | Verstöße | Hinweise | Details |
|---|---|---|---|
| 1 Pfarrei St. Albert | 0 | 1 | nur IBAN-Manuell-Hinweis (AHP 3.6) |
| 2 Bürgerverein Frauenland | 0 | 1 | nur IBAN-Hinweis |
| 3 AWO Heidingsfeld | 1 | 1 | Layer-A IBAN-mod-97-Verstoß + IBAN-Hinweis |
| 4 Caritas Versbach | 0 | 1 | nur IBAN-Hinweis (1 Öffnungstag ist auffällig, aber kein AHP-Verstoß) |
| 5 Diakonie Sanderau | 0 | 1 | nur IBAN-Hinweis (Bingo/Tupperware sind in AHP nicht explizit verboten) |
| 6 Senioren-aktiv GmbH | 3 | 1 | IBAN ungültig + verfristet (AHP 3.3) + Sitz nicht Würzburg (AHP 3.1) |

### Aktive Ontologie-Regeln (alle mit AHP-Bezug)

| Regel | AHP-Bezug | Schwere |
|---|---|---|
| `traeger_sitz_wuerzburg` | 3.1 Antragsberechtigt | verstoss |
| `antragsfrist_1_april` | 3.3 Antragsfristen | verstoss |
| `mindestens_eine_kostenposition` | 2.4 Förderbereich IV / 3.2 b) | verstoss |
| `iban_auf_traegerkonto_pruefen` | 3.6 Auszahlung | hinweis (always-fire) |
| `haushaltsjahr_plausibel` | 3.7 Rechnungslegung | hinweis |

### Lehrwert der Pakete #4 + #5

Beide Pakete enthalten Auffälligkeiten, die ursprünglich als Layer-B/Layer-C-Verstöße
konstruiert waren — sich aber nach Abgleich mit der echten AHP-Richtlinie als **nicht
durch eine Rechtsnorm gedeckte Annahmen** herausgestellt haben:
- Caritas: 78.000 € Personalkosten bei 1 Wochentag-Öffnung — auffällig, aber AHP nennt
  keine Personalkosten-Grenze oder Mindest-Öffnungstage
- Diakonie: Bingo mit Geldgewinnen, Tupperware-Verkauf — semantisch fragwürdig, aber
  AHP 2025-03-27 enthält keine Programminhalt-Verbote

Das ist das pädagogische Lehrbeispiel: nicht jede Auffälligkeit ist ein Verstoß.
Layer C ist hier ehrlich (0 Befunde) statt willkürlich.

## Hinweis

Alle Namen, Adressen, IBAN-Empfänger, Steuernummern sind erfunden.
Die Pakete dienen ausschließlich der KI-Prüfungs-Validierung in Lehrkontext UE3.
"""
    path.write_text(md, encoding="utf-8")


# ---------- Main ----------

def main() -> None:
    base = Path(__file__).parent
    pakete_dir = base / "pakete"
    pakete_dir.mkdir(exist_ok=True)

    for p in PAKETE:
        pdir = pakete_dir / p.slug
        pdir.mkdir(exist_ok=True)

        # PDF 1: Antrag-Deckblatt
        render_deckblatt(p, pdir / "01_antrag-deckblatt.pdf")

        # PDF 2: Miete oder Raum-unentgeltlich
        if p.raeume_unentgeltlich == "ja":
            render_raum_unentgeltlich(p, pdir / "02_raum-unentgeltlich.pdf")
        else:
            render_mietvertrag(p, pdir / "02_mietvertrag.pdf")

        # PDF 3: Personalkosten
        render_personalkosten(p, pdir / "03_personalkosten.pdf")

        # PDF 4: Programm
        render_programm(p, pdir / "04_programm.pdf")

        # JSON-Sidecar
        sidecar = asdict(p)
        (pdir / "antrag.json").write_text(
            json.dumps(sidecar, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )

        print(f"  ✓ {p.slug}")

    render_seed_sql(PAKETE, base / "seed.sql")
    render_readme(PAKETE, base / "README.md")
    print("\n→ seed.sql + README.md generiert.")


if __name__ == "__main__":
    main()
