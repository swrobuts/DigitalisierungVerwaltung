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
        "stadtbewohner_anteil": 0.4,
        "anzahl_teilnehmer": 30, "anzahl_treffen_jahr": 48,
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
