"""The Ollama adapter and provider selection. A fake Ollama server stands in: no network."""

import asyncio
import json

import httpx
import pytest

from app.core.config import copilot_settings
from app.integrations.llm.ollama_provider import OllamaProvider
from app.integrations.llm.provider import (
    LLMError,
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


class FakeOllama:
    """Answers POST /api/chat with queued replies and records each request body."""

    def __init__(self, *replies) -> None:
        self.replies = list(replies)
        self.requests: list[dict] = []
        self.urls: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.urls.append(str(request.url))
        self.requests.append(json.loads(request.content))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, httpx.Response):
            return reply
        return httpx.Response(200, json=reply)

    def provider(self, model: str = "llama3.1:8b") -> OllamaProvider:
        return OllamaProvider(
            model=model, base_url="http://ollama.test/", transport=httpx.MockTransport(self)
        )


def reply(content: str = "", tool_calls: list | None = None, done_reason: str = "stop") -> dict:
    message: dict = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {"model": "llama3.1:8b", "message": message, "done": True, "done_reason": done_reason}


def tool_call(name: str, arguments) -> dict:
    return {"function": {"name": name, "arguments": arguments}}


def respond(fake: FakeOllama, conversation=None, **kwargs):
    return asyncio.run(
        fake.provider(**kwargs).respond(
            system="system prompt",
            tools=[TOOL],
            conversation=conversation or [UserMessage("Quanto gastei?")],
        )
    )


def test_request_follows_the_ollama_chat_api():
    fake = FakeOllama(reply("Olá"))

    turn = respond(fake)

    assert fake.urls == ["http://ollama.test/api/chat"]
    assert fake.requests[0] == {
        "model": "llama3.1:8b",
        "stream": False,
        "keep_alive": "30m",
        "messages": [
            {"role": "system", "content": "system prompt"},
            {"role": "user", "content": "Quanto gastei?"},
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_spending_summary",
                    "description": "Totals for a period.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            }
        ],
        "options": {"temperature": 0, "num_ctx": 8192},
    }
    assert (turn.text, turn.tool_calls, turn.stop) == ("Olá", (), "end")


def test_tool_calls_are_parsed_and_given_ids():
    fake = FakeOllama(
        reply(
            tool_calls=[
                tool_call("get_spending_summary", {"period": {"preset": "previous_month"}}),
                tool_call("list_categories", {}),
            ]
        )
    )

    turn = respond(fake)

    assert turn.stop == "tool_use"
    assert [(call.id, call.name, call.arguments) for call in turn.tool_calls] == [
        ("call-0", "get_spending_summary", {"period": {"preset": "previous_month"}}),
        ("call-1", "list_categories", {}),
    ]


def test_arguments_sent_as_a_json_string_are_decoded():
    fake = FakeOllama(reply(tool_calls=[tool_call("list_categories", '{"a": 1}')]))

    assert respond(fake).tool_calls[0].arguments == {"a": 1}


@pytest.mark.parametrize("arguments", ["not json", None, [1, 2], 5])
def test_unusable_arguments_stay_invalid_instead_of_being_guessed(arguments):
    fake = FakeOllama(reply(tool_calls=[tool_call("get_spending_summary", arguments)]))

    # The Copilot validates arguments and rejects this; it is never turned into a valid call.
    assert respond(fake).tool_calls[0].arguments == {"_invalid": True}


def test_malformed_tool_calls_are_ignored():
    fake = FakeOllama(reply("Sem ferramenta.", tool_calls=[{"function": {}}, "x", {"other": 1}]))

    turn = respond(fake)

    assert turn.tool_calls == () and turn.stop == "end"


def test_inline_thinking_is_removed_from_the_answer():
    fake = FakeOllama(reply("<think>vou somar 1 + 1\n</think>\n\nVocê gastou R$ 10,00."))

    assert respond(fake).text == "Você gastou R$ 10,00."


def test_truncated_generation_is_reported():
    fake = FakeOllama(reply("Você gastou R$ 1", done_reason="length"))

    assert respond(fake).stop == "max_tokens"


