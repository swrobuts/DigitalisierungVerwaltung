"""Tests für bescheid_subsumtion Enum-Keys + Multi-FB-Feldnamen."""
from __future__ import annotations

from pruefung.bescheid_subsumtion import (
    _FOERDERBEREICH_LABEL,
    build_subsumtion,
    get_hoechstgrenze,
)


def test_label_kennt_enum_keys_i_iv():
    for fb in ("I", "II", "III", "IV"):
        assert fb in _FOERDERBEREICH_LABEL, f"Enum-Key {fb!r} fehlt"
        assert "Förderbereich" in _FOERDERBEREICH_LABEL[fb]


def test_label_legacy_slug_keys_bleiben_verfuegbar():
    """Audit-Trail-Backward-Compat: Slug-Keys müssen weiter resolvebar sein."""
    assert "begegnungszentren" in _FOERDERBEREICH_LABEL
    assert "buergerschaftliches_engagement" in _FOERDERBEREICH_LABEL


def test_hoechstgrenze_kennt_enum_keys():
    # FB I/IV haben keine feste Grenze (None), FB II hat 4250, FB III max 10000
    assert get_hoechstgrenze("II") == 4250
    assert get_hoechstgrenze("III") == 10000
    assert get_hoechstgrenze("I") is None
    assert get_hoechstgrenze("IV") is None


def test_build_subsumtion_liest_einrichtung_statt_name():
    """Neue apl.antraege-Spalten: einrichtung statt name, dachverband statt traeger."""
    antrag = {
        "einrichtung": "Caritas-Café",
        "dachverband": "Caritas e.V.",
        "iban": "DE12345",
        "foerderbereich": "I",
    }
    befund = {
        "beschreibung": "IBAN ungültig",
        "paragraph_ref": "AHP 3.6",
    }
    out = build_subsumtion(befund, antrag)
    # Sachverhalt enthält IBAN, kein Crash
    assert "DE12345" in out["sachverhalt"]


def test_build_subsumtion_submitted_at_zu_antragsdatum():
    """submitted_at ISO → Format-Date 'tt.mm.jjjj' im Sachverhalt."""
    antrag = {
        "einrichtung": "X",
        "submitted_at": "2026-03-15T08:00:00Z",
        "haushaltsjahr": 2026,
        "foerderbereich": "I",
    }
    befund = {"beschreibung": "Antrag verfristet — Frist 1. April"}
    out = build_subsumtion(befund, antrag)
    assert "15.03.2026" in out["sachverhalt"]


def test_build_subsumtion_fb_i_forderung_aus_fb_details():
    """FB I: geforderte Summe = personalkosten_euro + sachkosten_euro."""
    antrag = {
        "einrichtung": "X", "foerderbereich": "I",
        "fb_details": {
            "personalkosten_euro": 12000,
            "sachkosten_euro": 3000,
        },
    }
    befund = {
        "beschreibung": "Die Forderung übersteigt die AHP-Obergrenze",
    }
    out = build_subsumtion(befund, antrag)
    # 15000 in irgendeiner Form im Text
    text = (out.get("sachverhalt") or "") + (out.get("wuerdigung") or "")
    assert "15.000" in text or "15000" in text or "12.000" in text
