"""Layer A — strukturelle Validierung (Defense-in-Depth, redundant zu Frontend).

Pflichtfelder gem. Migration 048 (PDF-Voll-Sync, Robert-Entscheidung
2026-05-24) — Layer A prüft die *strukturelle* Validität jedes
PDF-Pflichtfelds. Felder werden über das antrag-Dict aus der View
`antrag_mit_summen` reingereicht (siehe pruefung.main._fetch_antrag).
"""
import re
from pruefung.models import Befund


def _is_valid_iban(s: str) -> bool:
    """ISO 13616 mod-97. Akzeptiert Whitespace + Lower-Case."""
    s = re.sub(r"\s+", "", (s or "").upper())
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]+", s) or not 15 <= len(s) <= 34:
        return False
    rearranged = s[4:] + s[:4]
    numeric = "".join(c if c.isdigit() else str(ord(c) - 55) for c in rearranged)
    remainder = 0
    for c in numeric:
        remainder = (remainder * 10 + int(c)) % 97
    return remainder == 1


def _is_valid_bic(s: str) -> bool:
    """ISO 9362: 8 oder 11 Zeichen, Großbuchstaben/Ziffern. Whitespace tolerant."""
    s = re.sub(r"\s+", "", (s or "").upper())
    return bool(re.fullmatch(r"[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?", s))


