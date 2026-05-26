"""Layer C — System-Prompt FB-aware (statt hardcoded APL2/Altentagesstätten)."""
from __future__ import annotations

from pruefung.layer_c_rag import _build_system_prompt


def test_system_prompt_enthaelt_fb_i_label():
    prompt = _build_system_prompt("I")
    assert "Förderbereich I" in prompt
    assert "Aufbau niedrigschwelliger Angebote" in prompt


def test_system_prompt_enthaelt_fb_iii_label():
    prompt = _build_system_prompt("III")
    assert "Förderbereich III" in prompt
    assert "Treffpunkte" in prompt


def test_system_prompt_kein_hardcoded_altentagesstaetten():
    """Wichtig: kein FB darf 'Altentagesstätten'-Specific wording im
    System-Prompt sehen — das war der Legacy-Bug."""
    for fb in ("I", "II", "III", "IV"):
        prompt = _build_system_prompt(fb)
        assert "Altentagesstätt" not in prompt
        assert "APL2-Antrag" not in prompt


def test_system_prompt_fallback_bei_unbekanntem_fb():
    prompt = _build_system_prompt(None)
    # Default-Label muss noch sinnvoll sein
    assert "AHP" in prompt
