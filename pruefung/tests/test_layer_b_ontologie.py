"""Layer B (neu) — FB-spezifische Konformitäts-Hinweise via Plugin.

apl.ontologie_rules existiert im neuen Schema nicht mehr; Layer B
dispatcht an plugin.check_konformitaet().
"""
from __future__ import annotations

import pytest

from pruefung.layer_b_ontologie import check_ontologie


class _FakeDb:
    async def select(self, table, query):  # noqa: D401, ARG002
        return []


@pytest.mark.asyncio
async def test_fb_iv_keine_pruefung_keine_befunde():
    antrag = {"foerderbereich": "IV", "fb_details": {"vorhaben_titel": "X"}}
    befunde = await check_ontologie(antrag, plan_id="APL2", db=_FakeDb())
    assert befunde == []


@pytest.mark.asyncio
async def test_fb_i_keine_befunde_default():
    antrag = {"foerderbereich": "I", "fb_details": {"projekt_titel": "P"}}
    befunde = await check_ontologie(antrag, plan_id="APL2", db=_FakeDb())
    assert befunde == []


@pytest.mark.asyncio
async def test_fb_iii_c_unbekannte_treffenschwelle_meldet_hinweis():
    antrag = {
        "foerderbereich": "III",
        "fb_details": {
            "variante": "C",
            "c_treffen_schwelle": "BANANE",
            "c_teilnehmer_durchschnitt": 8,
        },
    }
    befunde = await check_ontologie(antrag, plan_id="APL2", db=_FakeDb())
    assert any(
        b.schwere == "hinweis" and b.layer == "B"
        and "c_treffen_schwelle" in (b.feld or "")
        for b in befunde
    ), f"Befunde: {befunde}"


@pytest.mark.asyncio
async def test_fb_iii_c_valide_schwelle_keine_befunde():
    antrag = {
        "foerderbereich": "III",
        "fb_details": {
            "variante": "C",
            "c_treffen_schwelle": "GT_10",
        },
    }
    befunde = await check_ontologie(antrag, plan_id="APL2", db=_FakeDb())
    assert befunde == []


@pytest.mark.asyncio
async def test_unbekannter_fb_keine_befunde():
    antrag = {"foerderbereich": None}
    befunde = await check_ontologie(antrag, plan_id="APL2", db=_FakeDb())
    assert befunde == []
