from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from pruefung.main import app
from pruefung.models import Befund

client = TestClient(app)


def test_pruefen_validiert_input():
    """Fehlende antrag_id → 422 Pydantic."""
    r = client.post("/api/pruefen", json={})
    assert r.status_code == 422


def test_pruefen_aggregiert_3_layer():
    """Mockt DB-Reads + Layer-B/C, prüft dass Layer A direkt läuft und
    alle 3 Layer-Befunde aggregiert + protokoll geschrieben wird."""
    fake_antrag = {
        "id": "00000000-0000-0000-0000-000000000001",
        "antragsnummer": "APL2-2026-X-1",
        "iban": "ABC",  # → Layer-A-Verstoss
        "plz": "97070",
        "email": "x@y.de",
        "haushaltsjahr": 2026,
        "raeume_unentgeltlich": "ja",
        "miete_jahr_euro": 0,
        "betriebskosten_vorjahr_euro": 100,
        "personalkosten_vorjahr_euro": 0,
        "oeffnungszeiten": [],
    }

    with patch("pruefung.main._fetch_antrag", new=AsyncMock(return_value=fake_antrag)), \
         patch("pruefung.main._fetch_doctree", new=AsyncMock(return_value=({"id": "root", "title": "T", "path": "", "level": 0, "content": "", "children": [{"id": "x"}]}, "2025-03-27"))), \
         patch("pruefung.main.check_ontologie", new=AsyncMock(return_value=[Befund(schwere="hinweis", layer="B", beschreibung="B-Hinweis")])), \
         patch("pruefung.main.check_rag", new=AsyncMock(return_value=[Befund(schwere="verstoss", layer="C", beschreibung="C-Verstoss", section_path="§ 4.2")])), \
         patch("pruefung.main.SupabaseClient") as MockSC:
        # Mock SupabaseClient.from_env + insert
        instance = MockSC.from_env.return_value
        instance.insert = AsyncMock(return_value=[{"id": "pp-1"}])

        r = client.post("/api/pruefen", json={"antrag_id": "00000000-0000-0000-0000-000000000001"})

    assert r.status_code == 200
    data = r.json()
    assert data["protokoll_id"] == "pp-1"
    # Layer A liefert ≥ 1 Verstoss (IBAN ungültig), Layer C einen Verstoss
    assert data["anzahl_verstoesse"] >= 2
    assert data["anzahl_hinweise"] >= 1
    assert data["doctree_version"] == "2025-03-27"
    assert any(b["layer"] == "A" for b in data["befunde"])
    assert any(b["layer"] == "B" for b in data["befunde"])
    assert any(b["layer"] == "C" for b in data["befunde"])


def test_pruefen_skipt_layer_c_wenn_doctree_leer():
    """Wenn doctree.children leer ist, läuft Layer C nicht."""
    fake_antrag = {
        "id": "00000000-0000-0000-0000-000000000001",
        "antragsnummer": "APL2-2026-X-1",
        "iban": "DE89370400440532013000",
        "plz": "97070", "email": "x@y.de", "haushaltsjahr": 2026,
        "raeume_unentgeltlich": "ja", "miete_jahr_euro": 0,
        "betriebskosten_vorjahr_euro": 100, "personalkosten_vorjahr_euro": 0,
        "oeffnungszeiten": [{"wochentag": "mo", "oeffnungszeit": "10-16", "angebot": "X"}],
    }

    rag_mock = AsyncMock()
    with patch("pruefung.main._fetch_antrag", new=AsyncMock(return_value=fake_antrag)), \
         patch("pruefung.main._fetch_doctree", new=AsyncMock(return_value=({"id": "root", "children": []}, None))), \
         patch("pruefung.main.check_ontologie", new=AsyncMock(return_value=[])), \
         patch("pruefung.main.check_rag", new=rag_mock), \
         patch("pruefung.main.SupabaseClient") as MockSC:
        instance = MockSC.from_env.return_value
        instance.insert = AsyncMock(return_value=[{"id": "pp-2"}])

        r = client.post("/api/pruefen", json={"antrag_id": "00000000-0000-0000-0000-000000000001"})

    assert r.status_code == 200
    rag_mock.assert_not_called()  # Layer C skipped
