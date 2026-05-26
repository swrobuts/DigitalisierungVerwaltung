"""Layer A — strukturelle Pflichtfeld- und Format-Prüfung, FB-aware via Plugin.

Pflichtfelder kombinieren den gemeinsamen Antragsteller-Block aus
apl.antraege mit FB-spezifischen Pflichtfeldern aus dem jeweiligen
FB-Plugin (pruefung.foerderbereiche.plugin_for(fb_id)).

Die Plugin-Pflichtfelder werden nach folgendem Schema aufgelöst:
1. zuerst `antrag[feld]` (gemeinsame Antragsteller-Felder)
2. dann `antrag["fb_details"][feld]` (FB-spezifische Felder)

So müssen die Plugin-Listen nicht zwischen apl.antraege- und
fb_*-Spalten unterscheiden — Layer A tut das transparent.
"""
from __future__ import annotations

import re
from typing import Any

from pruefung.foerderbereiche import plugin_for
from pruefung.models import Befund


# ── Format-Validatoren ─────────────────────────────────────────────────


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
    """ISO 9362: 8 oder 11 Zeichen, Großbuchstaben/Ziffern."""
    s = re.sub(r"\s+", "", (s or "").upper())
    return bool(re.fullmatch(r"[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?", s))


def _is_valid_email(s: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", s or ""))


def _is_valid_plz(s: str) -> bool:
    return bool(re.fullmatch(r"\d{5}", s or ""))


# ── Pflichtfeld-Auflösung ─────────────────────────────────────────────


def _resolve(antrag: dict[str, Any], feld: str) -> Any:
    """Sucht Feld zuerst top-level, dann in fb_details.

    Ermöglicht, dass Plugin-Pflichtfeld-Listen apl.antraege- und
    fb_*-Spalten ohne Pfad-Prefix mischen können.
    """
    if "." in feld:
        # Explizit qualifizierter Pfad (z.B. 'fb_details.projekt_titel')
        cur: Any = antrag
        for part in feld.split("."):
            if isinstance(cur, dict):
                cur = cur.get(part)
            else:
                return None
        return cur
    if feld in antrag:
        return antrag[feld]
    details = antrag.get("fb_details") or {}
    return details.get(feld)


def _is_present(value: Any) -> bool:
    """Wert ist „vorhanden" (Pflichtfeld erfüllt). Leerer String / leere
    Liste / leeres Dict / None gelten als fehlend."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


# ── Plugin-Pflichtfeld-Abfrage ────────────────────────────────────────


def _plugin_pflichtfelder(plugin, antrag: dict[str, Any]) -> list[str]:
    """Holt Pflichtfeld-Liste vom Plugin, FB-III ggf. mit Variante."""
    if plugin is None:
        return []
    if plugin.fb_id == "III":
        variante = (antrag.get("fb_details") or {}).get("variante")
        return plugin.get_pflicht_felder(variante=variante)
    return plugin.get_pflicht_felder()


# ── Haupt-Check ───────────────────────────────────────────────────────


def check_strukturell(antrag: dict[str, Any]) -> list[Befund]:
    """Liefert Befunde mit layer='A'. Leere Liste = strukturell OK.

    Ablauf:
    1) Pflichtfelder vom FB-Plugin holen (kombiniert apl.antraege + fb_*)
    2) Jedes Pflichtfeld via _resolve in `antrag` ODER `antrag.fb_details`
       suchen — fehlt es: Verstoss
    3) Generische Format-Checks für IBAN / BIC / PLZ / E-Mail
    """
    befunde: list[Befund] = []
    fb = antrag.get("foerderbereich")
    plugin = None
    if fb:
        try:
            plugin = plugin_for(fb)
        except ValueError:
            befunde.append(Befund(
                schwere="verstoss", layer="A", feld="foerderbereich",
                beschreibung=f"Unbekannter Förderbereich: {fb!r}",
            ))

    # 1+2) Pflichtfelder per Plugin
    pflicht = _plugin_pflichtfelder(plugin, antrag)
    for feld in pflicht:
        value = _resolve(antrag, feld)
        if not _is_present(value):
            # Befund-Feld qualifiziert anzeigen, wenn das Feld aus fb_details kommt
            in_details = feld not in antrag and (
                isinstance(antrag.get("fb_details"), dict)
                and feld in (antrag.get("fb_details") or {})
            )
            label = (
                f"fb_details.{feld}" if (in_details or _looks_like_fb_field(feld))
                else feld
            )
            befunde.append(Befund(
                schwere="verstoss", layer="A", feld=label,
                beschreibung=f"Pflichtfeld '{label}' fehlt (FB {fb}).",
            ))

    # 3) Format-Checks (nur wenn Wert vorhanden — Pflicht-Verstoss
    #    melden wir oben schon)
    iban = antrag.get("iban")
    if iban and not _is_valid_iban(iban):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="iban",
            beschreibung="IBAN ungültig (Format oder mod-97-Checksumme).",
            paragraph_ref="AHP 3.6 Auszahlung des Zuschusses",
        ))
    bic = antrag.get("bic")
    if bic and not _is_valid_bic(bic):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="bic",
            beschreibung="BIC ungültig (Format: 8 oder 11 Zeichen, A–Z/0–9).",
        ))
    plz = antrag.get("plz")
    if plz and not _is_valid_plz(plz):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="plz",
            beschreibung="PLZ muss aus 5 Ziffern bestehen.",
        ))
    email = antrag.get("email")
    if email and not _is_valid_email(email):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="email",
            beschreibung="E-Mail-Format ungültig.",
        ))

    # Haushaltsjahr-Plausibilität
    jahr = antrag.get("haushaltsjahr")
    if jahr is not None and not (isinstance(jahr, int) and 2020 <= jahr <= 2030):
        befunde.append(Befund(
            schwere="verstoss", layer="A", feld="haushaltsjahr",
            beschreibung="Haushaltsjahr außerhalb 2020–2030.",
        ))

    return befunde


_FB_DETAIL_FIELD_PATTERNS = (
    "projekt_titel", "personalkosten_euro", "sachkosten_euro",
    "ehrenamt_titel", "anzahl_helfer_vorjahr", "gesamt_helferstunden_vorjahr",
    "direkter_kontakt_senioren",
    "variante", "a_", "b_", "c_", "d_",
    "anlage_foerderbestaetigung_bund",
    "vorhaben_titel", "kurzbeschreibung", "dokument_path",
    "laufzeit", "stadtteil",
)


def _looks_like_fb_field(feld: str) -> bool:
    """Heuristik: Feld gehört zu fb_details (für Label-Qualifizierung)."""
    return any(feld == p or feld.startswith(p) for p in _FB_DETAIL_FIELD_PATTERNS)