def _is_valid_email(s: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", s or ""))


def _is_valid_plz(s: str) -> bool:
    return bool(re.fullmatch(r"\d{5}", s or ""))


def _is_non_empty(antrag: dict, key: str) -> bool:
    v = antrag.get(key)
    if v is None:
        return False
    if isinstance(v, str):
        return bool(v.strip())
    return True


def _check_text_field(
    antrag: dict, feld: str, label: str, paragraph_ref: str,
) -> Befund | None:
    """Hilfs-Funktion: meldet Verstoss wenn das Textfeld leer/None ist."""
    if _is_non_empty(antrag, feld):
        return None
    return Befund(
        schwere="verstoss", layer="A", feld=feld,
        beschreibung=f"{label} fehlt (Pflichtfeld).",
        paragraph_ref=paragraph_ref,
    )


def check_strukturell(antrag: dict) -> list[Befund]:
    """Liefert Befunde mit layer='A'. Leere Liste = strukturell OK.

    Erwartet `antrag` aus der View `apl.antrag_mit_summen`. Die View
    aggregiert die Kosten-Belegpositionen, daher prüfen wir
    betriebskosten/personalkosten direkt am Aggregat (`> 0`).

    TODO Phase 4A.2: apl.antrag_mit_summen existiert im neuen apl-Schema
    nicht (mehr). Ersatz ist apl.antrag_inbox (View) — diese hat aber
    andere Spalten (Antragsteller-Block + Status, keine Belegpositions-
    Summen). Die Strukturprüfung muss in Phase 4B auf die Plugin-Architektur
    umgestellt werden: Pflichtfelder kommen pro FB aus dem Plugin
    (siehe pruefung.foerderbereiche.<fb>.get_pflicht_felder).
    """
    befunde: list[Befund] = []

    # ── Antragsnummer (System-Pflicht, kein PDF-Feld) ─────────────
    if not (antrag.get("antragsnummer") or "").strip():
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="antragsnummer",
            beschreibung="Antragsnummer fehlt.",
            paragraph_ref="AHP 3.2 a) Antragstellung auf Formblättern",
        ))

    # ── Textfelder (PDF-Pflichtfelder gem. Migration 048) ─────────
    text_pflichten = [
        ("name",            "Name der Einrichtung",     "PDF Feld 2 Name"),
        ("traeger",         "Träger",                   "PDF Feld 4 Träger"),
        ("strasse",         "Straße",                   "PDF Feld 3 Anschrift"),
        ("hausnummer",      "Hausnummer",               "PDF Feld 3 Anschrift"),
        ("ort",             "Ort",                      "PDF Feld 3 Anschrift"),
        ("bankverbindung",  "Bankverbindung (Bankname)",
         "PDF Feld 5 — Verwaltungspraxis Sozialreferat"),
        ("ansprechpartner", "Ansprechpartner/in",
         "PDF Feld 8 — Verwaltungspraxis Sozialreferat"),
        ("telefon",         "Telefon / Handy",
         "PDF Feld 9 — Verwaltungspraxis Sozialreferat"),
    ]
    for feld, label, ref in text_pflichten:
        b = _check_text_field(antrag, feld, label, ref)
        if b is not None:
            befunde.append(b)

    # ── Format-Checks ─────────────────────────────────────────────
    if not _is_valid_iban(antrag.get("iban", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="iban",
            beschreibung="IBAN ungültig (Format oder mod-97-Checksumme).",
            paragraph_ref="AHP 3.6 Auszahlung des Zuschusses",
        ))

    # BIC: ist seit Migration 055 NOT NULL — strukturelle Validität dennoch prüfen.
    if not _is_valid_bic(antrag.get("bic", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="bic",
            beschreibung="BIC ungültig (Format: 8 oder 11 Zeichen, A–Z/0–9).",
            paragraph_ref="PDF Feld 7 — Verwaltungspraxis Sozialreferat",
        ))

    if not _is_valid_plz(antrag.get("plz", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="plz",
            beschreibung="PLZ muss aus 5 Ziffern bestehen.",
            paragraph_ref="PDF Feld 3 Anschrift",
        ))

    if not _is_valid_email(antrag.get("email", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="email",
            beschreibung="E-Mail-Format ungültig.",
            paragraph_ref="Verwaltungspraxis: Korrespondenz-Kanal (nicht AHP-explizit)",
        ))

    jahr = antrag.get("haushaltsjahr")
    if not (isinstance(jahr, int) and 2020 <= jahr <= 2030):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="haushaltsjahr",
            beschreibung="Haushaltsjahr außerhalb 2020–2030.",
            paragraph_ref="AHP 3.7 Rechnungsjahr (1.1.–31.12.)",
        ))

    # ── Räumlichkeiten (PDF Felder 13/14) ─────────────────────────
    for feld, label, ref in [
        ("raeume_vorhanden",     "Vorhandene Räumlichkeiten des Trägers",
         "PDF Feld 13 Räumlichkeiten"),
        ("raeume_unentgeltlich", "Unentgeltlich bereitgestellte Räume anderer Träger",
         "PDF Feld 14 Räumlichkeiten"),
    ]:
        v = antrag.get(feld)
        if v not in ("ja", "nein"):
            befunde.append(Befund(
                schwere="verstoss", layer="A", feld=feld,
                beschreibung=f"{label} muss 'ja' oder 'nein' sein.",
                paragraph_ref=ref,
            ))

    # ── Antragsdatum (PDF Feld 16 „Würzburg, [Datum]") ────────────
    if not _is_non_empty(antrag, "antragsdatum"):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="antragsdatum",
            beschreibung="Antragsdatum fehlt.",
            paragraph_ref="PDF Feld 16 Würzburg, [Datum]",
        ))

    # ── Kosten-Aggregate (PDF Felder 11/12 → belegposition-Summen) ─
    # Werte kommen aus der View `antrag_mit_summen` (Sum über belegposition).
    # Strukturell verlangen wir, dass MINDESTENS EINE der beiden
    # Kosten-Kategorien > 0 ist — die spezifische Layer-B-Regel
    # `mindestens_eine_kostenposition` macht denselben Check (Defense-in-Depth).
    try:
        bk = float(antrag.get("betriebskosten_vorjahr_euro") or 0)
    except (TypeError, ValueError):
        bk = 0.0
    try:
        pk = float(antrag.get("personalkosten_vorjahr_euro") or 0)
    except (TypeError, ValueError):
        pk = 0.0
    if bk <= 0 and pk <= 0:
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="kostenpositionen",
            beschreibung=(
                "Mindestens eine Kostenposition (Betriebskosten oder "
                "Personalkosten) muss > 0 sein."
            ),
            paragraph_ref="PDF Felder 11/12 — Nachgewiesene Kosten Vorjahr",
        ))

    return befunde
