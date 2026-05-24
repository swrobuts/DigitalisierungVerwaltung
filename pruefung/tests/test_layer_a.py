"""Layer A Tests — strukturelle Validierung aller PDF-Pflichtfelder
(Migration 048-Voll-Sync, Layer-A-Erweiterung im Final-Sweep 2026-05-24).
"""
from pruefung.layer_a_strukturell import check_strukturell


def _antrag_vollstaendig(**overrides) -> dict:
    """Default-Antrag mit allen Pflichtfeldern korrekt belegt — Tests
    overriden punktuell. Reflektiert die View `antrag_mit_summen`."""
    base = {
        "antragsnummer": "APL2-2026-X-1",
        "name": "Altentagesstätte Beispiel",
        "traeger": "Trägerverein e.V.",
        "strasse": "Karmelitenstraße",
        "hausnummer": "43",
        "plz": "97070",
        "ort": "Würzburg",
        "bankverbindung": "Sparkasse Mainfranken",
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "ansprechpartner": "Maria Mustermann",
        "telefon": "0931 1234567",
        "email": "kontakt@traegerverein.de",
        "raeume_vorhanden": "ja",
        "raeume_unentgeltlich": "nein",
        "antragsdatum": "2026-03-15",
        "haushaltsjahr": 2026,
        "betriebskosten_vorjahr_euro": 5000,
        "personalkosten_vorjahr_euro": 12000,
    }
    base.update(overrides)
    return base


def test_alle_pflichten_ok():
    befunde = check_strukturell(_antrag_vollstaendig())
    assert befunde == [], f"Befunde unerwartet: {befunde}"


def test_iban_kaputt_meldet_verstoss():
    b = check_strukturell(_antrag_vollstaendig(iban="ABC"))
    assert any(x.feld == "iban" and x.schwere == "verstoss" and x.layer == "A" for x in b)


def test_plz_5_ziffern_pflicht():
    b = check_strukturell(_antrag_vollstaendig(plz="abc"))
    assert any(x.feld == "plz" for x in b)


def test_email_ungueltig():
    b = check_strukturell(_antrag_vollstaendig(email="nichts"))
    assert any(x.feld == "email" for x in b)


def test_haushaltsjahr_ausserhalb_range():
    b = check_strukturell(_antrag_vollstaendig(haushaltsjahr=2018))
    assert any(x.feld == "haushaltsjahr" for x in b)


def test_iban_at_gueltig():
    """AT-IBAN muss auch durchgehen (nicht nur DE)."""
    b = check_strukturell(_antrag_vollstaendig(iban="AT611904300234573201"))
    assert not any(x.feld == "iban" for x in b)


def test_iban_mit_whitespace_akzeptiert():
    """User tippt 'DE89 3704 0044 0532 0130 00' — soll trotzdem valide sein."""
    b = check_strukturell(_antrag_vollstaendig(iban="DE89 3704 0044 0532 0130 00"))
    assert not any(x.feld == "iban" for x in b)


def test_antragsnummer_fehlt():
    b = check_strukturell(_antrag_vollstaendig(antragsnummer=""))
    assert any(x.feld == "antragsnummer" for x in b)


# ────────── Neue Pflichtfeld-Checks (Final-Sweep 2026-05-24) ──────────

def test_name_fehlt():
    b = check_strukturell(_antrag_vollstaendig(name=""))
    assert any(x.feld == "name" for x in b)


def test_traeger_fehlt():
    b = check_strukturell(_antrag_vollstaendig(traeger=None))
    assert any(x.feld == "traeger" for x in b)


def test_anschrift_strasse_fehlt():
    b = check_strukturell(_antrag_vollstaendig(strasse=""))
    assert any(x.feld == "strasse" for x in b)


def test_anschrift_hausnummer_fehlt():
    b = check_strukturell(_antrag_vollstaendig(hausnummer=""))
    assert any(x.feld == "hausnummer" for x in b)


def test_anschrift_ort_fehlt():
    b = check_strukturell(_antrag_vollstaendig(ort=""))
    assert any(x.feld == "ort" for x in b)


def test_bankverbindung_fehlt():
    b = check_strukturell(_antrag_vollstaendig(bankverbindung=""))
    assert any(x.feld == "bankverbindung" for x in b)


def test_bic_ungueltig_format():
    b = check_strukturell(_antrag_vollstaendig(bic="XYZ"))
    assert any(x.feld == "bic" for x in b)


def test_bic_8_und_11_zeichen_gueltig():
    assert not any(x.feld == "bic" for x in check_strukturell(_antrag_vollstaendig(bic="COBADEFF")))
    assert not any(x.feld == "bic" for x in check_strukturell(_antrag_vollstaendig(bic="COBADEFFXXX")))


def test_ansprechpartner_fehlt():
    b = check_strukturell(_antrag_vollstaendig(ansprechpartner=""))
    assert any(x.feld == "ansprechpartner" for x in b)


def test_telefon_fehlt():
    b = check_strukturell(_antrag_vollstaendig(telefon=""))
    assert any(x.feld == "telefon" for x in b)


def test_raeume_vorhanden_kein_ja_nein():
    b = check_strukturell(_antrag_vollstaendig(raeume_vorhanden="vielleicht"))
    assert any(x.feld == "raeume_vorhanden" for x in b)


def test_raeume_unentgeltlich_fehlt():
    b = check_strukturell(_antrag_vollstaendig(raeume_unentgeltlich=None))
    assert any(x.feld == "raeume_unentgeltlich" for x in b)


def test_antragsdatum_fehlt():
    b = check_strukturell(_antrag_vollstaendig(antragsdatum=None))
    assert any(x.feld == "antragsdatum" for x in b)


def test_keine_kostenposition_meldet_verstoss():
    """Wenn sowohl Betriebs- als auch Personalkosten 0 sind → Verstoss."""
    b = check_strukturell(_antrag_vollstaendig(
        betriebskosten_vorjahr_euro=0,
        personalkosten_vorjahr_euro=0,
    ))
    assert any(x.feld == "kostenpositionen" for x in b)


def test_nur_betriebskosten_ok():
    """Nur eine der beiden Kategorien > 0 reicht."""
    b = check_strukturell(_antrag_vollstaendig(
        betriebskosten_vorjahr_euro=5000,
        personalkosten_vorjahr_euro=0,
    ))
    assert not any(x.feld == "kostenpositionen" for x in b)