def test_tool_results_go_back_one_message_each_naming_their_tool():
    first = FakeOllama(
        reply(
            tool_calls=[
                tool_call("get_spending_summary", {"period": {"preset": "current_month"}}),
                tool_call("list_categories", {}),
            ]
        )
    )
    turn = respond(first)
    results = ToolResults(
        (
            ToolResult("call-0", '{"total_spending": "10.00"}'),
            ToolResult("call-1", '{"error": "x"}', is_error=True),
        )
    )
    second = FakeOllama(reply("Você gastou R$ 10,00."))

    respond(second, [UserMessage("Quanto gastei?"), turn, results])

    system, user, assistant, tool_a, tool_b = second.requests[0]["messages"]
    assert (system["role"], user["role"]) == ("system", "user")
    # The model's own message is echoed as it came, tool calls included.
    assert assistant["role"] == "assistant"
    assert [call["function"]["name"] for call in assistant["tool_calls"]] == [
        "get_spending_summary",
        "list_categories",
    ]
    assert tool_a == {
        "role": "tool",
        "content": '{"total_spending": "10.00"}',
        "tool_name": "get_spending_summary",
    }
    assert tool_b == {"role": "tool", "content": '{"error": "x"}', "tool_name": "list_categories"}


@pytest.mark.parametrize(
    ("failure", "kind", "message"),
    [
        (
            httpx.Response(404, json={"error": "model 'llama3.1:8b' not found"}),
            "not_configured",
            "Ollama model 'llama3.1:8b' is not installed. Run: ollama pull llama3.1:8b",
        ),
        (
            httpx.Response(400, json={"error": "registry.ollama.ai/x does not support tools"}),
            "not_configured",
            "Ollama model 'llama3.1:8b' does not support tool calling. "
            "Choose a model with the 'tools' capability.",
        ),
        (
            httpx.Response(500, json={"error": "prompt was: quanto gastei com o cartão 1234?"}),
            "unavailable",
            "Ollama request failed (500).",
        ),
        (
            httpx.Response(500, text="<html>boom</html>"),
            "unavailable",
            "Ollama request failed (500).",
        ),
        (httpx.ConnectError("refused"), "unavailable", "Ollama is unreachable. Is it running?"),
        (httpx.ReadTimeout("slow"), "unavailable", "Ollama did not answer in time."),
        (
            httpx.Response(200, text="not json"),
            "unavailable",
            "Ollama returned an invalid response.",
        ),
        (
            httpx.Response(200, json={"done": True}),
            "unavailable",
            "Ollama returned an invalid response.",
        ),
        (
            httpx.Response(200, json={"message": "texto"}),
            "unavailable",
            "Ollama returned an invalid response.",
        ),
    ],
)
def test_failures_become_safe_errors(failure, kind, message):
    with pytest.raises(LLMError) as raised:
        respond(FakeOllama(failure))

    assert (raised.value.kind, str(raised.value)) == (kind, message)
    assert "cartão" not in str(raised.value)


def test_a_provider_without_a_model_is_not_configured():
    with pytest.raises(LLMError) as raised:
        OllamaProvider(model="")

    assert raised.value.kind == "not_configured"


# ---- provider selection ---------------------------------------------------------


@pytest.fixture
def env(monkeypatch):
    """Start from empty Copilot variables; empty values win over the developer's .env."""
    for name in ("COPILOT_PROVIDER", "COPILOT_MODEL", "OLLAMA_BASE_URL", "ANTHROPIC_API_KEY"):
        monkeypatch.setenv(name, "")
    return monkeypatch.setenv


def test_ollama_on_this_machine_is_the_default(env):
    settings = copilot_settings()

    assert (settings.provider, settings.model) == ("ollama", "llama3.1:8b")
    assert settings.base_url == "http://127.0.0.1:11434"
    assert settings.local is True
    assert settings.api_key == ""


def test_ollama_model_and_address_can_be_changed(env):
    env("COPILOT_MODEL", "qwen2.5:7b")
    env("OLLAMA_BASE_URL", "http://192.168.1.10:11434/")

    settings = copilot_settings()

    assert (settings.model, settings.base_url) == ("qwen2.5:7b", "http://192.168.1.10:11434")
    # Another machine on the network is not "this machine".
    assert settings.local is False


