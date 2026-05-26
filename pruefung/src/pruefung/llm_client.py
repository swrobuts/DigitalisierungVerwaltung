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

import json
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

# Provider-Metadaten für die Compliance-Seite (was läuft wo, was geht
# über externe APIs, was lokal). Wird über provider_meta() abgefragt.
PROVIDER_META = {
    "anthropic": {
        "anbieter": "Anthropic PBC",
        "verarbeitungsort": "USA (oder EU-Endpoint wenn konfiguriert)",
        "datenfluss": "extern — Antrag-Payload + AHP-Sections gehen an Cloud-API",
        "lokal": False,
    },
    "lmstudio": {
        "anbieter": "LM Studio (lokal)",
        "verarbeitungsort": "lokales Netzwerk / on-premise",
        "datenfluss": "keine externe Übertragung — Modell läuft auf eigener Hardware",
        "lokal": True,
    },
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


# Tool-Schema für die Layer-B-Subsumtion. Wird vom LLM via tool_choice
# erzwungen → strukturiertes JSON pro Norm-Aussage, kein Free-Form.
# Der norm_subsumtion-Validator vergleicht die `ref`-Werte mit der
# vorab geladenen DB-Liste — erfundene refs werden dort verworfen.
SUBSUMTION_TOOL: dict[str, Any] = {
    "name": "liefere_subsumtion",
    "description": (
        "Beurteilt pro Norm-Aussage, ob der Antrag dazu passt. "
        "Liefere einen Eintrag pro Norm-Aussage, die im Prompt-Block "
        "'Norm-Statements' aufgeführt ist. Keine Aussagen erfinden — "
        "wenn ein Statement nicht beurteilbar ist, 'unklar' wählen."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "befunde": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ref": {
                            "type": "string",
                            "description": (
                                "Die genaue ref aus dem Prompt-Block, "
                                "z.B. 'AHP 2.1.4'. Darf NICHT erfunden werden."
                            ),
                        },
                        "beurteilung": {
                            "type": "string",
                            "enum": ["passt", "passt_nicht", "unklar"],
                        },
                        "begruendung": {
                            "type": "string",
                            "description": (
                                "Maximal 2 Sätze, konkreter Bezug zum Antrag. "
                                "Keine Quellen außerhalb der Norm-Aussage nennen."
                            ),
                        },
                        "konfidenz": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                        },
                    },
                    "required": ["ref", "beurteilung", "begruendung"],
                },
            },
        },
        "required": ["befunde"],
    },
}


_SUBSUMTION_SYSTEM = (
    "Du bist Sachbearbeiter:in für AHP-Förderungen der Stadt Würzburg "
    "und subsumierst Anträge gegen kuratierte Norm-Aussagen.\n\n"
    "HALLUZINATIONS-SCHUTZ (absolut bindend): Es darf NIE etwas erfunden "
    "oder hinzugefügt werden, was weder in der Rechtsgrundlage noch in "
    "den PDFs enthalten ist. Du beurteilst NUR die im Prompt aufgeführten "
    "Norm-Aussagen — keine eigenen § zitieren, keine zusätzlichen Quellen, "
    "keine Werte erfinden. Wenn die Datenlage nicht reicht, wähle 'unklar'."
)


async def _subsumiere_via_complete(
    client: "LlmClient",
    prompt: str,
    *,
    max_tokens: int = 4096,
) -> list[dict[str, Any]]:
    """Provider-agnostischer Helper: ruft client.complete() mit dem
    Subsumtions-Tool auf und extrahiert die `befunde`-Liste aus dem
    tool_use-Block.

    Liefert leere Liste, wenn das LLM keinen tool_use-Block produziert
    (kann passieren wenn das Modell den Tool-Use ignoriert — wir wollen
    dann lieber 0 Befunde als einen Crash).
    """
    resp = await client.complete(
        system=_SUBSUMTION_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        tools=[SUBSUMTION_TOOL],
        max_tokens=max_tokens,
    )
    for block in resp.content:
        btype = getattr(block, "type", None)
        bname = getattr(block, "name", None)
        if btype == "tool_use" and bname == "liefere_subsumtion":
            inp = getattr(block, "input", None) or {}
            befunde = inp.get("befunde") if isinstance(inp, dict) else None
            return list(befunde or [])
    return []


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

    async def subsumiere_normstatements(
        self, prompt: str,
    ) -> list[dict[str, Any]]:
        """Layer-B-Subsumtion via Anthropic Tool-Use → strukturiertes JSON
        pro Norm-Aussage. Provider-agnostischer Helper kümmert sich um den
        eigentlichen Call + Block-Extraktion."""
        return await _subsumiere_via_complete(self, prompt)


