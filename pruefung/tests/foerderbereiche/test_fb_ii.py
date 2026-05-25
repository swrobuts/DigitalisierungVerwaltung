"""Tests für FB-II-Plugin."""
from __future__ import annotations

from pruefung.foerderbereiche import FbIiPlugin, plugin_for


SAMPLE_NORM_STATEMENTS = [
    {
        "ref": "§ 1", "foerderbereich": None, "statement_typ": "definition",
        "kurz_aussage": "Antragsberechtigung gemeinnützige Träger",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 1,
    },
    {
        "ref": "§ 2.1", "foerderbereich": "I", "statement_typ": "pflicht",
        "kurz_aussage": "FB I",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 3,
    },
    {
        "ref": "§ 2.2", "foerderbereich": "II", "statement_typ": "pflicht",
        "kurz_aussage": "FB II: Engagement-Pauschalen",
        "quelle_pdf_pfad": "materialien/ahp.pdf", "quelle_seite": 4,
    },
]

SAMPLE_ANTRAG = {
    "antragsnummer": "AHP-2026-II-0007",
    "haushaltsjahr": 2026,
    "einrichtung": "Helfer-Initiative e.V.",
    "ansprechpartner": "Jonas Beispiel",
    "strasse": "Engagementweg 5", "plz": "97070", "ort": "Würzburg",
    "telefon": "0931 999", "email": "info@helfer.de",
    "bankname": "VR Bank", "iban": "DE12500105170648489890", "bic": "INGDDEFFXXX",
    "ehrenamt_titel": "Nachbarschaftshilfe",
    "anzahl_helfer_vorjahr": 12,
    "gesamt_helferstunden_vorjahr": 850,
}


def test_plugin_id_und_label():
    plugin = FbIiPlugin()
    assert plugin.fb_id == "II"
    assert "Engagement" in plugin.label or "engagement" in plugin.label.lower()


def test_registry_liefert_dieses_plugin():
    assert isinstance(plugin_for("II"), FbIiPlugin)


def test_pflichtfelder_enthalten_ehrenamt_details():
    plugin = FbIiPlugin()
    pf = plugin.get_pflicht_felder()
    for f in ["einrichtung", "iban", "ehrenamt_titel",
              "anzahl_helfer_vorjahr", "gesamt_helferstunden_vorjahr"]:
        assert f in pf


def test_subsumtions_prompt_enthaelt_quellen_pin_und_warnung():
    plugin = FbIiPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    assert "materialien/" in prompt
    assert "Halluzinations-Schutz" in prompt or "erfinden" in prompt.lower()


def test_subsumtions_prompt_filtert_irrelevante_fb_raus():
    plugin = FbIiPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    assert "§ 2.2" in prompt  # FB II
    assert "§ 1" in prompt    # generisch
    assert "§ 2.1" not in prompt  # FB I — darf nicht


def test_subsumtions_prompt_meldet_helferliste_fehlt_wenn_leer():
    plugin = FbIiPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    # Ohne helferliste-Key im Antrag-Dict → "NICHT übermittelt"
    assert "NICHT übermittelt" in prompt or "Pflicht-Anlage" in prompt


def test_post_process_handlet_json_und_fallback():
    plugin = FbIiPlugin()
    p = plugin.post_process_kibescheid('{"entscheidung":"rueckfragen"}')
    assert p["entscheidung"] == "rueckfragen"
    assert p["zitate"] == []  # default-Init

    p2 = plugin.post_process_kibescheid("nicht-json text")
    assert p2["entscheidung"] == "unklar"


def test_render_bescheid_template_rendert_ohne_crash():
    plugin = FbIiPlugin()
    ki = {
        "entscheidung": "bewilligen",
        "begruendung": "Pauschale gem. § 2.2 zulässig.",
        "zitate": [{"ref": "§ 2.2", "woertliches_zitat": "FB II: Pauschale"}],
    }
    html = plugin.render_bescheid_template(SAMPLE_ANTRAG, ki)
    assert "AHP-2026-II-0007" in html
    assert "Nachbarschaftshilfe" in html
