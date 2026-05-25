"""Tests für FB-IV-Plugin."""
from __future__ import annotations

from pruefung.foerderbereiche import FbIvPlugin, plugin_for


SAMPLE_NORM_STATEMENTS = [
    {
        "ref": "§ 1", "foerderbereich": None, "statement_typ": "definition",
        "kurz_aussage": "Antragsberechtigung",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 1,
    },
    {
        "ref": "§ 2.4", "foerderbereich": "IV", "statement_typ": "pflicht",
        "kurz_aussage": "FB IV: Struktur- und Schwerpunktförderung formlos",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 8,
    },
    {
        "ref": "§ 2.1", "foerderbereich": "I", "statement_typ": "pflicht",
        "kurz_aussage": "FB I",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 3,
    },
]

SAMPLE_ANTRAG = {
    "antragsnummer": "AHP-2026-IV-0099",
    "haushaltsjahr": 2026,
    "einrichtung": "Stiftung Seniorennetzwerk",
    "ansprechpartner": "Petra Beispiel",
    "strasse": "Schwerpunktstr. 8", "plz": "97070", "ort": "Würzburg",
    "telefon": "0931 7", "email": "info@netzwerk.de",
    "bankname": "Volksbank", "iban": "DE12500105170648489890", "bic": "INGDDEFFXXX",
    "vorhaben_titel": "Digitales Begegnungsnetz",
    "kurzbeschreibung": "Wir bauen ein digitales Begegnungsnetz für Senior:innen.",
    "geplante_massnahmen": "Schulungen, Tablet-Verleih, Online-Stammtisch",
}


def test_plugin_id_und_label():
    plugin = FbIvPlugin()
    assert plugin.fb_id == "IV"
    assert plugin.label


def test_registry_liefert_dieses_plugin():
    assert isinstance(plugin_for("IV"), FbIvPlugin)


def test_pflichtfelder_enthalten_freitext_felder():
    plugin = FbIvPlugin()
    pf = plugin.get_pflicht_felder()
    for f in ["vorhaben_titel", "kurzbeschreibung", "geplante_massnahmen",
              "einrichtung", "iban"]:
        assert f in pf
    # beantragte_summe_euro ist optional, darf NICHT in Pflichtfeldern stehen
    assert "beantragte_summe_euro" not in pf


def test_subsumtions_prompt_enthaelt_quellen_pin():
    plugin = FbIvPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    assert "materialien/" in prompt
    assert "individuell" in prompt or "Förderhöhen" in prompt


def test_subsumtions_prompt_filtert_andere_fb_raus():
    plugin = FbIvPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    assert "§ 2.4" in prompt
    assert "§ 1" in prompt
    assert "§ 2.1" not in prompt  # FB I


def test_post_process_handlet_json_und_fallback():
    plugin = FbIvPlugin()
    p = plugin.post_process_kibescheid('{"entscheidung":"bewilligen","begruendung":"ok","zitate":[]}')
    assert p["entscheidung"] == "bewilligen"
    assert plugin.post_process_kibescheid("nicht-json")["entscheidung"] == "unklar"


def test_render_bescheid_template_rendert_ohne_crash():
    plugin = FbIvPlugin()
    ki = {
        "entscheidung": "rueckfragen",
        "begruendung": "Höhe nicht bestimmbar.",
        "zitate": [{"ref": "§ 2.4", "woertliches_zitat": "Schwerpunktförderung"}],
    }
    html = plugin.render_bescheid_template(SAMPLE_ANTRAG, ki)
    assert "AHP-2026-IV-0099" in html
    assert "Digitales Begegnungsnetz" in html
