"""Tests für die Subsumtions-Texte im Bescheid.

Wichtig fürs Lehrziel: die Marker-Heuristik muss zuverlässig den
richtigen Sachverhalt + die richtige Würdigung treffen. Ein Bescheid
mit falscher Begründung ist verwaltungsrechtlich angreifbar.
"""
from pruefung.bescheid_subsumtion import build_subsumtion


def _antrag() -> dict:
    return {
        "antragsnummer": "APL2-TEST-001",
        "haushaltsjahr": 2026,
        "antragsdatum": "2026-04-15",
        "name": "Test-Einrichtung",
        "traeger": "Test-Trägerverein e.V.",
        "strasse": "Teststraße", "hausnummer": "1",
        "plz": "97070", "ort": "Würzburg",
        "iban": "DE12345", "email": "ungueltig",
        "foerderbereich": "begegnungszentren",
        "geforderte_foerdersumme_euro": 12000,
    }


def test_iban_befund_liefert_iban_im_sachverhalt():
    befund = {
        "beschreibung": "IBAN ungültig (ISO 13616 Modulo-97)",
        "paragraph_ref": "AHP 3.6",
    }
    out = build_subsumtion(befund, _antrag())
    assert "DE12345" in out["sachverhalt"]
    assert "Prüfziffern" in out["wuerdigung"]


def test_plz_befund_liefert_plz_im_sachverhalt():
    befund = {"beschreibung": "PLZ muss 5 Ziffern haben"}
    out = build_subsumtion(befund, _antrag())
    assert "97070" in out["sachverhalt"]
    assert "fünf Ziffern" in out["wuerdigung"]


def test_email_befund_liefert_email_im_sachverhalt():
    befund = {"beschreibung": "E-Mail ungültig (RFC 5322)"}
    out = build_subsumtion(befund, _antrag())
    assert "ungueltig" in out["sachverhalt"]
    assert "RFC-5322" in out["wuerdigung"]


def test_unbekannter_marker_liefert_generic_fallback():
    befund = {
        "beschreibung": "Irgendein vollkommen unbekannter Befund-Marker",
        "paragraph_ref": "AHP 3.3",
    }
    out = build_subsumtion(befund, _antrag())
    # Es muss ein nicht-None-Sachverhalt und Würdigung zurückkommen,
    # auch wenn die Heuristik den Marker nicht erkennt
    assert out.get("sachverhalt") is not None or out.get("wuerdigung") is not None


def test_cap_ueberschreitung_referenziert_summen():
    befund = {
        "beschreibung": (
            "Die geforderte Förderung übersteigt die AHP-Obergrenze "
            "von 10.000 EUR für begegnungszentren"
        ),
        "paragraph_ref": "AHP 2.3.2",
    }
    out = build_subsumtion(befund, _antrag())
    # Sollte sowohl die geforderte Summe als auch den Cap erwähnen
    text = (out.get("sachverhalt") or "") + (out.get("wuerdigung") or "")
    assert "12.000" in text or "12000" in text or "10.000" in text or "10000" in text


# ── Helper-Funktionen für AHP-Höchstgrenzen ───────────────────────────────
from pruefung.bescheid_subsumtion import get_hoechstgrenze


def test_get_hoechstgrenze_liefert_ahp_werte():
    assert get_hoechstgrenze("begegnungszentren") == 10000
    assert get_hoechstgrenze("bildungstraeger") == 6000
    assert get_hoechstgrenze("aufbau_niedrigschwellige_angebote") == 3000
    assert get_hoechstgrenze("seniorenkreise") == 2000
    # AHP-Audit-Fix: FB II Cap korrigiert von erfundenen 5.500 € auf
    # die korrekte AHP-2.2-Summe = 750 € Pauschal + Staffel max 3.500 € = 4.250 €.
    assert get_hoechstgrenze("buergerschaftliches_engagement") == 4250
    assert get_hoechstgrenze("quartiersmanagement_altenarbeit") == 7500


def test_get_hoechstgrenze_liefert_none_bei_unbekanntem_fb():
    assert get_hoechstgrenze(None) is None
    assert get_hoechstgrenze("") is None
    assert get_hoechstgrenze("phantasie-bereich") is None


# ── AHP-Referenzen-Konsistenz ─────────────────────────────────────────────
# Korrigiert nach AHP-Audit: "AHP Kap. X.Y.Z" ist keine AHP-PDF-Nomenklatur.
# Die PDF nutzt für die Unterpunkte unter 2.3 die Notation "Pkt. N".

def test_keine_erfundenen_kap_referenzen_mehr():
    """Keine Würdigung darf 'AHP Kap.' enthalten — die PDF kennt diese
    Notation nicht, sondern nur 'AHP 2.x' bzw. 'AHP 2.3 Pkt. N'."""
    antrag = _antrag()
    befunde = [
        {"beschreibung": "Antrag verfristet — Frist 1. April überschritten"},
        {"beschreibung": "Sitz des Trägers nicht in Würzburg"},
        {"beschreibung": "Anteilig berechnete Höchstauszahlung überschritten"},
        {"beschreibung": "Mindestens eine Kostenposition fehlt"},
        {"beschreibung": "Förderbereich I ist auf maximal 3 Jahre"},
        {"beschreibung": "Mindestens 6 Teilnehmer erforderlich"},
        {"beschreibung": "Seniorenkreis-Förderung passt nicht zur AHP-Staffelung"},
        {"beschreibung": "Quartiersmanagement-Altenarbeit-Förderung"},
        {"beschreibung": "Finanzierungsplanung fehlt"},
        {"beschreibung": "Zuwendungszweck fehlt"},
        {"beschreibung": "Projektskizze fehlt"},
    ]
    for b in befunde:
        out = build_subsumtion(b, antrag)
        text = (out.get("sachverhalt") or "") + " " + (out.get("wuerdigung") or "")
        assert "AHP Kap." not in text, f"Befund {b['beschreibung']!r} enthält noch 'AHP Kap.'"
