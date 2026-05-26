"""Layer A — FB-aware Pflichtfeld- und Format-Prüfung gegen Plugin."""
from __future__ import annotations

from pruefung.layer_a_strukturell import check_strukturell


def _gemeinsam_ok(**overrides) -> dict:
    """Antragsteller-Block (apl.antraege) vollständig + valide."""
    base = {
        "antragsnummer": "APL-2026-X-1",
        "einrichtung": "Caritas",
        "ansprechpartner": "Anna Müller",
        "strasse": "Karmelitenstr.",
        "hausnummer": "43",
        "plz": "97070",
        "ort": "Würzburg",
        "telefon": "0931 1234567",
        "email": "kontakt@caritas.de",
        "bankname": "Sparkasse",
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "haushaltsjahr": 2026,
    }
    base.update(overrides)
    return base


def test_fb_i_alles_ok_keine_befunde():
    antrag = _gemeinsam_ok(
        foerderbereich="I",
        fb_details={"projekt_titel": "Café", "personalkosten_euro": 1000},
    )
    befunde = check_strukturell(antrag)
    assert befunde == [], f"Unerwartete Befunde: {befunde}"


def test_fb_i_pflichtfeld_projekt_titel_fehlt_meldet_verstoss():
    antrag = _gemeinsam_ok(
        foerderbereich="I",
        fb_details={"projekt_titel": None, "personalkosten_euro": 1.0},
    )
    befunde = check_strukturell(antrag)
    assert any(
        b.schwere == "verstoss" and b.layer == "A"
        and "projekt_titel" in (b.feld or "")
        for b in befunde
    ), f"Befunde: {befunde}"


def test_iban_invalid_meldet_verstoss():
    antrag = _gemeinsam_ok(
        foerderbereich="I", iban="DE-INVALID",
        fb_details={"projekt_titel": "P"},
    )
    befunde = check_strukturell(antrag)
    assert any(b.feld == "iban" and b.schwere == "verstoss" for b in befunde)


def test_plz_format_invalid_meldet_verstoss():
    antrag = _gemeinsam_ok(
        foerderbereich="I", plz="abc",
        fb_details={"projekt_titel": "P"},
    )
    befunde = check_strukturell(antrag)
    assert any(b.feld == "plz" and b.schwere == "verstoss" for b in befunde)


def test_email_ungueltig_meldet_verstoss():
    antrag = _gemeinsam_ok(
        foerderbereich="I", email="kein-email",
        fb_details={"projekt_titel": "P"},
    )
    befunde = check_strukturell(antrag)
    assert any(b.feld == "email" and b.schwere == "verstoss" for b in befunde)


def test_fb_ii_helferliste_fehlt_meldet_verstoss():
    """FB II Pflicht: ehrenamt_titel + anzahl_helfer_vorjahr + stunden."""
    antrag = _gemeinsam_ok(
        foerderbereich="II",
        fb_details={
            "ehrenamt_titel": None,
            "anzahl_helfer_vorjahr": None,
            "gesamt_helferstunden_vorjahr": None,
        },
    )
    befunde = check_strukturell(antrag)
    feld_set = {b.feld for b in befunde if b.schwere == "verstoss"}
    assert any("ehrenamt_titel" in (f or "") for f in feld_set), feld_set


def test_fb_iii_variante_c_pflichtfelder():
    antrag = _gemeinsam_ok(
        foerderbereich="III",
        fb_details={
            "variante": "C",
            "c_treffen_schwelle": None,
            "c_teilnehmer_durchschnitt": None,
        },
    )
    befunde = check_strukturell(antrag)
    feld_set = {b.feld for b in befunde if b.schwere == "verstoss"}
    assert any("c_treffen_schwelle" in (f or "") for f in feld_set), feld_set


def test_fb_iv_dokument_pflicht():
    antrag = _gemeinsam_ok(
        foerderbereich="IV",
        fb_details={"dokument_path": None},
    )
    befunde = check_strukturell(antrag)
    feld_set = {b.feld for b in befunde if b.schwere == "verstoss"}
    assert any("dokument_path" in (f or "") for f in feld_set), feld_set


def test_gemeinsames_pflichtfeld_einrichtung_fehlt():
    antrag = _gemeinsam_ok(
        foerderbereich="I", einrichtung="",
        fb_details={"projekt_titel": "P"},
    )
    befunde = check_strukturell(antrag)
    assert any(b.feld == "einrichtung" and b.schwere == "verstoss" for b in befunde)
