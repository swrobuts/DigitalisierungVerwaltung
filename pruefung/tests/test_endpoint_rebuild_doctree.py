"""Lightweight Tests für /api/rebuild-doctree.
Filesystem-vollständige E2E-Verifikation in Phase 11."""
from fastapi.testclient import TestClient
from pruefung.main import app

client = TestClient(app)


def test_rebuild_doctree_500_wenn_pdf_fehlt(monkeypatch):
    """AHP_PDF_PATH zeigt auf nicht-existenten Pfad → 500 mit klarer Meldung."""
    monkeypatch.setenv("AHP_PDF_PATH", "/tmp/does-not-exist-xyz-123.pdf")
    r = client.post("/api/rebuild-doctree")
    assert r.status_code == 500
    assert "nicht gefunden" in r.json()["detail"]


def test_rebuild_doctree_baut_tree_aus_mini_pdf(monkeypatch, tmp_path):
    """Mit echtem mini.pdf (aus conftest) + gemockter DB:
    extract_text_blocks + build_tree + insert werden aufgerufen,
    Response liefert version + sections-count."""
    from pathlib import Path
    fixture = Path(__file__).parent / "fixtures" / "mini.pdf"
    # Kopie unter erkennbarem Namen, damit version-Heuristik greift
    target = tmp_path / "foerderrichtlinie-ahp-2025-03-27.pdf"
    target.write_bytes(fixture.read_bytes())
    monkeypatch.setenv("AHP_PDF_PATH", str(target))

    from unittest.mock import AsyncMock, patch
    with patch("pruefung.main.SupabaseClient") as MockSC, \
         patch("pruefung.main.httpx.AsyncClient") as MockHTTP:
        instance = MockSC.from_env.return_value
        instance.url = "https://example.test"
        instance._headers = {}
        instance.insert = AsyncMock(return_value=[{"id": "dt-1"}])
        # httpx.AsyncClient context manager mock for DELETE
        http_ctx = MockHTTP.return_value.__aenter__.return_value
        http_ctx.delete = AsyncMock()

        r = client.post("/api/rebuild-doctree")

    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["version"] == "2025-03-27"
    assert int(data["sections"]) >= 0
