"""Tests für FB-I-Plugin."""
from __future__ import annotations

from pruefung.foerderbereiche import FbIPlugin, plugin_for


SAMPLE_NORM_STATEMENTS = [
    {
        "ref": "§ 1", "foerderbereich": None, "statement_typ": "definition",
        "kurz_aussage": "Antragsberechtigung: gemeinnützige Träger",
        "quelle_pdf_pfad": "materialien/wuerzburg-2026/ahp.pdf", "quelle_seite": 1,
    },
    {
        "ref": "§ 2.1", "foerderbereich": "I", "statement_typ": "pflicht",
        "kurz_aussage": "FB I: Aufbau niedrigschwelliger Angebote",
        "quelle_pdf_pfad": "materialien/wuerzburg-2026/ahp.pdf", "quelle_seite": 3,
    },
    {
        "ref": "§ 2.2", "foerderbereich": "II", "statement_typ": "pflicht",
        "kurz_aussage": "FB II: Engagement-Pauschalen",
        "quelle_pdf_pfad": "materialien/wuerzburg-2026/ahp.pdf", "quelle_seite": 4,
    },
    {
        "ref": "§ 2.3.1", "foerderbereich": "III", "statement_typ": "pflicht",
        "kurz_aussage": "FB III Variante A — MGH",
        "quelle_pdf_pfad": "materialien/wuerzburg-2026/ahp.pdf", "quelle_seite": 5,
    },
]

SAMPLE_ANTRAG = {
    "antragsnummer": "AHP-2026-I-0001",
    "haushaltsjahr": 2026,
    "einrichtung": "Test-Verein e.V.",
    "ansprechpartner": "Maria Mustermann",
    "strasse": "Hauptstr. 1", "plz": "97070", "ort": "Würzburg",
    "telefon": "0931 123456", "email": "info@test.de",
    "bankname": "Sparkasse Mainfranken", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
    "projekt_titel": "Niedrigschwelliges Café für Senior:innen",
}


def test_plugin_id_und_label():
    plugin = FbIPlugin()
    assert plugin.fb_id == "I"
    assert plugin.label == "Aufbau niedrigschwelliger Angebote"


def test_registry_liefert_dieses_plugin():
    assert isinstance(plugin_for("I"), FbIPlugin)


def test_pflichtfelder_enthalten_antragsteller_block_und_projekt():
    plugin = FbIPlugin()
    pf = plugin.get_pflicht_felder()
    # Antragsteller-Block
    for f in ["einrichtung", "ansprechpartner", "iban", "bic", "email"]:
        assert f in pf, f"{f} fehlt in Pflichtfeldern"
    # FB I spezifisch
    assert "projekt_titel" in pf


def test_subsumtions_prompt_enthaelt_quellen_pin():
    plugin = FbIPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    # Source-Pin im Prompt
    assert "materialien/" in prompt
    assert "Quelle:" in prompt
    # Halluzinations-Warnung
    assert "NUR" in prompt
    assert "erfinden" in prompt.lower()


def test_subsumtions_prompt_filtert_andere_fb_raus():
    plugin = FbIPlugin()
    prompt = plugin.baue_subsumtions_prompt(SAMPLE_ANTRAG, SAMPLE_NORM_STATEMENTS)
    # FB I + generische refs müssen drin sein
    assert "§ 1" in prompt
    assert "§ 2.1" in prompt
    # FB II / FB III dürfen NICHT zitiert werden
    assert "§ 2.2" not in prompt
    assert "§ 2.3.1" not in prompt


def test_post_process_handlet_json_und_plaintext_fallback():
    plugin = FbIPlugin()
    parsed = plugin.post_process_kibescheid(
        '{"entscheidung":"bewilligen","begruendung":"alles ok","zitate":[]}'
    )
    assert parsed["entscheidung"] == "bewilligen"
    assert parsed["begruendung"] == "alles ok"

    # Fallback: kein JSON
    parsed2 = plugin.post_process_kibescheid("das ist Freitext")
    assert parsed2["entscheidung"] == "unklar"
    assert "Freitext" in parsed2["begruendung"]


def test_render_bescheid_template_rendert_ohne_crash():
    plugin = FbIPlugin()
    ki = {
        "entscheidung": "bewilligen",
        "begruendung": "Antrag entspricht § 2.1.",
        "zitate": [{"ref": "§ 2.1", "woertliches_zitat": "FB I betrifft …"}],
    }
    html = plugin.render_bescheid_template(SAMPLE_ANTRAG, ki)
    assert "AHP-2026-I-0001" in html
    assert "bewilligen" in html
    assert "§ 2.1" in html
