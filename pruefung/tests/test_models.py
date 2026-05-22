from pruefung.models import Befund, PruefungsErgebnis


def test_befund_minimal():
    b = Befund(schwere="verstoss", layer="A", feld="iban", beschreibung="ungültig")
    assert b.schwere == "verstoss"
    assert b.layer == "A"


def test_pruefungs_ergebnis_aggregiert():
    r = PruefungsErgebnis(
        befunde=[
            Befund(schwere="verstoss", layer="A", feld="iban", beschreibung="ungültig"),
            Befund(schwere="hinweis", layer="B", feld="personalkosten", beschreibung="hoch"),
        ],
        doctree_version="2025-03-27",
        duration_ms=123,
    )
    assert r.anzahl_verstoesse() == 1
    assert r.anzahl_hinweise() == 1
    assert r.pruefungsstatus() == "rueckfrage"


def test_pruefungs_status_ok_bei_null_verstoessen():
    r = PruefungsErgebnis(befunde=[
        Befund(schwere="hinweis", layer="B", beschreibung="x"),
    ])
    assert r.pruefungsstatus() == "ok"


def test_pruefungs_status_eskalation_ab_3_verstoessen():
    r = PruefungsErgebnis(befunde=[
        Befund(schwere="verstoss", layer="A", beschreibung="a"),
        Befund(schwere="verstoss", layer="A", beschreibung="b"),
        Befund(schwere="verstoss", layer="B", beschreibung="c"),
    ])
    assert r.pruefungsstatus() == "eskalation"
