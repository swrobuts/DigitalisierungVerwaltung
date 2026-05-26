"""Tests für vergleich_vorjahr auf dem neuen apl-Schema."""
from __future__ import annotations

import pytest

from pruefung.vergleich_vorjahr import vergleich_mit_vorjahr


class _FakeDb:
    def __init__(self, routes):
        self.routes = routes

    async def select(self, table, query):  # noqa: D401
        for t, qsubstr, rows in self.routes:
            if t == table and qsubstr in query:
                return list(rows)
        return []


@pytest.mark.asyncio
async def test_kein_vorjahres_antrag_returnt_leere_aenderungen():
    db = _FakeDb([
        ("antraege", "id=eq.x", [{
            "id": "x", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2026, "foerderbereich": "I",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
        ("antraege", "dachverband=eq.", []),
        ("antraege", "einrichtung=eq.", []),
    ])
    result = await vergleich_mit_vorjahr("x", db)
    assert result["vorjahr"] is None
    assert result["aenderungen"] == []


@pytest.mark.asyncio
async def test_fb_iv_vorjahresvergleich_meldet_hinweis():
    db = _FakeDb([
        ("antraege", "id=eq.x", [{
            "id": "x", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2026, "foerderbereich": "IV",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
        ("antraege", "dachverband=eq.", [{
            "id": "vy", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2025, "foerderbereich": "IV",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
    ])
    result = await vergleich_mit_vorjahr("x", db)
    namen = {a["feld"] for a in result["aenderungen"]}
    assert "_hinweis" in namen, f"Hinweis fehlt: {result['aenderungen']}"


@pytest.mark.asyncio
async def test_fb_i_summen_vergleich_kritisch():
    db = _FakeDb([
        ("antraege", "id=eq.x", [{
            "id": "x", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2026, "foerderbereich": "I",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
        ("antraege", "dachverband=eq.", [{
            "id": "vy", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2025, "foerderbereich": "I",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
        # vy zuerst routen (substring 'vy' nicht subset von 'x'),
        # damit die Reihenfolge passt:
        ("fb_i_projekt", "antrag_id=eq.vy", [{
            "personalkosten_euro": 1000, "sachkosten_euro": 0,
        }]),
        ("fb_i_projekt", "antrag_id=eq.x", [{
            "personalkosten_euro": 5000, "sachkosten_euro": 0,
        }]),
    ])
    result = await vergleich_mit_vorjahr("x", db)
    summen = [a for a in result["aenderungen"] if a["art"] == "numerisch"]
    assert summen and summen[0]["schwere"] == "kritisch"
    assert summen[0]["alt"] == 1000.0 and summen[0]["neu"] == 5000.0