# ── LM Studio (lokal, OpenAI-kompatibel) ─────────────────────────────

class LMStudioLlmClient:
    """Spricht ein lokal laufendes LM Studio über dessen OpenAI-kompatiblen
    Endpoint (Default http://localhost:1234/v1/chat/completions). Keine
    Cloud-Übertragung — Datenschutz-optimal.

    Das interne Format ist weiterhin Anthropic-Stil (text + tool_use
    Content-Blocks). Wir mappen beim Senden und Empfangen zwischen
    Anthropic- und OpenAI-Schema:
      - Anthropic messages [{role, content: str|list[block]}] → OpenAI
        [{role, content/tool_calls/tool_call_id}]
      - Anthropic tools [{name, input_schema}] → OpenAI tools
        [{type:'function', function:{name, parameters}}]
      - Response: OpenAI choices[0].message → Anthropic content blocks

    Cost-Tracking: lokales Modell hat keine Token-Preise; wir tracken
    nur die Token-Anzahl (cost = 0).
    """

    def __init__(
        self,
        default_model: str = "local-model",
        base_url: str | None = None,
    ):
        self._default_model = (
            default_model
            or os.environ.get("LMSTUDIO_MODEL", "local-model")
        )
        self._base_url = (
            base_url
            or os.environ.get("LMSTUDIO_BASE_URL", "http://localhost:1234/v1")
        ).rstrip("/")

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 4096,
        model: str | None = None,
    ) -> LlmResponse:
        import httpx
        m = model or self._default_model
        openai_messages = _anthropic_to_openai_messages(system, messages)
        body: dict[str, Any] = {
            "model": m,
            "messages": openai_messages,
            "max_tokens": max_tokens,
        }
        if tools:
            body["tools"] = [_anthropic_to_openai_tool(t) for t in tools]
            body["tool_choice"] = "auto"
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post(f"{self._base_url}/chat/completions", json=body)
            r.raise_for_status()
            data = r.json()
        msg = data["choices"][0]["message"]
        finish_reason = data["choices"][0].get("finish_reason", "stop")
        content_blocks = _openai_to_anthropic_content(msg)
        # Anthropic-style stop_reason
        if finish_reason == "tool_calls":
            stop_reason = "tool_use"
        elif finish_reason == "length":
            stop_reason = "max_tokens"
        else:
            stop_reason = "end_turn"
        usage_raw = data.get("usage") or {}
        usage = {
            "input_tokens": usage_raw.get("prompt_tokens", 0) or 0,
            "output_tokens": usage_raw.get("completion_tokens", 0) or 0,
        }
        return LlmResponse(
            content=content_blocks,
            stop_reason=stop_reason,
            model=m,
            usage=usage,
            cost_usd_estimate=0.0,  # lokales Modell — keine Kosten
        )

    async def subsumiere_normstatements(
        self, prompt: str,
    ) -> list[dict[str, Any]]:
        """Layer-B-Subsumtion. Auf LM Studio läuft dasselbe Tool-Schema
        — der Mapper übersetzt Anthropic-Tool → OpenAI-Function und das
        tool_use-Result zurück, sodass die Aufrufer-Logik identisch ist."""
        return await _subsumiere_via_complete(self, prompt)


# ── Format-Mapping Anthropic ↔ OpenAI ────────────────────────────────

def _anthropic_to_openai_tool(t: dict[str, Any]) -> dict[str, Any]:
    """Anthropic-Tool-Schema → OpenAI-Function-Schema."""
    return {
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t.get("description", ""),
            "parameters": t["input_schema"],
        },
    }


