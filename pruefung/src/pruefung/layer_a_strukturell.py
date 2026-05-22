"""Layer A — strukturelle Validierung (Defense-in-Depth, redundant zu Frontend)."""
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


def _is_valid_email(s: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", s or ""))


def _is_valid_plz(s: str) -> bool:
    return bool(re.fullmatch(r"\d{5}", s or ""))


def check_strukturell(antrag: dict) -> list[Befund]:
    """Liefert Befunde mit layer='A'. Leere Liste = strukturell OK."""
    befunde: list[Befund] = []

    if not (antrag.get("antragsnummer") or "").strip():
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="antragsnummer",
            beschreibung="Antragsnummer fehlt.",
        ))

    if not _is_valid_iban(antrag.get("iban", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="iban",
            beschreibung="IBAN ungültig (Format oder mod-97-Checksumme).",
            paragraph_ref="AHP 3.6 Auszahlung des Zuschusses",
        ))

    if not _is_valid_plz(antrag.get("plz", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="plz",
            beschreibung="PLZ muss aus 5 Ziffern bestehen.",
        ))

    if not _is_valid_email(antrag.get("email", "") or ""):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="email",
            beschreibung="E-Mail-Format ungültig.",
        ))

    jahr = antrag.get("haushaltsjahr")
    if not (isinstance(jahr, int) and 2020 <= jahr <= 2030):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="haushaltsjahr",
            beschreibung="Haushaltsjahr außerhalb 2020–2030.",
        ))

    return befunde
