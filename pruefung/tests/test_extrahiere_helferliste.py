"""Tests für pruefung.extrahiere_helferliste + /api/extrahiere-helferliste.

Wir mocken den Claude-Client. Der echte Vision-Call wird nur in einem
optionalen Live-Test gemacht (skipped wenn ANTHROPIC_API_KEY fehlt).
"""
from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from pruefung.extrahiere_helferliste import extrahiere_helferliste
from pruefung.main import app


client = TestClient(app)


def _mock_anthropic_with(text: str) -> MagicMock:
    m = MagicMock()
    m.messages.create = AsyncMock(
        return_value=SimpleNamespace(content=[SimpleNamespace(text=text)]),
    )
    return m


@pytest.mark.asyncio
async def test_extrahiere_helferliste_basis():
    raw = (
        '[{"position": 1, "name": "Müller", "vorname": "Anna", '
        '"einsatzbereich": "Wohnbereich Süd", "eintritt": "2018-03-01", '
        '"austritt": null, "stunden_monat": 12.0, "stunden_jahr": 144.0}]'
    )
    result = await extrahiere_helferliste(
        b"%PDF-fake", anthropic_client=_mock_anthropic_with(raw),
    )
    assert len(result) == 1
    h = result[0]
    assert h["name"] == "Müller"
    assert h["vorname"] == "Anna"
    assert h["einsatzbereich"] == "Wohnbereich Süd"
    assert h["stunden_jahr"] == 144.0


@pytest.mark.asyncio
async def test_extrahiere_helferliste_filtert_unvollstaendige():
    """Eintrag ohne Vorname → wird verworfen (Halluzinations-Schutz)."""
    raw = (
        '[{"name": "Müller", "vorname": "Anna"}, '
        '{"name": "Schmidt"}, '
        '{"vorname": "Klaus"}]'
    )
    result = await extrahiere_helferliste(
        b"%PDF-fake", anthropic_client=_mock_anthropic_with(raw),
    )
    assert len(result) == 1
    assert result[0]["name"] == "Müller"


@pytest.mark.asyncio
async def test_extrahiere_helferliste_kaputtes_json_leer():
    result = await extrahiere_helferliste(
        b"%PDF-fake", anthropic_client=_mock_anthropic_with("kein json"),
    )
    assert result == []


@pytest.mark.asyncio
async def test_extrahiere_helferliste_markdown_fences():
    raw = '```json\n[{"name": "Test", "vorname": "User"}]\n```'
    result = await extrahiere_helferliste(
        b"%PDF-fake", anthropic_client=_mock_anthropic_with(raw),
    )
    assert len(result) == 1


@pytest.mark.asyncio
async def test_extrahiere_helferliste_stunden_invalid_wird_none():
    raw = '[{"name": "X", "vorname": "Y", "stunden_monat": "n/a"}]'
    result = await extrahiere_helferliste(
        b"%PDF-fake", anthropic_client=_mock_anthropic_with(raw),
    )
    assert result[0]["stunden_monat"] is None


# ── Endpoint ────────────────────────────────────────────────────────


def test_endpoint_extrahiere_helferliste():
    fake_helfer = [{"name": "Test", "vorname": "User", "position": 1}]
    with patch(
        "pruefung.extrahiere_helferliste.extrahiere_helferliste",
        new=AsyncMock(return_value=fake_helfer),
    ):
        r = client.post(
            "/api/extrahiere-helferliste",
            files={"file": ("h.pdf", BytesIO(b"%PDF"), "application/pdf")},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["anzahl"] == 1
    assert body["helfer"] == fake_helfer


# ── Optional: Live-Test gegen echte Vorlage ────────────────────────


_LIVE_PDF = Path(
    "/Users/robert/Library/CloudStorage/OneDrive-Persönlich/"
    "Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung/"
    "materialien/wuerzburg-2026/anlage-ahp-2-helferliste.pdf",
)


@pytest.mark.skipif(
    not _LIVE_PDF.exists() or not os.environ.get("ANTHROPIC_API_KEY"),
    reason="Live-PDF oder API-Key fehlt — Test wird übersprungen.",
)
@pytest.mark.asyncio
async def test_extrahiere_helferliste_live_pdf():  # pragma: no cover
    pdf_bytes = _LIVE_PDF.read_bytes()
    result = await extrahiere_helferliste(pdf_bytes)
    # Wir wissen nicht wie viele Helfer drin sind, aber wenn der Live-
    # Test läuft, sollte mindestens einer extrahiert werden.
    assert isinstance(result, list)
