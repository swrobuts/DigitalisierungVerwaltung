"""Tests für FB-III-Plugin (Varianten A/B/C/D)."""
from __future__ import annotations

import pytest

from pruefung.foerderbereiche import FbIiiPlugin, plugin_for
from pruefung.foerderbereiche.fb_iii import (
    HOECHSTGRENZE_BY_VARIANTE,
    HOECHSTGRENZE_C_BY_STAFFEL,
)


SAMPLE_NORM_STATEMENTS = [
    {
        "ref": "§ 1", "foerderbereich": None, "statement_typ": "definition",
        "kurz_aussage": "Antragsberechtigung",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 1,
    },
    {
        "ref": "§ 2.3.1", "foerderbereich": "III", "fb_iii_variante": "A",
        "statement_typ": "pflicht", "kurz_aussage": "Variante A — MGH",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 5,
    },
    {
        "ref": "§ 2.3.4", "foerderbereich": "III", "fb_iii_variante": "C",
        "statement_typ": "pflicht", "kurz_aussage": "Variante C — Seniorenkreis",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 6,
    },
    {
        "ref": "§ 2.2", "foerderbereich": "II", "statement_typ": "pflicht",
        "kurz_aussage": "FB II", "quelle_pdf_pfad": "materialien/ahp.pdf",
        "quelle_seite": 4,
    },
]

SAMPLE_ANTRAG_C = {
    "antragsnummer": "AHP-2026-III-0042",
    "haushaltsjahr": 2026,
    "einrichtung": "Seniorenkreis St. Anna",
    "ansprechpartner": "Hans Beispiel",
    "strasse": "Domplatz 1", "plz": "97070", "ort": "Würzburg",
    "telefon": "0931 1", "email": "info@anna.de",
    "bankname": "Sparkasse", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
    "variante": "C",
    "c_treffen_schwelle": "GT_20",
    "c_teilnehmer_durchschnitt": 18,
}


def test_plugin_id_und_label():
    plugin = FbIiiPlugin()
    assert plugin.fb_id == "III"
    assert plugin.label


def test_registry_liefert_dieses_plugin():
    assert isinstance(plugin_for("III"), FbIiiPlugin)


def test_pflichtfelder_basis_ohne_variante():
    plugin = FbIiiPlugin()
    pf = plugin.get_pflicht_felder()
    assert "variante" in pf
    assert "einrichtung" in pf


@pytest.mark.parametrize("variante,erwartete_zusatzfelder", [
    ("A", ["anlage_foerderbestaetigung_bund"]),
    ("B", ["b_anzahl_veranstaltungen", "b_teilnehmer_senioren"]),
    ("C", ["c_treffen_schwelle", "c_teilnehmer_durchschnitt"]),
    ("D", ["d_hauptamt_name", "d_hauptamt_stunden_woche"]),
])
def test_pflichtfelder_pro_variante(variante, erwartete_zusatzfelder):
    plugin = FbIiiPlugin()
    pf = plugin.get_pflicht_felder(variante=variante)
    for f in erwartete_zusatzfelder:
        assert f in pf, f"{f} fehlt für Variante {variante}"


def test_hoechstgrenzen_pro_variante():
    plugin = FbIiiPlugin()
    assert plugin.get_hoechstgrenze("A") == 10000
    assert plugin.get_hoechstgrenze("B") == 10000
    assert plugin.get_hoechstgrenze("D") == 7500


def test_hoechstgrenze_c_haengt_an_staffel():
    plugin = FbIiiPlugin()
    assert plugin.get_hoechstgrenze("C", "GT_10") == 750
    assert plugin.get_hoechstgrenze("C", "GT_20") == 1250
    assert plugin.get_hoechstgrenze("C", "GT_40") == 2000


def test_hoechstgrenze_konstanten_stimmen_mit_ahp_richtlinie_ueberein():
    """Schutz vor versehentlichem Drift der Höchstgrenzen-Konstanten."""
    assert HOECHSTGRENZE_BY_VARIANTE == {"A": 10000, "B": 10000, "C": 2000, "D": 7500}
    assert HOECHSTGRENZE_C_BY_STAFFEL == {"GT_10": 750, "GT_20": 1250, "GT_40": 2000}


def test_subsumtions_prompt_enthaelt_quellen_und_hoechstgrenze():
    plugin = FbIiiPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG_C, SAMPLE_NORM_STATEMENTS)
    assert "materialien/" in prompt
    # Höchstgrenze für C bei GT_20
    assert "1250" in prompt


def test_subsumtions_prompt_filtert_andere_fb_und_andere_varianten_raus():
    plugin = FbIiiPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG_C, SAMPLE_NORM_STATEMENTS)
    # Variante C explizit, generische refs erlaubt
    assert "§ 2.3.4" in prompt
    assert "§ 1" in prompt
    # FB II darf nicht
    assert "§ 2.2" not in prompt
    # Variante A darf bei Antrag mit Variante C nicht
    assert "§ 2.3.1" not in prompt


def test_post_process_handlet_json_und_fallback():
    plugin = FbIiiPlugin()
    p = plugin.post_process_kibescheid('{"entscheidung":"bewilligen"}')
    assert p["entscheidung"] == "bewilligen"
    assert plugin.post_process_kibescheid("kein json")["entscheidung"] == "unklar"


def test_render_bescheid_template_rendert_ohne_crash():
    plugin = FbIiiPlugin()
    ki = {
        "entscheidung": "bewilligen",
        "begruendung": "C ≥20 Treffen → 1.250 €",
        "zitate": [{"ref": "§ 2.3.4", "woertliches_zitat": "Variante C"}],
    }
    html = plugin.render_bescheid_template(SAMPLE_ANTRAG_C, ki)
    assert "AHP-2026-III-0042" in html
    assert "C" in html  # Variante
