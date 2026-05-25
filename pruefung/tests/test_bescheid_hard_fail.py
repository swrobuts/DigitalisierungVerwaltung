"""Hard-Fail-Test für POST /api/bescheid.

Spec §12.1: vor jedem PDF-Render läuft validiere_oder_abbrechen gegen
apl.ahp_norm_statements. Wenn die KI im Bescheid-Text einen § zitiert,
der nicht in der DB existiert, MUSS das Endpoint mit 422 abbrechen und
KEIN PDF schreiben.

Diese Tests verkabeln den Endpoint Ende-zu-Ende (über TestClient) und
mocken nur die DB. Sie verifizieren:
  1. Hard-Fail greift, wenn der Validator raised → 422 + Detail
     'Halluzinations-Schutz'.
  2. Happy-Path: wenn der Validator passt, geht der Render durch und
     wir bekommen einen bescheid_id + pdf_storage_path zurück.
"""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from pruefung.main import app
from pruefung.quellen_validator import QuellenValidationError


client = TestClient(app)

_FAKE_ANTRAG_ID = "00000000-0000-0000-0000-000000000abc"
_FAKE_ANTRAG = {
    "id": _FAKE_ANTRAG_ID,
    "antragsnummer": "APL2-2026-TEST-1",
    "haushaltsjahr": 2026,
    "name": "Testverein e.V.",
    "traeger": "Testverein e.V.",
    "strasse": "Musterstr.",
    "hausnummer": "1",
    "plz": "97070",
    "ort": "Würzburg",
    "status": "in_pruefung",
    "foerderbereich": "II",
}
_FAKE_PROTOKOLL = {
    "id": "pp-test",
    "ergebnis_jsonb": {
        "befunde": [
            {
                "schwere": "verstoss",
                "beschreibung": "Helferliste fehlt.",
                "paragraph_ref": "§ 4.2",
            },
        ],
    },
    "doctree_version": "2025-03-27",
}


def _build_db_mock(
    *,
    insert_bescheid_id: str = "bescheid-test",
    delete_succeeds: bool = True,
) -> MagicMock:
    """Baut einen vollständigen SupabaseClient-Mock für /api/bescheid.

    Reads liefern Antrag → Protokoll → leeren Doctree → leere Regeln.
    Insert/Update/Storage sind no-ops.
    """
    db = MagicMock()
    db.url = "http://fake"
    db._headers = {}

    async def fake_select(table, query=""):
        if table == "antraege":
            return [_FAKE_ANTRAG]
        if table == "pruefprotokoll":
            return [_FAKE_PROTOKOLL]
        if table == "ahp_doctree":
            return [{"version": "2025-03-27", "tree_jsonb": {
                "id": "root", "path": "", "level": 0, "title": "AHP",
                "content": "", "children": [],
            }}]
        if table == "ontologie_rules":
            return [{"paragraph_ref": "§ 4.2"}]
        if table == "bescheide":
            return []
        return []

    db.select = AsyncMock(side_effect=fake_select)
    db.insert = AsyncMock(return_value=[{"id": insert_bescheid_id}])
    db.update = AsyncMock(return_value=[{}])
    db.delete = AsyncMock(return_value=delete_succeeds)
    db.upload_storage = AsyncMock(return_value=None)
    return db


def test_bescheid_hard_fail_blockiert_erfundene_paragraphen():
    """Wenn validiere_oder_abbrechen raised → 422 mit klarer Fehlermeldung.

    Es darf KEIN PDF in den Storage geladen werden, der bescheid-Datensatz
    soll wieder entfernt werden (best-effort cleanup).
    """
    db_mock = _build_db_mock()

    from pathlib import Path

    async def boom(*args, **kwargs):
        raise QuellenValidationError(
            "Bescheid-Render abgebrochen: folgende § sind nicht in "
            "apl.ahp_norm_statements vorhanden: ['99.99']"
        )

    with (
        patch("pruefung.main.SupabaseClient") as MockSC,
        patch(
            "pruefung.quellen_validator.validiere_oder_abbrechen",
            new=AsyncMock(side_effect=boom),
        ),
        patch(
            "pruefung.pdf_render.render_bescheid_html",
            return_value=("<html>§99.99 erfunden</html>", Path("/tmp")),
        ),
    ):
        MockSC.from_env.return_value = db_mock
        r = client.post(
            "/api/bescheid",
            json={
                "antrag_id": _FAKE_ANTRAG_ID,
                "entscheidung": "abgelehnt",
            },
        )

    assert r.status_code == 422, r.text
    body = r.json()
    assert "Halluzinations-Schutz" in body["detail"]["fehler"]
    assert "99.99" in body["detail"]["details"]
    # Storage-Upload darf NICHT passiert sein
    db_mock.upload_storage.assert_not_called()
    # Cleanup: bescheide-Datensatz muss wieder weggeräumt worden sein
    delete_calls = [
        c for c in db_mock.delete.call_args_list
        if c.args and c.args[0] == "bescheide"
    ]
    assert delete_calls, "bescheid-Cleanup nach Hard-Fail fehlt"


def test_bescheid_hard_fail_happy_path_geht_durch():
    """Wenn validiere_oder_abbrechen nicht raised → 200, bescheid + PDF geschrieben."""
    db_mock = _build_db_mock(insert_bescheid_id="bescheid-ok")

    from pathlib import Path
    import sys
    import types

    # weasyprint kann lokal (macOS ohne native libs) nicht importiert werden.
    # Wir injizieren ein Stub-Modul in sys.modules, BEVOR main.py den
    # lazy-Import macht. Im Docker/CI mit echten libs wäre das überflüssig,
    # aber harmlos (das Stub-Modul wird durch den nachfolgenden patch ersetzt).
    weasyprint_stub = types.ModuleType("weasyprint")
    weasyprint_stub.HTML = MagicMock(  # type: ignore[attr-defined]
        return_value=MagicMock(write_pdf=MagicMock(return_value=b"%PDF-fake")),
    )

    with (
        patch.dict(sys.modules, {"weasyprint": weasyprint_stub}),
        patch("pruefung.main.SupabaseClient") as MockSC,
        patch(
            "pruefung.quellen_validator.validiere_oder_abbrechen",
            new=AsyncMock(return_value=None),
        ),
        # HTML-Render mocken — entkoppelt vom Jinja-Template-Detail und
        # vermeidet weasyprint-Pfade beim Test-Setup.
        patch(
            "pruefung.pdf_render.render_bescheid_html",
            return_value=("<html><body>Bescheid §4.2 ist erfüllt.</body></html>",
                          Path("/tmp")),
        ),
        # httpx-Update der PDF-Path-Spalte ist out-of-scope
        patch("pruefung.main.httpx.AsyncClient") as MockHttpx,
    ):
        MockSC.from_env.return_value = db_mock
        cm = MockHttpx.return_value.__aenter__.return_value = MagicMock()
        cm.patch = AsyncMock(return_value=None)

        r = client.post(
            "/api/bescheid",
            json={
                "antrag_id": _FAKE_ANTRAG_ID,
                "entscheidung": "bewilligt",
                "bewilligte_summe_euro": 1500.0,
            },
        )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["bescheid_id"] == "bescheid-ok"
    assert body["pdf_storage_path"].endswith("bescheid-ok.pdf")
    # Storage-Upload MUSS passiert sein
    db_mock.upload_storage.assert_called_once()
