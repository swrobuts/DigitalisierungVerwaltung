"""Tests für UE2-Pfad: BescheidRequest akzeptiert manuelle_pruefung_kontext.

Robert-Regel: Halluzinations-Schutz (`validiere_oder_abbrechen`) läuft
unverändert weiter — diese Tests prüfen NUR Schema + Helper, nicht den
End-to-End-Endpoint. Der Validator selbst hat eigene Tests in
test_quellen_validator.py und test_bescheid_hard_fail.py.
"""
from __future__ import annotations

from pruefung.main import (
    BescheidRequest,
    ManuellePruefungEintrag,
    _build_manuelle_pruefung_block,
)


# ── BescheidRequest-Schema ─────────────────────────────────────────────


def test_bescheid_request_akzeptiert_manuelle_pruefung_kontext():
    req = BescheidRequest(
        antrag_id="abc",
        entscheidung="bewilligt",
        manuelle_pruefung_kontext=[
            ManuellePruefungEintrag(paragraph="antragsteller", status="ok"),
            ManuellePruefungEintrag(
                paragraph="fb_detail",
                status="fraglich",
                kommentar="Variante D-Begründung dünn.",
            ),
        ],
    )
    assert req.manuelle_pruefung_kontext is not None
    assert len(req.manuelle_pruefung_kontext) == 2
    assert req.manuelle_pruefung_kontext[0].status == "ok"
    assert req.manuelle_pruefung_kontext[1].kommentar == "Variante D-Begründung dünn."


def test_bescheid_request_akzeptiert_dict_input_per_validate():
    """Pydantic baut ManuellePruefungEintrag aus dict-Input — wichtig,
    weil das Frontend JSON-Bodies sendet, keine Python-Modelle."""
    req = BescheidRequest.model_validate({
        "antrag_id": "abc",
        "entscheidung": "bewilligt",
        "manuelle_pruefung_kontext": [
            {"paragraph": "antragsteller", "status": "ok", "kommentar": None},
            {"paragraph": "bank", "status": "fehlt", "kommentar": "IBAN unklar"},
        ],
    })
    assert req.manuelle_pruefung_kontext is not None
    assert len(req.manuelle_pruefung_kontext) == 2
    assert req.manuelle_pruefung_kontext[1].status == "fehlt"


def test_bescheid_request_ohne_kontext_default_none():
    """UE3-Regress-Schutz: Wenn kein Kontext mitgegeben wird, bleibt
    das Feld None und das Bescheid-Verhalten ist identisch zu vorher."""
    req = BescheidRequest(antrag_id="abc", entscheidung="bewilligt")
    assert req.manuelle_pruefung_kontext is None


# ── Block-Builder ──────────────────────────────────────────────────────


def test_build_manuelle_pruefung_block_none_bei_leerer_liste():
    assert _build_manuelle_pruefung_block(None) is None
    assert _build_manuelle_pruefung_block([]) is None


def test_build_manuelle_pruefung_block_none_bei_nur_offenen_eintraegen():
    """'offen' = noch nicht geprüft. Solche Einträge sind kein
    nützlicher Kontext für den Bescheid → Block bleibt None."""
    eintraege = [
        ManuellePruefungEintrag(paragraph="antragsteller", status="offen"),
        ManuellePruefungEintrag(paragraph="bank", status="offen"),
    ]
    assert _build_manuelle_pruefung_block(eintraege) is None


def test_build_manuelle_pruefung_block_label_mapping_und_status_label():
    eintraege = [
        ManuellePruefungEintrag(paragraph="antragsteller", status="ok"),
        ManuellePruefungEintrag(
            paragraph="fb_detail",
            status="fraglich",
            kommentar="Var-D-Begründung dünn",
        ),
        ManuellePruefungEintrag(paragraph="bank", status="fehlt"),
    ]
    block = _build_manuelle_pruefung_block(eintraege)
    assert block is not None
    assert "Antragsteller / Träger" in block
    assert "Förderbereichs-Details" in block
    assert "Bankverbindung" in block
    assert "✓ OK" in block
    assert "⚠ fraglich" in block
    assert "✗ fehlt" in block
    assert "Var-D-Begründung dünn" in block


def test_build_manuelle_pruefung_block_filtert_offen_raus_zeigt_rest():
    """Mischung offen + geprüft: nur die geprüften kommen in den Block."""
    eintraege = [
        ManuellePruefungEintrag(paragraph="antragsteller", status="ok"),
        ManuellePruefungEintrag(paragraph="bank", status="offen"),
        ManuellePruefungEintrag(
            paragraph="anlagen", status="fraglich", kommentar="Beleg fehlt"
        ),
    ]
    block = _build_manuelle_pruefung_block(eintraege)
    assert block is not None
    assert "Antragsteller / Träger" in block
    assert "Anlagen / Belege" in block
    # 'bank' war 'offen' → darf nicht im Block stehen
    assert "Bankverbindung" not in block


def test_build_manuelle_pruefung_block_unbekannter_paragraph_durchgereicht():
    """Unbekannte Slugs werden roh durchgereicht (defensiver Fallback,
    keine KeyError-Exception bei neuen Sektionen)."""
    eintraege = [
        ManuellePruefungEintrag(paragraph="neuer_slug", status="ok"),
    ]
    block = _build_manuelle_pruefung_block(eintraege)
    assert block is not None
    assert "neuer_slug" in block
