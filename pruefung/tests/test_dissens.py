"""Tests für die Dissens-Berechnung Erst-KI vs. Zweit-KI.

Wichtig: 'unbeantwortet'-Einträge nur generieren, wenn die Zweit-KI
mindestens irgendetwas strukturiert beantwortet hat — sonst würde
Stille als Dissens missinterpretiert (siehe Bugfix-History).
"""
from pruefung.dissens import (
    berechne_dissens, dissens_zusammenfassung, hat_strukturierte_antwort,
)


def _erst_befunde() -> list[dict]:
    return [
        {"schwere": "verstoss", "beschreibung": "Verstoß A"},
        {"schwere": "hinweis", "beschreibung": "Hinweis B"},
        {"schwere": "verstoss", "beschreibung": "Verstoß C"},
    ]


def test_alle_bestaetigt_kein_dissens():
    zweit = {
        "bestaetigte_befunde": [
            {"erst_befund_index": 0}, {"erst_befund_index": 1}, {"erst_befund_index": 2},
        ],
        "widersprochene_befunde": [],
        "neue_befunde": [],
    }
    assert berechne_dissens(_erst_befunde(), zweit) == []


def test_widerspruch_wird_als_dissens_erkannt():
    zweit = {
        "bestaetigte_befunde": [{"erst_befund_index": 1}, {"erst_befund_index": 2}],
        "widersprochene_befunde": [{
            "erst_befund_index": 0,
            "begruendung": "Erstprüfer war zu streng",
            "alternative_schwere": "hinweis",
        }],
        "neue_befunde": [],
    }
    dissens = berechne_dissens(_erst_befunde(), zweit)
    assert len(dissens) == 1
    assert dissens[0]["art"] == "widerspruch"
    assert dissens[0]["erst_befund_index"] == 0
    assert "zu streng" in dissens[0]["begruendung"]


def test_neuer_befund_wird_als_dissens_erkannt():
    zweit = {
        "bestaetigte_befunde": [
            {"erst_befund_index": 0}, {"erst_befund_index": 1}, {"erst_befund_index": 2},
        ],
        "widersprochene_befunde": [],
        "neue_befunde": [{
            "schwere": "verstoss",
            "beschreibung": "Übersehener Verstoß D",
            "paragraph_ref": "AHP 3.5",
        }],
    }
    dissens = berechne_dissens(_erst_befunde(), zweit)
    assert len(dissens) == 1
    assert dissens[0]["art"] == "neuer_befund"
    assert dissens[0]["zweit"]["beschreibung"] == "Übersehener Verstoß D"


def test_unbeantwortet_wenn_zweit_andere_befunde_kommentiert_hat():
    # Wenn Zweit-KI mindestens etwas gesagt hat, aber einen Befund
    # ausgelassen, ist die Lücke aussagekräftig
    zweit = {
        "bestaetigte_befunde": [{"erst_befund_index": 0}],
        "widersprochene_befunde": [],
        "neue_befunde": [],
    }
    dissens = berechne_dissens(_erst_befunde(), zweit)
    arten = [d["art"] for d in dissens]
    assert arten.count("unbeantwortet") == 2  # Befund 1 und 2


def test_leere_zweit_antwort_erzeugt_keinen_dissens():
    # Wenn die Zweit-KI komplett still bleibt (JSON-Parser failed o.ä.),
    # sollen wir NICHT alle Erst-Befunde als 'unbeantwortet' brandmarken
    zweit = {
        "bestaetigte_befunde": [],
        "widersprochene_befunde": [],
        "neue_befunde": [],
        "gesamt_vorschlag": None,
    }
    assert berechne_dissens(_erst_befunde(), zweit) == []


def test_hat_strukturierte_antwort_erkennt_vorschlag_only():
    # Gesamt-Vorschlag ohne Einzel-Befunde gilt schon als strukturiert
    assert hat_strukturierte_antwort({"gesamt_vorschlag": "bewilligen"}) is True
    assert hat_strukturierte_antwort({}) is False


def test_dissens_zusammenfassung_zaehlt_korrekt():
    dissens = [
        {"art": "widerspruch"}, {"art": "widerspruch"},
        {"art": "neuer_befund"},
        {"art": "unbeantwortet"}, {"art": "unbeantwortet"},
    ]
    z = dissens_zusammenfassung(dissens)
    assert z == {"widersprueche": 2, "neue_befunde": 1, "unbeantwortet": 2, "gesamt": 5}
