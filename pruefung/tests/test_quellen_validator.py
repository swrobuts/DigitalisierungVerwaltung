"""Tests für den Halluzinations-Schutz beim Bescheid-Render.

Schwerpunkt: jeder Code-Pfad der zu einem rechtlich problematischen
Bescheid führen könnte, muss durchlaufen werden — sonst hilft die
Validierung nichts.
"""
from pruefung.quellen_validator import (
    _normalize, validiere_alle, validiere_befund,
)


def _tree() -> dict:
    """Mini-Doctree für die Tests — nur das was wir brauchen."""
    return {
        "id": "root", "title": "AHP", "path": "", "level": 0, "content": "",
        "children": [
            {
                "id": "3", "title": "Verfahren", "path": "3", "level": 1,
                "content": "",
                "children": [
                    {
                        "id": "3.3", "title": "Antragsfristen", "path": "3.3",
                        "level": 2,
                        "content": (
                            "Die Anträge müssen grundsätzlich bis zum 1. April "
                            "des Antragsjahres vorliegen. Anträge die zu spät "
                            "eingereicht werden, gelten als verfristet und "
                            "werden grundsätzlich abgelehnt."
                        ),
                        "children": [],
                    },
                ],
            },
        ],
    }


# ── Befund ohne paragraph_ref: nicht prüfbar, akzeptiert ────────────

def test_befund_ohne_paragraph_ref_wird_akzeptiert():
    befund = {"schwere": "verstoss", "beschreibung": "Etwas nicht in Ordnung"}
    assert validiere_befund(befund, _tree()) is None


# ── Section existiert: ok ───────────────────────────────────────────

def test_befund_mit_existierender_section_ist_ok():
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Antragsfrist verfristet",
        "paragraph_ref": "AHP 3.3",
    }
    assert validiere_befund(befund, _tree()) is None


# ── Halluzinierte Section: blockiert ────────────────────────────────

def test_erfundene_section_wird_erkannt():
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Angeblicher Verstoß",
        "paragraph_ref": "AHP 7.99",  # gibt es nicht
    }
    fehler = validiere_befund(befund, _tree())
    assert fehler is not None
    assert fehler["art"] == "section_nicht_gefunden"
    assert "7.99" in fehler["detail"]


# ── Unparsbarer Paragraph-Ref ───────────────────────────────────────

def test_unparsbarer_paragraph_ref_wird_erkannt():
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Etwas",
        "paragraph_ref": "siehe AHP allgemein",  # keine Zahl
    }
    fehler = validiere_befund(befund, _tree())
    assert fehler is not None
    assert fehler["art"] == "ref_unparsbar"


# ── Zitat im Wortlaut → ok ──────────────────────────────────────────

def test_korrektes_zitat_im_wortlaut_ist_ok():
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Frist verpasst",
        "paragraph_ref": "AHP 3.3",
        "ahp_wortlaut": (
            "Die Anträge müssen grundsätzlich bis zum 1. April des "
            "Antragsjahres vorliegen."
        ),
    }
    assert validiere_befund(befund, _tree()) is None


# ── Zitat mit typografischen Anführungszeichen wird normalisiert ────

def test_typografische_anfuehrungszeichen_werden_normalisiert():
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Frist verpasst",
        "paragraph_ref": "AHP 3.3",
        # „…" statt "..." — sollte trotzdem matchen
        "ahp_wortlaut": (
            "Die Anträge müssen grundsätzlich bis zum 1. April – des "
            "Antragsjahres vorliegen."
        ),
    }
    assert validiere_befund(befund, _tree()) is None


# ── Komplett halluziniertes Zitat: blockiert ────────────────────────

def test_erfundenes_zitat_wird_erkannt():
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Behauptung Frist",
        "paragraph_ref": "AHP 3.3",
        "ahp_wortlaut": (
            "Bewerbungen sind zwingend per Fax an die Geschäftsstelle der "
            "Bundesnetzagentur in Bonn einzureichen, andernfalls verfallen sie."
        ),
    }
    fehler = validiere_befund(befund, _tree())
    assert fehler is not None
    assert fehler["art"] == "zitat_nicht_im_wortlaut"


# ── Kurze Zitate (unter Mindestlänge) werden nicht geprüft ──────────

def test_sehr_kurzes_zitat_uebersprungen():
    # Zitat unter ZITAT_MIN_LEN: Match-Check zu schwach, übersprungen
    befund = {
        "schwere": "verstoss",
        "beschreibung": "Frist",
        "paragraph_ref": "AHP 3.3",
        "ahp_wortlaut": "irgendwas",  # zu kurz
    }
    assert validiere_befund(befund, _tree()) is None