@pytest.mark.parametrize("url", ["http://localhost:11434", "http://[::1]:11434"])
def test_loopback_addresses_count_as_local(env, url):
    env("OLLAMA_BASE_URL", url)

    assert copilot_settings().local is True


@pytest.mark.parametrize(
    "url", ["ollama:11434", "ftp://127.0.0.1:11434", "http://user:pass@127.0.0.1:11434", "http://"]
)
def test_invalid_ollama_address_is_rejected(env, url):
    env("OLLAMA_BASE_URL", url)

    with pytest.raises(RuntimeError):
        copilot_settings()


def test_anthropic_is_opt_in_and_needs_its_key(env):
    env("COPILOT_PROVIDER", "Anthropic")
    with pytest.raises(RuntimeError):
        copilot_settings()

    env("ANTHROPIC_API_KEY", "key-value")
    settings = copilot_settings()

    assert (settings.provider, settings.model) == ("anthropic", "claude-opus-5-5")
    assert settings.local is False


def test_unknown_provider_is_rejected(env):
    env("COPILOT_PROVIDER", "openai")

    with pytest.raises(RuntimeError):
        copilot_settings()


def test_status_reports_the_local_default_without_calling_the_model(client, env):
    assert client.get("/copilot/status").json() == {
        "configured": True,
        "provider": "ollama",
        "model": "llama3.1:8b",
        "local": True,
    }


def test_status_reports_anthropic_as_not_local_and_never_returns_the_key(client, env):
    env("COPILOT_PROVIDER", "anthropic")
    env("ANTHROPIC_API_KEY", "key-value-do-not-leak")

    response = client.get("/copilot/status")

    assert response.json() == {
        "configured": True,
        "provider": "anthropic",
        "model": "claude-opus-5-5",
        "local": False,
    }
    assert "key-value-do-not-leak" not in response.text


def test_status_when_misconfigured(client, env):
    env("COPILOT_PROVIDER", "anthropic")

    assert client.get("/copilot/status").json() == {
        "configured": False,
        "provider": None,
        "model": None,
        "local": False,
    }


def test_ask_uses_ollama_end_to_end(client, env, monkeypatch, session):
    """Full path through the endpoint with the real adapter and a fake Ollama server."""
    fake = FakeOllama(
        reply(
            tool_calls=[tool_call("get_spending_summary", {"period": {"preset": "previous_month"}})]
        ),
        reply("Não há transações entre 01/09/2026 e 30/09/2026; o total foi R$ 0,00."),
    )
    monkeypatch.setattr("app.copilot.router.llm", fake.provider)

    response = client.post(
        "/copilot/ask", json={"question": "Quanto gastei no mês passado?", "today": "2026-10-07"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["no_data"] is True
    assert body["periods"] == [{"start_date": "2026-09-01", "end_date": "2026-09-30"}]
    tool_message = fake.requests[1]["messages"][-1]
    assert tool_message["role"] == "tool"
    assert tool_message["tool_name"] == "get_spending_summary"
    assert json.loads(tool_message["content"])["total_spending"] == "0.00"


def test_an_ollama_that_is_not_running_is_a_502_with_a_plain_message(client, env, monkeypatch):
    fake = FakeOllama(httpx.ConnectError("refused"))
    monkeypatch.setattr("app.copilot.router.llm", fake.provider)

    response = client.post(
        "/copilot/ask", json={"question": "Quanto gastei?", "today": "2026-10-07"}
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Ollama is unreachable. Is it running?"}


def test_a_missing_ollama_model_is_a_503_that_says_how_to_install_it(client, env, monkeypatch):
    fake = FakeOllama(httpx.Response(404, json={"error": "model not found"}))
    monkeypatch.setattr("app.copilot.router.llm", fake.provider)

    response = client.post(
        "/copilot/ask", json={"question": "Quanto gastei?", "today": "2026-10-07"}
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Ollama model 'llama3.1:8b' is not installed. Run: ollama pull llama3.1:8b"
    }
