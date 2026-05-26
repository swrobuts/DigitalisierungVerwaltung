"""Tests für die LLM-Provider-Abstraktion + Cost-Tracking."""
import pytest

from pruefung.llm_client import (
    LlmResponse, UsageTracker, _cost_usd, get_llm_client,
)


def test_cost_unknown_model_is_none():
    assert _cost_usd("unbekanntes-modell", {"input_tokens": 100, "output_tokens": 50}) is None


def test_cost_sonnet_4_5_mit_typischer_nutzung():
    # 10000 input, 2000 output bei sonnet-4.5: 10/M * 3 + 2/M * 15 ≈ 0.06 USD
    c = _cost_usd("claude-sonnet-4-5", {"input_tokens": 10_000, "output_tokens": 2_000})
    assert c is not None
    assert 0.05 < c < 0.07


def test_cost_haiku_billiger_als_sonnet():
    usage = {"input_tokens": 10_000, "output_tokens": 2_000}
    haiku = _cost_usd("claude-haiku-4-5", usage)
    sonnet = _cost_usd("claude-sonnet-4-5", usage)
    assert haiku is not None and sonnet is not None
    assert haiku < sonnet


def test_usage_tracker_addiert_mehrere_calls():
    t = UsageTracker()
    t.add(LlmResponse(
        content=[], stop_reason="end_turn", model="claude-sonnet-4-5",
        usage={"input_tokens": 100, "output_tokens": 50},
        cost_usd_estimate=0.001,
    ))
    t.add(LlmResponse(
        content=[], stop_reason="end_turn", model="claude-sonnet-4-5",
        usage={"input_tokens": 200, "output_tokens": 100},
        cost_usd_estimate=0.002,
    ))
    d = t.to_dict()
    assert d["calls"] == 2
    assert d["input_tokens"] == 300
    assert d["output_tokens"] == 150
    assert d["total_tokens"] == 450
    assert d["cost_usd_estimate"] == 0.003


def test_usage_tracker_initial_state():
    d = UsageTracker().to_dict()
    assert d == {
        "calls": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cost_usd_estimate": 0.0,
    }


def test_get_llm_client_unbekannter_provider_erroriert(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "magic-cloud-llm")
    with pytest.raises(ValueError, match="nicht unterstützt"):
        get_llm_client()


def test_get_llm_client_default_ist_anthropic(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-used")
    c = get_llm_client()
    # Default-Modell sollte sonnet sein
    assert c._default_model == "claude-sonnet-4-5"


def test_get_llm_client_lmstudio(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "lmstudio")
    monkeypatch.setenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1")
    c = get_llm_client()
    # LM-Studio-Client hat eine base_url
    assert hasattr(c, "_base_url")
    assert c._base_url == "http://localhost:1234/v1"


def test_provider_meta_anthropic(monkeypatch):
    from pruefung.llm_client import provider_meta
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    meta = provider_meta()
    assert meta["provider"] == "anthropic"
    assert meta["lokal"] is False
    assert "USA" in meta["verarbeitungsort"]


def test_provider_meta_lmstudio_ist_lokal(monkeypatch):
    from pruefung.llm_client import provider_meta
    monkeypatch.setenv("LLM_PROVIDER", "lmstudio")
    meta = provider_meta()
    assert meta["provider"] == "lmstudio"
    assert meta["lokal"] is True
    assert "lokal" in meta["verarbeitungsort"].lower() or "on-premise" in meta["verarbeitungsort"].lower()


def test_anthropic_zu_openai_tool_mapping():
    from pruefung.llm_client import _anthropic_to_openai_tool
    anthropic_tool = {
        "name": "get_section",
        "description": "Section abrufen",
        "input_schema": {"type": "object", "properties": {"id": {"type": "string"}}},
    }
    openai_tool = _anthropic_to_openai_tool(anthropic_tool)
    assert openai_tool["type"] == "function"
    assert openai_tool["function"]["name"] == "get_section"
    assert openai_tool["function"]["parameters"]["properties"]["id"]["type"] == "string"


def test_subsumtion_tool_schema_hat_erforderliche_felder():
    """Tool-Schema muss `ref`, `beurteilung`, `begruendung` als required
    haben — sonst kann das LLM unvollständige Befunde liefern."""
    from pruefung.llm_client import SUBSUMTION_TOOL

    schema = SUBSUMTION_TOOL["input_schema"]
    assert schema["required"] == ["befunde"]
    items = schema["properties"]["befunde"]["items"]
    assert set(items["required"]) == {"ref", "beurteilung", "begruendung"}
    assert items["properties"]["beurteilung"]["enum"] == [
        "passt", "passt_nicht", "unklar",
    ]


import pytest as _pytest  # noqa: E402


@_pytest.mark.asyncio
async def test_subsumiere_via_complete_extrahiert_tool_use_block():
    """Helper soll den `befunde`-Array aus dem tool_use-Block ziehen."""
    from pruefung.llm_client import LlmResponse, _SimpleBlock, _subsumiere_via_complete

    class FakeClient:
        def __init__(self):
            self.last_call = None

        async def complete(self, **kwargs):
            self.last_call = kwargs
            block = _SimpleBlock(
                type="tool_use",
                name="liefere_subsumtion",
                id="toolu_1",
                input={"befunde": [
                    {"ref": "AHP 2.1", "beurteilung": "passt", "begruendung": "ok"},
                ]},
            )
            return LlmResponse(
                content=[block], stop_reason="tool_use",
                model="claude-sonnet-4-5",
                usage={"input_tokens": 10, "output_tokens": 5},
                cost_usd_estimate=0.0001,
            )

    c = FakeClient()
    out = await _subsumiere_via_complete(c, "PROMPT")
    assert out == [{"ref": "AHP 2.1", "beurteilung": "passt", "begruendung": "ok"}]
    # System-Prompt muss Robert-Regel enthalten
    assert "Halluzinations-Schutz" in c.last_call["system"].replace(
        "HALLUZINATIONS-SCHUTZ", "Halluzinations-Schutz",
    ) or "erfunden" in c.last_call["system"]


@_pytest.mark.asyncio
async def test_subsumiere_via_complete_leeres_resultat_wenn_kein_tool_use():
    """Wenn das LLM nur Text liefert (Tool ignoriert) → leere Liste,
    KEIN Crash."""
    from pruefung.llm_client import LlmResponse, _SimpleBlock, _subsumiere_via_complete

    class FakeClient:
        async def complete(self, **kwargs):  # noqa: ARG002
            return LlmResponse(
                content=[_SimpleBlock(type="text", text="nope")],
                stop_reason="end_turn",
                model="claude-sonnet-4-5",
                usage={"input_tokens": 5, "output_tokens": 3},
                cost_usd_estimate=0.0,
            )

    out = await _subsumiere_via_complete(FakeClient(), "PROMPT")
    assert out == []


def test_openai_response_zu_anthropic_blocks():
    from pruefung.llm_client import _openai_to_anthropic_content
    # Text + Tool-Call wie OpenAI sie liefert
    msg = {
        "content": "Hier ist mein Plan:",
        "tool_calls": [{
            "id": "call_123",
            "function": {"name": "search", "arguments": '{"query": "frist"}'},
        }],
    }
    blocks = _openai_to_anthropic_content(msg)
    assert len(blocks) == 2
    assert blocks[0].type == "text"
    assert blocks[0].text == "Hier ist mein Plan:"
    assert blocks[1].type == "tool_use"
    assert blocks[1].name == "search"
    assert blocks[1].input == {"query": "frist"}
