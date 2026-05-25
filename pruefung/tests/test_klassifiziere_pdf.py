"""Tests für pruefung.klassifiziere_pdf + /api/klassifiziere-pdf-Endpoint.

Halluzinations-Schutz steht im Fokus: ein LLM, das einen unbekannten FB
liefert, darf NIEMALS einen FB-Vorschlag durchreichen — sondern fb=None,
konfidenz=0.0. Das ist die Voraussetzung dafür, dass der UE3-Smart-
Upload nicht in einen erfundenen Förderbereich „rät".
"""
from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from pruefung.klassifiziere_pdf import klassifiziere
from pruefung.main import app


client = TestClient(app)


def _fake_anthropic_response(text: str):
    """Baut ein Pseudo-Response-Objekt mit .content[0].text."""
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


def _mock_client(text: str) -> MagicMock:
    m = MagicMock()
    m.messages.create = AsyncMock(return_value=_fake_anthropic_response(text))
    return m


@pytest.mark.asyncio
async def test_klassifiziere_returnt_korrekten_fb():
    client_mock = _mock_client(
        '{"fb": "II", "variante": null, "konfidenz": 0.92, '
        '"begruendung": "Helferliste vorhanden."}',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] == "II"
    assert result["variante"] is None
    assert result["konfidenz"] == 0.92
    assert "Helferliste" in result["begruendung"]


@pytest.mark.asyncio
async def test_klassifiziere_erfundener_fb_wird_geblockt():
    """Spec: erfundene FBs (V/X/...) → fb=None statt Pass-Through."""
    client_mock = _mock_client(
        '{"fb": "V", "konfidenz": 0.95, "begruendung": "frei erfunden"}',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] is None
    assert result["konfidenz"] == 0.0
    assert "V" in result["begruendung"] or "unbekannt" in result["begruendung"].lower()


@pytest.mark.asyncio
async def test_klassifiziere_variante_nur_bei_fb_iii():
    """Wenn FB I/II/IV gemeldet wird mit variante='B', wird Variante None."""
    client_mock = _mock_client(
        '{"fb": "I", "variante": "B", "konfidenz": 0.8, "begruendung": "x"}',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] == "I"
    assert result["variante"] is None


@pytest.mark.asyncio
async def test_klassifiziere_fb_iii_variante_durchgereicht():
    client_mock = _mock_client(
        '{"fb": "III", "variante": "C", "konfidenz": 0.7, "begruendung": "x"}',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] == "III"
    assert result["variante"] == "C"


@pytest.mark.asyncio
async def test_klassifiziere_unerlaubte_variante_wird_genullt():
    client_mock = _mock_client(
        '{"fb": "III", "variante": "Z", "konfidenz": 0.7, "begruendung": "x"}',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] == "III"
    assert result["variante"] is None


@pytest.mark.asyncio
async def test_klassifiziere_kaputtes_json_graceful():
    client_mock = _mock_client("kein json hier, sorry")
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] is None
    assert result["konfidenz"] == 0.0
    assert "JSON" in result["begruendung"]


@pytest.mark.asyncio
async def test_klassifiziere_konfidenz_geclamped():
    """Werte > 1 oder < 0 werden auf [0,1] geclamped."""
    client_mock = _mock_client(
        '{"fb": "II", "konfidenz": 1.5, "begruendung": "x"}',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["konfidenz"] == 1.0


@pytest.mark.asyncio
async def test_klassifiziere_markdown_fences_werden_entfernt():
    client_mock = _mock_client(
        '```json\n{"fb": "IV", "konfidenz": 0.5, "begruendung": "x"}\n```',
    )
    result = await klassifiziere(b"%PDF-fake", anthropic_client=client_mock)
    assert result["fb"] == "IV"


# ── Endpoint-Integrationstest ────────────────────────────────────────


def test_endpoint_klassifiziere_pdf():
    """End-to-End mit gemocktem klassifiziere()."""
    fake_result = {
        "fb": "II", "variante": None, "konfidenz": 0.88,
        "begruendung": "Helferliste vorhanden.",
    }
    with patch(
        "pruefung.klassifiziere_pdf.klassifiziere",
        new=AsyncMock(return_value=fake_result),
    ):
        r = client.post(
            "/api/klassifiziere-pdf",
            files={"file": ("test.pdf", BytesIO(b"%PDF-fake"), "application/pdf")},
        )
    assert r.status_code == 200
    assert r.json() == fake_result


def test_endpoint_klassifiziere_pdf_zu_gross():
    """> 10 MB → 413."""
    big = b"%PDF" + b"\0" * (10 * 1024 * 1024 + 1)
    r = client.post(
        "/api/klassifiziere-pdf",
        files={"file": ("big.pdf", BytesIO(big), "application/pdf")},
    )
    assert r.status_code == 413