# ── Aggregator: liefert alle Fehler ─────────────────────────────────

def test_validiere_alle_aggregiert_korrekt():
    befunde = [
        {"schwere": "verstoss", "paragraph_ref": "AHP 3.3"},   # ok
        {"schwere": "verstoss", "paragraph_ref": "AHP 9.99"},  # halluziniert
        {"schwere": "verstoss"},                                # ohne ref
    ]
    fehler = validiere_alle(befunde, _tree())
    assert len(fehler) == 1
    assert fehler[0]["art"] == "section_nicht_gefunden"


def test_normalize_idempotent():
    s = "  Mehrere   Leerzeichen  und Halbgeviert – test  "
    assert _normalize(s) == _normalize(_normalize(s))


# ───────────────────────────────────────────────────────────────────────
# Phase 4A.3: Hard-Fail-Validator gegen apl.ahp_norm_statements
# ───────────────────────────────────────────────────────────────────────

import pytest

from pruefung.quellen_validator import (
    QuellenValidationError,
    _normalize_ref,
    extract_paragraph_refs,
    validiere_oder_abbrechen,
)


def test_extract_paragraph_refs_findet_alle_und_dedupliziert():
    text = (
        "Gem. § 2.1 und § 2.3.4 entscheiden wir... siehe auch § 4. "
        "Nochmal §2.1 wegen Wiederholung."
    )
    refs = extract_paragraph_refs(text)
    # dedupliziert + sortiert
    assert refs == ["2.1", "2.3.4", "4"]


def test_extract_paragraph_refs_handelt_leeren_text():
    assert extract_paragraph_refs("") == []
    assert extract_paragraph_refs(None) == []  # type: ignore[arg-type]


def test_normalize_ref_toleriert_whitespace_und_paragraphenzeichen():
    assert _normalize_ref("§ 2.3.4") == "2.3.4"
    assert _normalize_ref("§2.3.4") == "2.3.4"
    assert _normalize_ref("  §   2.3.4  ") == "2.3.4"
    assert _normalize_ref("AGB.IBAN") == "agb.iban"


@pytest.mark.asyncio
async def test_validiere_oder_abbrechen_akzeptiert_bekannte_paragraphen():
    text = "Begründung: gem. § 2.1 ist der Antrag zulässig."
    # bekannte_refs ist bereits normalisiert (so wie lade_bekannte_refs sie liefert)
    bekannte = {"2.1", "3.3"}
    # darf nicht werfen
    await validiere_oder_abbrechen(text, bekannte_refs=bekannte)


@pytest.mark.asyncio
async def test_validiere_oder_abbrechen_lehnt_erfundene_paragraphen_ab():
    text = "Gem. § 99.9 lehnen wir den Antrag ab."
    bekannte = {"2.1", "3.3"}
    with pytest.raises(QuellenValidationError) as excinfo:
        await validiere_oder_abbrechen(text, bekannte_refs=bekannte, antrag_id="abc")
    # Die Fehlermeldung muss den erfundenen Paragraphen nennen
    assert "99.9" in str(excinfo.value)
    assert "abc" in str(excinfo.value)


@pytest.mark.asyncio
async def test_validiere_oder_abbrechen_kein_zitat_ist_ok():
    """Bescheid-Text ohne § ist auch valide (z.B. reine Rückfrage)."""
    await validiere_oder_abbrechen("Bitte reichen Sie die Helferliste nach.",
                                   bekannte_refs={"2.1"})


@pytest.mark.asyncio
async def test_validiere_oder_abbrechen_mehrere_erfundene_alle_im_fehler():
    text = "§ 1 ist ok, aber § 99.9 und § 88.8 erfunden."
    bekannte = {"1"}
    with pytest.raises(QuellenValidationError) as excinfo:
        await validiere_oder_abbrechen(text, bekannte_refs=bekannte)
    msg = str(excinfo.value)
    assert "99.9" in msg
    assert "88.8" in msg


@pytest.mark.asyncio
async def test_validiere_oder_abbrechen_braucht_db_oder_bekannte_refs():
    with pytest.raises(ValueError):
        await validiere_oder_abbrechen("§ 1", db=None, bekannte_refs=None)


@pytest.mark.asyncio
async def test_validiere_oder_abbrechen_normalisiert_db_und_text_gleichermassen():
    """DB liefert '§ 2.3.4', Text enthält '§2.3.4' (kein Leerzeichen)."""
    bekannte = {_normalize_ref("§ 2.3.4")}  # '2.3.4'
    await validiere_oder_abbrechen("Siehe §2.3.4 unten.",
                                   bekannte_refs=bekannte)

