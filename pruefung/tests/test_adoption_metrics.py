"""Tests für die Adoption-Metriken (Übernahme-Quote KI vs. Mensch).

DB wird gemockt — wir validieren nur die Aggregations-Logik. Die
korrekte Klassifizierung in 'gesund' / 'automation_bias_verdacht' /
'ki_unzuverlaessig' ist wichtig fürs Dashboard-Signal.
"""
from unittest.mock import AsyncMock

import pytest

from pruefung.adoption_metrics import berechne_adoption


def _make_db(bescheide: list[dict], protokolle: list[dict]):
    """Liefert einen Mock-Client der auf select() je nach Tabelle antwortet."""
    db = AsyncMock()
    async def select(table: str, _query: str = "select=*"):
        if table == "bescheide":
            return bescheide
        if table == "pruefprotokoll":
            return protokolle
        return []
    db.select = select
    return db


def _empfehlung(aktion: str) -> dict:
    return {"empfehlung": {"aktion": aktion}}


@pytest.mark.asyncio
async def test_leeres_aggregat_bei_keinen_bescheiden():
    db = _make_db([], [])
    r = await berechne_adoption(db)
    assert r["anzahl_bescheide_gesamt"] == 0
    assert r["health"] == "keine_daten"


@pytest.mark.asyncio
async def test_gesunde_uebernahme_quote_zwischen_40_und_90():
    # 6 Bescheide, 4 gefolgt, 2 überstimmt = 66.7% → gesund
    bescheide = [
        {"id": f"b{i}", "entscheidung": "bewilligt", "pruefprotokoll_id": f"p{i}",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": 5000}
        for i in range(4)
    ] + [
        {"id": "b4", "entscheidung": "abgelehnt", "pruefprotokoll_id": "p4",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": None},
        {"id": "b5", "entscheidung": "abgelehnt", "pruefprotokoll_id": "p5",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": None},
    ]
    protokolle = [
        {"id": f"p{i}", "ergebnis_jsonb": _empfehlung("bewilligen")}
        for i in range(4)
    ] + [
        # Hier empfahl KI 'bewilligen', wurde aber abgelehnt → überstimmt
        {"id": "p4", "ergebnis_jsonb": _empfehlung("bewilligen")},
        {"id": "p5", "ergebnis_jsonb": _empfehlung("bewilligen")},
    ]
    r = await berechne_adoption(_make_db(bescheide, protokolle))
    assert r["anzahl_gefolgt"] == 4
    assert r["anzahl_ueberstimmt"] == 2
    assert 0.4 <= r["uebernahme_quote"] <= 0.9
    assert r["health"] == "gesund"


@pytest.mark.asyncio
async def test_automation_bias_verdacht_bei_ueber_90_prozent():
    # 10 Bescheide, 10 gefolgt = 100% → Verdacht
    bescheide = [
        {"id": f"b{i}", "entscheidung": "bewilligt", "pruefprotokoll_id": f"p{i}",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": 5000}
        for i in range(10)
    ]
    protokolle = [
        {"id": f"p{i}", "ergebnis_jsonb": _empfehlung("bewilligen")}
        for i in range(10)
    ]
    r = await berechne_adoption(_make_db(bescheide, protokolle))
    assert r["uebernahme_quote"] == 1.0
    assert r["health"] == "automation_bias_verdacht"


@pytest.mark.asyncio
async def test_ki_unzuverlaessig_bei_unter_40_prozent():
    # 5 Bescheide, 1 gefolgt = 20%
    bescheide = (
        [{"id": "b0", "entscheidung": "bewilligt", "pruefprotokoll_id": "p0",
          "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": 5000}]
        + [{"id": f"b{i}", "entscheidung": "abgelehnt", "pruefprotokoll_id": f"p{i}",
            "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": None}
           for i in range(1, 5)]
    )
    protokolle = [
        {"id": f"p{i}", "ergebnis_jsonb": _empfehlung("bewilligen")}
        for i in range(5)
    ]
    r = await berechne_adoption(_make_db(bescheide, protokolle))
    assert r["uebernahme_quote"] == 0.2
    assert r["health"] == "ki_unzuverlaessig"


@pytest.mark.asyncio
async def test_bescheide_ohne_pruefprotokoll_id_werden_separat_gezaehlt():
    bescheide = [
        {"id": "b1", "entscheidung": "bewilligt", "pruefprotokoll_id": None,
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": 5000},
    ]
    r = await berechne_adoption(_make_db(bescheide, []))
    assert r["anzahl_ohne_ki_empfehlung"] == 1
    assert r["anzahl_mit_ki_empfehlung"] == 0


@pytest.mark.asyncio
async def test_per_aktion_aufschluesselung():
    bescheide = [
        {"id": "b1", "entscheidung": "bewilligt", "pruefprotokoll_id": "p1",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": 5000},
        {"id": "b2", "entscheidung": "abgelehnt", "pruefprotokoll_id": "p2",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": None},
        {"id": "b3", "entscheidung": "abgelehnt", "pruefprotokoll_id": "p3",
         "ausgestellt_am": "2026-05-23", "bewilligte_summe_euro": None},
    ]
    protokolle = [
        {"id": "p1", "ergebnis_jsonb": _empfehlung("bewilligen")},   # gefolgt
        {"id": "p2", "ergebnis_jsonb": _empfehlung("ablehnen")},     # gefolgt
        {"id": "p3", "ergebnis_jsonb": _empfehlung("rueckfragen")},  # überstimmt
    ]
    r = await berechne_adoption(_make_db(bescheide, protokolle))
    assert r["per_aktion"]["bewilligen"] == {"gefolgt": 1, "ueberstimmt": 0}
    assert r["per_aktion"]["ablehnen"] == {"gefolgt": 1, "ueberstimmt": 0}
    assert r["per_aktion"]["rueckfragen"] == {"gefolgt": 0, "ueberstimmt": 1}
