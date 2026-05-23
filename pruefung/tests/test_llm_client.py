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
