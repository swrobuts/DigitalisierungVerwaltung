from pruefung.layer_a_strukturell import check_strukturell


def test_alle_pflichten_ok():
    antrag = {
        "antragsnummer": "APL2-2026-X-1",
        "iban": "DE89370400440532013000",
        "plz": "97070",
        "email": "x@y.de",
        "haushaltsjahr": 2026,
    }
    befunde = check_strukturell(antrag)
    assert befunde == []


def test_iban_kaputt_meldet_verstoss():
    antrag = {
        "antragsnummer": "X", "iban": "ABC", "plz": "97070",
        "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert len(b) == 1
    assert b[0].schwere == "verstoss"
    assert b[0].layer == "A"
    assert b[0].feld == "iban"


def test_plz_5_ziffern_pflicht():
    antrag = {
        "antragsnummer": "X", "iban": "DE89370400440532013000",
        "plz": "abc", "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert any(x.feld == "plz" for x in b)


def test_email_ungueltig():
    antrag = {
        "antragsnummer": "X", "iban": "DE89370400440532013000",
        "plz": "97070", "email": "nichts", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert any(x.feld == "email" for x in b)


def test_haushaltsjahr_ausserhalb_range():
    antrag = {
        "antragsnummer": "X", "iban": "DE89370400440532013000",
        "plz": "97070", "email": "x@y.de", "haushaltsjahr": 2018,
    }
    b = check_strukturell(antrag)
    assert any(x.feld == "haushaltsjahr" for x in b)


def test_iban_at_gueltig():
    """AT-IBAN muss auch durchgehen (nicht nur DE)."""
    antrag = {
        "antragsnummer": "X", "iban": "AT611904300234573201",
        "plz": "97070", "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert not any(x.feld == "iban" for x in b)


def test_iban_mit_whitespace_akzeptiert():
    """User tippt 'DE89 3704 0044 0532 0130 00' — soll trotzdem valide sein."""
    antrag = {
        "antragsnummer": "X", "iban": "DE89 3704 0044 0532 0130 00",
        "plz": "97070", "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert not any(x.feld == "iban" for x in b)


def test_antragsnummer_fehlt():
    antrag = {
        "antragsnummer": "", "iban": "DE89370400440532013000",
        "plz": "97070", "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert any(x.feld == "antragsnummer" for x in b)
