"""Tests für UE4 — Sozialamt-Assistent (agent_chat + agent_tools).

LLM-Calls sind durchgängig gemockt — kein echter Anthropic-Verkehr in Tests.

Fokus: Halluzinations-Schutz (kein erfundener FB, keine erfundenen Felder,
keine Halluzinierten Förderhöhen). Plus die drei Demo-Szenarien aus der
UE4-Spec.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from pruefung.agent_chat import run_agent_turn
from pruefung.agent_tools import (
    tool_get_pflichtfelder,
    tool_klassifiziere_foerderbereich,
    tool_submit_antrag,
    tool_validate_field,
)
from pruefung.main import app


client = TestClient(app)


# ── Helper: Mock-Anthropic-Response-Builder ───────────────────────────


def _resp(blocks: list[dict[str, Any]], stop_reason: str = "end_turn"):
    """Baut ein Pseudo-Response-Objekt im SDK-Stil."""
    return SimpleNamespace(
        content=[SimpleNamespace(**b) for b in blocks],
        stop_reason=stop_reason,
    )


def _text_block(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def _tool_use_block(tid: str, name: str, input_: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool_use", "id": tid, "name": name, "input": input_}


def _make_mock_client(responses: list[Any]) -> MagicMock:
    """Liefert ein Mock, das `messages.create` nacheinander mit den
    angegebenen Responses bedient."""
    m = MagicMock()
    m.messages.create = AsyncMock(side_effect=responses)
    return m


# ── tool_klassifiziere_foerderbereich ────────────────────────────────


@pytest.mark.asyncio
async def test_klassifizierer_erkennt_seniorenkreis_als_fb_iii_c():
    raw = json.dumps({
        "fb": "III", "variante": "C", "konfidenz": 0.85,
        "begruendung": "Seniorenkreis = FB III Variante C.",
    })
    cli = _make_mock_client([_resp([_text_block(raw)])])
    out = await tool_klassifiziere_foerderbereich(
        "Wir wollen einen Seniorenkreis aufbauen.",
        anthropic_client=cli,
    )
    assert out["fb"] == "III"
    assert out["variante"] == "C"
    assert out["konfidenz"] == 0.85


@pytest.mark.asyncio
async def test_klassifizierer_blockt_erfundenen_fb():
    """Halluzinations-Schutz: LLM liefert FB 'V' (gibts nicht) → fb=None."""
    raw = json.dumps({"fb": "V", "konfidenz": 0.99, "begruendung": "ausgedacht"})
    cli = _make_mock_client([_resp([_text_block(raw)])])
    out = await tool_klassifiziere_foerderbereich(
        "Irgendwas", anthropic_client=cli,
    )
    assert out["fb"] is None
    assert out["konfidenz"] == 0.0


@pytest.mark.asyncio
async def test_klassifizierer_off_topic_kfz():
    """Off-topic-Wunsch: LLM liefert fb=null, Agent darf nichts erfinden."""
    raw = json.dumps({
        "fb": None, "variante": None, "konfidenz": 0.0,
        "begruendung": "KFZ-Anschaffung ist kein AHP-Thema.",
    })
    cli = _make_mock_client([_resp([_text_block(raw)])])
    out = await tool_klassifiziere_foerderbereich(
        "Ich will Geld für mein Auto.", anthropic_client=cli,
    )
    assert out["fb"] is None
    assert "AHP" in out["begruendung"] or "Auto" in out["begruendung"] or out["begruendung"]


@pytest.mark.asyncio
async def test_klassifizierer_leere_beschreibung():
    out = await tool_klassifiziere_foerderbereich("")
    assert out["fb"] is None
    assert "leer" in out["begruendung"].lower() or "Keine" in out["begruendung"]


# ── tool_get_pflichtfelder ───────────────────────────────────────────


def test_get_pflichtfelder_fb_ii_hat_helfer_felder():
    out = tool_get_pflichtfelder("II")
    assert "fehler" not in out
    feldnamen = {f["name"] for f in out["felder_mit_labels"]}
    assert "ehrenamt_titel" in feldnamen
    assert "anzahl_helfer_vorjahr" in feldnamen
    assert "email" in feldnamen


def test_get_pflichtfelder_fb_iii_c_hat_treffen_schwelle():
    out = tool_get_pflichtfelder("III", "C")
    feldnamen = {f["name"] for f in out["felder_mit_labels"]}
    assert "c_treffen_schwelle" in feldnamen
    assert "c_teilnehmer_durchschnitt" in feldnamen


def test_get_pflichtfelder_unbekannter_fb_liefert_fehler():
    out = tool_get_pflichtfelder("V")
    assert "fehler" in out
    assert out["felder"] == []


def test_get_pflichtfelder_labels_sind_befuellt():
    """Jedes returned Feld hat ein menschlich-lesbares Label."""
    out = tool_get_pflichtfelder("I")
    for f in out["felder_mit_labels"]:
        assert f["label"], f"Feld {f['name']} ohne Label"


# ── tool_validate_field ──────────────────────────────────────────────


def test_validate_email_ok():
    assert tool_validate_field("email", "kontakt@awo-wuerzburg.de") == {
        "ok": True, "fehler": None,
    }


def test_validate_email_kaputt():
    assert tool_validate_field("email", "kein-email")["ok"] is False


def test_validate_iban_ok_deutsche_iban():
    # Bekannt-gültige Test-IBAN (Bundesbank-Beispiel)
    assert tool_validate_field("iban", "DE89370400440532013000")["ok"] is True


def test_validate_iban_falsche_pruefsumme():
    assert tool_validate_field("iban", "DE00370400440532013000")["ok"] is False


def test_validate_plz_ok():
    assert tool_validate_field("plz", "97070")["ok"] is True


def test_validate_plz_zu_kurz():
    assert tool_validate_field("plz", "970")["ok"] is False


def test_validate_leer():
    assert tool_validate_field("einrichtung", "")["ok"] is False


def test_validate_variante_nur_a_b_c_d():
    assert tool_validate_field("variante", "C")["ok"] is True
    assert tool_validate_field("variante", "Z")["ok"] is False


def test_validate_unbekanntes_feld_akzeptiert_nonempty():
    """Felder ohne expliziten Validator nehmen wir mit non-empty an."""
    assert tool_validate_field("kurzbeschreibung", "Aufbau eines...")["ok"] is True


# ── tool_submit_antrag (Dry-Run, ohne DB) ────────────────────────────


@pytest.mark.asyncio
async def test_submit_antrag_dry_run_erzeugt_antragsnummer():
    out = await tool_submit_antrag(
        {"foerderbereich": "II", "antragsteller": {"einrichtung": "AWO"}},
        db=None,
    )
    assert out["antragsnummer"].startswith("AHP-")
    assert "-II-" in out["antragsnummer"]
    assert out["status"] == "demo_only_no_persist"
    assert out["antrag_id"]


@pytest.mark.asyncio
async def test_submit_antrag_mit_mock_db():
    fake_db = MagicMock()
    fake_db.insert = AsyncMock(return_value=[{"id": "uuid-xyz"}])
    out = await tool_submit_antrag(
        {
            "foerderbereich": "III",
            "antragsteller": {
                "einrichtung": "Caritas",
                "email": "info@caritas.de",
                "iban": "DE89370400440532013000",
                "haushaltsjahr": "2026",
            },
        },
        db=fake_db,
    )
    assert out["status"] == "submitted"
    assert out["antrag_id"] == "uuid-xyz"
    fake_db.insert.assert_called_once()


@pytest.mark.asyncio
async def test_submit_antrag_db_fehler_wird_nicht_geworfen():
    """DB-Insert kracht → Tool returnt ordentlichen Fehler-Dict (nicht raise)."""
    fake_db = MagicMock()
    fake_db.insert = AsyncMock(side_effect=RuntimeError("RLS denied"))
    out = await tool_submit_antrag(
        {"foerderbereich": "I", "antragsteller": {"einrichtung": "X"}},
        db=fake_db,
    )
    assert out["status"] == "fehler_beim_persistieren"
    assert "RLS" in out["fehler"]


# ── run_agent_turn — Demo-Szenarien ──────────────────────────────────


@pytest.mark.asyncio
async def test_szenario_1_seniorenkreis_wird_klassifiziert():
    """User: 'Wir wollen einen Seniorenkreis fördern.' → Agent ruft
    klassifiziere_foerderbereich, bekommt FB III C, antwortet sinnvoll."""
    klassi_raw = json.dumps({
        "fb": "III", "variante": "C", "konfidenz": 0.9,
        "begruendung": "Seniorenkreis = FB III Variante C.",
    })
    cli = _make_mock_client([
        # 1. LLM ruft Tool
        _resp(
            [_tool_use_block(
                "t1", "klassifiziere_foerderbereich",
                {"beschreibung": "Wir wollen einen Seniorenkreis fördern."},
            )],
            stop_reason="tool_use",
        ),
        # 2. (intern Klassifizierungs-Sub-LLM-Call)
        _resp([_text_block(klassi_raw)]),
        # 3. LLM antwortet textuell
        _resp([_text_block(
            "Verstanden — das klingt nach Förderbereich III, Variante C "
            "(Seniorenkreis). Soll ich damit weitermachen?",
        )]),
    ])
    out = await run_agent_turn(
        history=[],
        user_message="Wir wollen einen Seniorenkreis fördern.",
        current_draft={},
        anthropic_client=cli,
    )
    assert "III" in out["assistant_message"] or "Seniorenkreis" in out["assistant_message"]
    assert out["updated_draft"]["foerderbereich"] == "III"
    assert out["updated_draft"]["fb_iii_variante"] == "C"
    assert any(
        t["name"] == "klassifiziere_foerderbereich" for t in out["tool_trace"]
    )


@pytest.mark.asyncio
async def test_szenario_2_pflichtfeld_eingabe_wird_validiert():
    """User gibt eine E-Mail an → Agent ruft validate_field, ist ok, fragt
    nach dem nächsten Feld."""
    cli = _make_mock_client([
        # 1. Validate
        _resp(
            [_tool_use_block(
                "t2", "validate_field",
                {"field_name": "email", "value": "info@awo-wuerzburg.de"},
            )],
            stop_reason="tool_use",
        ),
        # 2. Text-Antwort
        _resp([_text_block(
            "Danke. Wie lautet die IBAN Ihres Vereins?",
        )]),
    ])
    out = await run_agent_turn(
        history=[
            {"role": "assistant", "content": "Wie ist Ihre E-Mail?"},
        ],
        user_message="info@awo-wuerzburg.de",
        current_draft={"foerderbereich": "II"},
        anthropic_client=cli,
    )
    assert "IBAN" in out["assistant_message"]
    assert any(
        t["name"] == "validate_field" and t["output"]["ok"] is True
        for t in out["tool_trace"]
    )


@pytest.mark.asyncio
async def test_szenario_3_offtopic_wird_abgelehnt():
    """User: 'Geld für mein Auto' → Agent klassifiziert, bekommt fb=null,
    lehnt höflich ab und erfindet NICHTS."""
    klassi_raw = json.dumps({
        "fb": None, "variante": None, "konfidenz": 0.0,
        "begruendung": "KFZ-Anschaffung ist kein AHP-Förderzweck.",
    })
    cli = _make_mock_client([
        _resp(
            [_tool_use_block(
                "t3", "klassifiziere_foerderbereich",
                {"beschreibung": "Ich will Geld für mein Auto."},
            )],
            stop_reason="tool_use",
        ),
        _resp([_text_block(klassi_raw)]),
        _resp([_text_block(
            "Leider kann ich Ihnen hier nicht helfen — die Altenhilfe-"
            "Förderung (AHP) deckt keine KFZ-Anschaffungen ab. Für andere "
            "Förderungen erreichen Sie die zentrale Beratung unter 0931 37 0.",
        )]),
    ])
    out = await run_agent_turn(
        history=[],
        user_message="Ich will Geld für mein Auto.",
        current_draft={},
        anthropic_client=cli,
    )
    # KEIN FB im Draft (Halluzinations-Schutz greift)
    assert out["updated_draft"].get("foerderbereich") is None
    # Antwort enthält Ablehnung
    assert any(
        kw in out["assistant_message"].lower()
        for kw in ("leider", "nicht helfen", "ahp", "altenhilfe", "kfz")
    )


@pytest.mark.asyncio
async def test_run_agent_turn_ohne_tool_use_returnt_text():
    """Plain-Text-Antwort ohne Tools (z.B. Smalltalk)."""
    cli = _make_mock_client([
        _resp([_text_block("Hallo! Wobei kann ich Ihnen helfen?")]),
    ])
    out = await run_agent_turn(
        history=[],
        user_message="Hallo",
        current_draft={},
        anthropic_client=cli,
    )
    assert "Hallo" in out["assistant_message"]
    assert out["tool_trace"] == []


# ── Endpoint-Integrationstest ────────────────────────────────────────


def test_endpoint_agent_chat_basic(monkeypatch):
    """End-to-End-Test mit gemocktem run_agent_turn."""
    async def fake_run(**kwargs: Any) -> dict[str, Any]:
        return {
            "assistant_message": "Hallo! Schön, dass Sie da sind.",
            "updated_draft": {"foerderbereich": None},
            "next_action": "ask_foerderbereich",
            "tool_trace": [],
        }

    import pruefung.agent_chat as ac
    monkeypatch.setattr(ac, "run_agent_turn", fake_run)

    r = client.post("/api/agent/chat", json={
        "session_id": "test-session-1",
        "history": [],
        "user_message": "Hallo",
        "current_draft": {},
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["session_id"] == "test-session-1"
    assert "Hallo" in data["assistant_message"]
    assert data["next_action"] == "ask_foerderbereich"
