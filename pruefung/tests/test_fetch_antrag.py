"""Tests für _fetch_antrag — Multi-FB-Schema (apl.antraege + fb_*-Details)."""
from __future__ import annotations

import pytest

from pruefung.main import _fetch_antrag


class _FakeDb:
    """Mini-Stub für SupabaseClient.select(table, query)."""

    def __init__(self, rows_by_table: dict[str, list[dict]]):
        self.rows_by_table = rows_by_table
        self.calls: list[tuple[str, str]] = []

    async def select(self, table: str, query: str) -> list[dict]:
        self.calls.append((table, query))
        return list(self.rows_by_table.get(table, []))


@pytest.mark.asyncio
async def test_fetch_antrag_fb_i_dispatcht_zu_projekt_tabelle():
    db = _FakeDb({
        "antraege": [{
            "id": "x", "foerderbereich": "I",
            "einrichtung": "Caritas", "haushaltsjahr": 2026,
            "dachverband": None, "iban": "DE89370400440532013000",
            "submitted_at": "2026-05-25T00:00:00Z",
        }],
        "fb_i_projekt": [{
            "antrag_id": "x", "projekt_titel": "Café",
            "personalkosten_euro": 18500, "sachkosten_euro": 4200,
            "laufzeit": "2026", "stadtteil": "Heuchelhof",
            "drittmittel_jsonb": [], "andere_mittel_jsonb": [],
        }],
    })
    antrag = await _fetch_antrag("x", db)
    assert antrag["foerderbereich"] == "I"
    assert antrag["fb_details"]["projekt_titel"] == "Café"
    assert antrag["fb_details"]["personalkosten_euro"] == 18500


@pytest.mark.asyncio
async def test_fetch_antrag_fb_ii_laedt_helferliste():
    db = _FakeDb({
        "antraege": [{
            "id": "y", "foerderbereich": "II", "einrichtung": "AWO",
        }],
        "fb_ii_ehrenamt": [{
            "antrag_id": "y", "ehrenamt_titel": "Besuchsdienst",
            "anzahl_helfer_vorjahr": 12,
            "gesamt_helferstunden_vorjahr": 800,
            "direkter_kontakt_senioren": True,
        }],
        "fb_ii_helfer": [
            {"position": 1, "name": "Müller", "vorname": "Anna"},
            {"position": 2, "name": "Schmidt", "vorname": "Bert"},
        ],
    })
    antrag = await _fetch_antrag("y", db)
    assert antrag["foerderbereich"] == "II"
    assert antrag["fb_details"]["ehrenamt_titel"] == "Besuchsdienst"
    assert len(antrag["fb_details"]["helfer"]) == 2


@pytest.mark.asyncio
async def test_fetch_antrag_fb_iii_variante_c():
    db = _FakeDb({
        "antraege": [{"id": "z", "foerderbereich": "III"}],
        "fb_iii_variante": [{
            "antrag_id": "z", "variante": "C",
            "c_treffen_schwelle": "GT_10",
            "c_teilnehmer_durchschnitt": 8,
        }],
    })
    antrag = await _fetch_antrag("z", db)
    assert antrag["fb_details"]["variante"] == "C"
    assert antrag["fb_details"]["c_treffen_schwelle"] == "GT_10"


@pytest.mark.asyncio
async def test_fetch_antrag_fb_iv_freitext():
    db = _FakeDb({
        "antraege": [{"id": "w", "foerderbereich": "IV"}],
        "fb_iv_freitext": [{
            "antrag_id": "w", "vorhaben_titel": "Senioren-Festival",
            "kurzbeschreibung": "Test", "dokument_path": "uploads/w.pdf",
        }],
    })
    antrag = await _fetch_antrag("w", db)
    assert antrag["fb_details"]["vorhaben_titel"] == "Senioren-Festival"
    assert antrag["fb_details"]["dokument_path"] == "uploads/w.pdf"


@pytest.mark.asyncio
async def test_fetch_antrag_404_bei_unbekannter_id():
    from fastapi import HTTPException
    db = _FakeDb({"antraege": []})
    with pytest.raises(HTTPException) as exc:
        await _fetch_antrag("missing", db)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_fetch_antrag_unbekannter_fb_hat_leere_details():
    db = _FakeDb({"antraege": [{"id": "u", "foerderbereich": None}]})
    antrag = await _fetch_antrag("u", db)
    assert antrag["fb_details"] == {}