def _anthropic_to_openai_messages(
    system: str, messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """System-Prompt + Anthropic-Messages → OpenAI-Messages."""
    out: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for m in messages:
        role = m["role"]
        content = m["content"]
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue
        # content ist Liste von Blocks (text / tool_use / tool_result)
        assistant_text_parts: list[str] = []
        assistant_tool_calls: list[dict] = []
        for block in content:
            btype = _block_type(block)
            if btype == "text":
                assistant_text_parts.append(_block_text(block))
            elif btype == "tool_use":
                assistant_tool_calls.append({
                    "id": _block_attr(block, "id"),
                    "type": "function",
                    "function": {
                        "name": _block_attr(block, "name"),
                        "arguments": json.dumps(
                            _block_attr(block, "input") or {},
                            ensure_ascii=False,
                        ),
                    },
                })
            elif btype == "tool_result":
                # tool_result wird zu eigener user-Message mit role=tool
                out.append({
                    "role": "tool",
                    "tool_call_id": _block_attr(block, "tool_use_id"),
                    "content": _block_attr(block, "content") or "",
                })
        if role == "assistant" and (assistant_text_parts or assistant_tool_calls):
            msg: dict[str, Any] = {"role": "assistant"}
            if assistant_text_parts:
                msg["content"] = "\n".join(assistant_text_parts)
            else:
                msg["content"] = None
            if assistant_tool_calls:
                msg["tool_calls"] = assistant_tool_calls
            out.append(msg)
        elif role == "user" and assistant_text_parts:
            # falls user-Message tatsächlich nur Text in Blockform war
            out.append({"role": "user", "content": "\n".join(assistant_text_parts)})
    return out


def _openai_to_anthropic_content(msg: dict[str, Any]) -> list[Any]:
    """OpenAI-Antwort-Message → Anthropic-Content-Blocks. Dynamische
    Klassen (statt anthropic.types) damit der Aufrufer .type/.text/.id/.input
    wie bei Anthropic abfragen kann."""
    blocks: list[Any] = []
    text = msg.get("content")
    if text:
        blocks.append(_SimpleBlock(type="text", text=text))
    for call in msg.get("tool_calls") or []:
        fn = call.get("function") or {}
        args_raw = fn.get("arguments") or "{}"
        try:
            inp = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
        except json.JSONDecodeError:
            inp = {}
        blocks.append(_SimpleBlock(
            type="tool_use",
            id=call.get("id") or "",
            name=fn.get("name") or "",
            input=inp,
        ))
    return blocks


class _SimpleBlock:
    """Anthropic-Block-kompatibles Stub-Objekt für LM-Studio-Antworten —
    Aufrufer können wie gewohnt .type / .text / .id / .name / .input lesen."""
    def __init__(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


def _block_type(block: Any) -> str | None:
    return getattr(block, "type", None) or (
        block.get("type") if isinstance(block, dict) else None
    )


def _block_text(block: Any) -> str:
    return getattr(block, "text", None) or (
        block.get("text", "") if isinstance(block, dict) else ""
    )


def _block_attr(block: Any, name: str) -> Any:
    val = getattr(block, name, None)
    if val is not None:
        return val
    if isinstance(block, dict):
        return block.get(name)
    return None


def provider_meta(provider: str | None = None) -> dict[str, Any]:
    """Liefert Metadaten zum aktuellen LLM-Provider — wird im
    Compliance-Status angezeigt."""
    p = (provider or os.environ.get("LLM_PROVIDER", "anthropic")).lower()
    meta = PROVIDER_META.get(p, {
        "anbieter": p,
        "verarbeitungsort": "unbekannt",
        "datenfluss": "unbekannt",
        "lokal": False,
    })
    return {
        "provider": p,
        "model": os.environ.get(
            "LMSTUDIO_MODEL" if p == "lmstudio" else "ANTHROPIC_MODEL",
            "claude-sonnet-4-5" if p == "anthropic" else "local-model",
        ),
        **meta,
    }


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
    if provider == "lmstudio":
        # Lokales Modell via LM Studio — Default-Modell aus env (LM Studio
        # listet das aktuell geladene Modell unter /v1/models).
        return LMStudioLlmClient(default_model=default_model or "")
    raise ValueError(
        f"LLM_PROVIDER={provider!r} nicht unterstützt. "
        f"Verfügbar: 'anthropic', 'lmstudio'. Für neue Provider eine "
        f"neue Klasse implementieren, die LlmClient erfüllt."
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
