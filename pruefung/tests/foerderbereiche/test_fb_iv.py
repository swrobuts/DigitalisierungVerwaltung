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
    # Pflicht-Anlage (Migration 071): formloser Antrag als PDF
    "dokument_path": "fb_iv/2026/AHP-2026-IV-0099/antrag.pdf",
    # optionale KI-Klassifikations-Hilfsfelder
    "vorhaben_titel": "Digitales Begegnungsnetz",
    "kurzbeschreibung": "Wir bauen ein digitales Begegnungsnetz für Senior:innen.",
}


def test_plugin_id_und_label():
    plugin = FbIvPlugin()
    assert plugin.fb_id == "IV"
    assert plugin.label


def test_registry_liefert_dieses_plugin():
    assert isinstance(plugin_for("IV"), FbIvPlugin)


def test_pflichtfelder_formloser_antrag():
    """FB IV ist laut Stadt Würzburg formlos — strukturelle Pflicht ist nur
    das hochgeladene PDF (dokument_path, Migration 071). Die alten
    erfundenen Freitext-Pflichten sind raus (siehe PDF-Audit 2026-05-26)."""
    plugin = FbIvPlugin()
    pf = plugin.get_pflicht_felder()
    # Antragsteller-Block (apl.antraege) bleibt Pflicht
    for f in ["einrichtung", "ansprechpartner", "iban", "haushaltsjahr"]:
        assert f in pf
    # einzige strukturelle FB-IV-Pflicht ist der PDF-Upload
    assert "dokument_path" in pf
    # die alten erfundenen Pflichten dürfen NICHT mehr drin stehen
    for f in ["vorhaben_titel", "kurzbeschreibung", "geplante_massnahmen",
              "beantragte_summe_euro", "laufzeit"]:
        assert f not in pf, f"{f} ist seit Migration 071 KEIN Pflichtfeld mehr"


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
