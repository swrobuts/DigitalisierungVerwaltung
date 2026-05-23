"""LLM-Provider-Abstraktion.

Heute Anthropic, morgen vielleicht OpenAI oder ein lokales Modell. Diese
Abstraktion isoliert die LLM-Aufrufe an einer Stelle, sodass ein Wechsel
nicht durch alle Module gehen muss.

Zusätzlich: jeder Call wird gemessen (Input-/Output-Token) für
Cost-Tracking. Token-Daten werden vom Caller in pruefprotokoll.ergebnis_jsonb
persistiert.

Provider-Wahl über `LLM_PROVIDER` env (Default: 'anthropic'). Bei
neuem Provider muss nur eine neue Implementation der `LlmClient`-
Protocol-Klasse geschrieben werden.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Protocol


# Preise pro 1M Token (Stand Mai 2026, USD; ändert sich häufig).
# Quelle: anthropic.com/pricing, openai.com/pricing.
# Wir tracken nur, um die Größenordnung sichtbar zu machen — keine
# rechtsverbindliche Abrechnung.
PREISE_USD_PRO_M = {
    "claude-sonnet-4-5":      {"input": 3.0,  "output": 15.0},
    "claude-opus-4-5":        {"input": 15.0, "output": 75.0},
    "claude-haiku-4-5":       {"input": 0.8,  "output": 4.0},
    "gpt-4o":                 {"input": 2.5,  "output": 10.0},
    "gpt-4o-mini":            {"input": 0.15, "output": 0.6},
}


@dataclass
class LlmResponse:
    """Vereinheitlichte Antwort eines LLM-Calls."""
    # Liste der Content-Blocks: für Claude ein Mix aus text + tool_use,
    # für andere Provider zukünftig ggf. anderes Schema. Bewusst typed:
    # die Caller (layer_c_rag etc.) bekommen die rohen Anthropic-Blocks
    # für Tool-Use-Loops.
    content: list[Any]
    stop_reason: str | None
    model: str
    usage: dict[str, int] = field(default_factory=dict)  # input_tokens, output_tokens
    cost_usd_estimate: float | None = None


class LlmClient(Protocol):
    """Minimal-Interface, das alle Provider implementieren müssen."""

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 4096,
        model: str | None = None,
    ) -> LlmResponse: ...


# ── Anthropic-Implementation ─────────────────────────────────────────

class AnthropicLlmClient:
    """Standard-Implementation, ruft Claude via offizielles SDK."""

    def __init__(self, default_model: str = "claude-sonnet-4-5"):
        from anthropic import AsyncAnthropic
        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._default_model = default_model

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 4096,
        model: str | None = None,
    ) -> LlmResponse:
        m = model or self._default_model
        kwargs: dict[str, Any] = {
            "model": m,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        resp = await self._client.messages.create(**kwargs)
        usage = {
            "input_tokens": getattr(resp.usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(resp.usage, "output_tokens", 0) or 0,
        }
        return LlmResponse(
            content=resp.content,
            stop_reason=resp.stop_reason,
            model=m,
            usage=usage,
            cost_usd_estimate=_cost_usd(m, usage),
        )


def _cost_usd(model: str, usage: dict[str, int]) -> float | None:
    p = PREISE_USD_PRO_M.get(model)
    if not p:
        return None
    return round(
        (usage.get("input_tokens", 0) / 1_000_000) * p["input"]
        + (usage.get("output_tokens", 0) / 1_000_000) * p["output"],
        6,
    )


# ── Factory ──────────────────────────────────────────────────────────

def get_llm_client(default_model: str | None = None) -> LlmClient:
    """Liefert den konfigurierten Client. LLM_PROVIDER env bestimmt
    die Implementation. Bei Wechsel kein Code-Change in den Callern."""
    provider = os.environ.get("LLM_PROVIDER", "anthropic").lower()
    if provider == "anthropic":
        return AnthropicLlmClient(default_model or "claude-sonnet-4-5")
    # Weitere Provider hier (OpenAI, lokales Modell, …) wenn nötig.
    raise ValueError(
        f"LLM_PROVIDER={provider!r} nicht unterstützt. "
        f"Verfügbar: 'anthropic'. Für neue Provider eine neue Klasse "
        f"implementieren, die LlmClient erfüllt."
    )


# ── Accumulator: addiert Calls innerhalb einer Operation ────────────

@dataclass
class UsageTracker:
    """Sammelt Token-/Kosten-Aggregate über mehrere LLM-Calls einer
    logischen Operation (z.B. einen kompletten Prüfungs-Lauf). Wird vom
    Caller mit jedem LlmResponse.usage gefüttert und am Ende ins
    pruefprotokoll geschrieben."""
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd_estimate: float = 0.0

    def add(self, resp: LlmResponse) -> None:
        self.calls += 1
        self.input_tokens += resp.usage.get("input_tokens", 0)
        self.output_tokens += resp.usage.get("output_tokens", 0)
        if resp.cost_usd_estimate is not None:
            self.cost_usd_estimate = round(
                self.cost_usd_estimate + resp.cost_usd_estimate, 6,
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "calls": self.calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.input_tokens + self.output_tokens,
            "cost_usd_estimate": self.cost_usd_estimate,
        }
