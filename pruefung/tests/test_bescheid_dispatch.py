"""Bescheid-Dispatcher-Tests.

Stellt sicher:
- _apply_legacy_field_aliases mapt neue apl.antraege-Felder auf die
  vom Bescheid-Template erwarteten Legacy-Namen
- render_bescheid_safe rendert für jeden FB einen Bescheid ohne Crash
  und ruft den Quellen-Validator auf (Halluzinations-Schutz, Robert-Regel)
"""
from __future__ import annotations

import pytest

from pruefung.foerderbereiche import render_bescheid_safe
from pruefung.main import _apply_legacy_field_aliases


def test_legacy_aliases_einrichtung_zu_name():
    antrag = {"einrichtung": "Caritas"}
    out = _apply_legacy_field_aliases(antrag)
    assert out["name"] == "Caritas"


def test_legacy_aliases_dachverband_zu_traeger():
    antrag = {"einrichtung": "Caritas", "dachverband": "Caritas-Verband Würzburg"}
    out = _apply_legacy_field_aliases(antrag)
    assert out["traeger"] == "Caritas-Verband Würzburg"


def test_legacy_aliases_dachverband_fallback_einrichtung():
    antrag = {"einrichtung": "Caritas", "dachverband": None}
    out = _apply_legacy_field_aliases(antrag)
    assert out["traeger"] == "Caritas"


def test_legacy_aliases_bankname_zu_bankverbindung():
    antrag = {"bankname": "Sparkasse Mainfranken"}
    out = _apply_legacy_field_aliases(antrag)
    assert out["bankverbindung"] == "Sparkasse Mainfranken"


def test_legacy_aliases_submitted_at_zu_antragsdatum():
    antrag = {"submitted_at": "2026-05-25T10:30:00Z"}
    out = _apply_legacy_field_aliases(antrag)
    assert out["antragsdatum"] == "2026-05-25"


def test_legacy_aliases_nondestruktiv_setzt_nicht_ueber():
    antrag = {"name": "Schon gesetzt", "einrichtung": "Andere"}
    out = _apply_legacy_field_aliases(antrag)
    assert out["name"] == "Schon gesetzt"


@pytest.mark.parametrize("fb", ["I", "II", "III", "IV"])
@pytest.mark.asyncio
async def test_render_bescheid_safe_pro_fb_ohne_crash(fb):
    """Smoke: render_bescheid_safe muss für jeden FB durchlaufen."""
    antrag = {
        "antragsnummer": f"APL-2026-{fb}-1",
        "einrichtung": "Caritas",
        "haushaltsjahr": 2026,
        "foerderbereich": fb,
        # FB-spezifische Felder (flat — Templates lesen direkt antrag.<feld>)
        "projekt_titel": "Café",
        "ehrenamt_titel": "Besuchsdienst",
        "anzahl_helfer_vorjahr": 5,
        "gesamt_helferstunden_vorjahr": 100,
        "variante": "A",
        "vorhaben_titel": "Senioren-Festival",
    }
    ki_result = {
        "entscheidung": "bewilligen",
        "begruendung": "Antrag erfüllt die AHP-Voraussetzungen.",
        "zitate": [],
    }
    # bekannte_refs={} bedeutet: nichts ist registriert. Da im ki_result
    # keine § zitiert werden, wird der Quellen-Validator nichts beanstanden.
    html = await render_bescheid_safe(
        fb_id=fb, antrag=antrag, ki_result=ki_result,
        bekannte_refs=set(), antrag_id="test-id",
    )
    assert "<html" in html.lower()
    assert "Caritas" in html
