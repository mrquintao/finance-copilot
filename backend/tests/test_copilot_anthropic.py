"""The Anthropic adapter: request shape, response parsing and error mapping. No network."""

import asyncio
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.integrations.llm.anthropic_provider import AnthropicProvider
from app.integrations.llm.provider import (
    LLMError,
    LLMTurn,
    ToolCall,
    ToolResult,
    ToolResults,
    ToolSpec,
    UserMessage,
)

TOOL = ToolSpec(
    name="get_spending_summary",
    description="Totals for a period.",
    input_schema={"type": "object", "properties": {}, "additionalProperties": False},
)


def text(value: str):
    return SimpleNamespace(type="text", text=value)


def tool_use(call_id: str, name: str, arguments: dict):
    return SimpleNamespace(type="tool_use", id=call_id, name=name, input=arguments)


class StubClient:
    """Stands in for anthropic.AsyncAnthropic: records the request, returns or raises."""

    def __init__(self, outcome) -> None:
        self.requests: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))
        self._outcome = outcome

    async def _create(self, **kwargs):
        self.requests.append(kwargs)
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


def respond(client: StubClient, conversation=None) -> LLMTurn:
    provider = AnthropicProvider(api_key="unused", client=client)
    return asyncio.run(
        provider.respond(
            system="system prompt",
            tools=[TOOL],
            conversation=conversation or [UserMessage("Quanto gastei?")],
        )
    )


def test_request_uses_the_default_model_adaptive_thinking_and_refusal_fallbacks():
    client = StubClient(SimpleNamespace(content=[text("Olá")], stop_reason="end_turn"))

    respond(client)

    request = client.requests[0]
    assert request["model"] == "claude-opus-5-5"
    assert request["system"] == "system prompt"
    assert request["messages"] == [{"role": "user", "content": "Quanto gastei?"}]
    assert request["tools"] == [
        {
            "name": "get_spending_summary",
            "description": "Totals for a period.",
            "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        }
    ]
    assert request["output_config"] == {"effort": "medium"}
    assert request["betas"] == ["server-side-fallback-2026-07-01"]
    assert request["fallbacks"] == "default"
    # Not accepted by this model: thinking budgets, sampling parameters, forced tool choice.
    for removed in ("thinking", "temperature", "top_p", "tool_choice"):
        assert removed not in request


def test_text_and_tool_calls_are_parsed():
    content = [
        SimpleNamespace(type="thinking", thinking=""),
        text("Vou consultar. "),
        tool_use("toolu_1", "get_spending_summary", {"period": {"preset": "current_month"}}),
        tool_use("toolu_2", "list_categories", {}),
    ]
    client = StubClient(SimpleNamespace(content=content, stop_reason="tool_use"))

    turn = respond(client)

    assert turn.text == "Vou consultar."
    assert turn.stop == "tool_use"
    assert turn.tool_calls == (
        ToolCall("toolu_1", "get_spending_summary", {"period": {"preset": "current_month"}}),
        ToolCall("toolu_2", "list_categories", {}),
    )
    assert turn.raw is content


@pytest.mark.parametrize(
    ("reason", "expected"),
    [
        ("end_turn", "end"),
        ("tool_use", "tool_use"),
        ("refusal", "refusal"),
        ("max_tokens", "max_tokens"),
        ("stop_sequence", "end"),
        (None, "end"),
    ],
)
def test_stop_reasons(reason, expected):
    client = StubClient(SimpleNamespace(content=[text("x")], stop_reason=reason))

    assert respond(client).stop == expected


def test_the_previous_turn_is_echoed_unchanged_and_tool_results_go_in_one_message():
    raw = [
        SimpleNamespace(type="thinking", thinking=""),
        tool_use("toolu_1", "list_categories", {}),
    ]
    previous = LLMTurn(
        text="", tool_calls=(ToolCall("toolu_1", "list_categories", {}),), stop="tool_use", raw=raw
    )
    results = ToolResults(
        (
            ToolResult("toolu_1", '{"categories": []}'),
            ToolResult("toolu_2", '{"error": "Unknown tool."}', is_error=True),
        )
    )
    client = StubClient(SimpleNamespace(content=[text("ok")], stop_reason="end_turn"))

    respond(client, [UserMessage("Pergunta"), previous, results])

    user, assistant, tool_message = client.requests[0]["messages"]
    assert user == {"role": "user", "content": "Pergunta"}
    assert assistant["role"] == "assistant" and assistant["content"] is raw
    assert tool_message == {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": "toolu_1",
                "content": '{"categories": []}',
                "is_error": False,
            },
            {
                "type": "tool_result",
                "tool_use_id": "toolu_2",
                "content": '{"error": "Unknown tool."}',
                "is_error": True,
            },
        ],
    }


def status_error(cls, status: int):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(status, request=request)
    return cls("prompt text: quanto gastei com o cartão 1234?", response=response, body=None)


@pytest.mark.parametrize(
    ("error", "kind", "message"),
    [
        (
            status_error(anthropic.AuthenticationError, 401),
            "not_configured",
            "Copilot model rejected the credentials (401).",
        ),
        (
            status_error(anthropic.PermissionDeniedError, 403),
            "not_configured",
            "Copilot model rejected the credentials (403).",
        ),
        (
            status_error(anthropic.RateLimitError, 429),
            "unavailable",
            "Copilot model rate limit exceeded (429).",
        ),
        (
            status_error(anthropic.BadRequestError, 400),
            "unavailable",
            "Copilot model request failed (400).",
        ),
        (
            status_error(anthropic.InternalServerError, 500),
            "unavailable",
            "Copilot model request failed (500).",
        ),
        (
            anthropic.APIConnectionError(
                request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
            ),
            "unavailable",
            "Copilot model is unreachable.",
        ),
    ],
)
def test_api_errors_become_safe_errors(error, kind, message):
    with pytest.raises(LLMError) as raised:
        respond(StubClient(error))

    assert raised.value.kind == kind
    assert str(raised.value) == message
    assert "cartão" not in str(raised.value)


def test_a_provider_without_a_key_is_not_configured():
    with pytest.raises(LLMError) as raised:
        AnthropicProvider(api_key="")

    assert raised.value.kind == "not_configured"
