"""Ollama adapter: a model running on the user's own machine, reached over its local HTTP API.

Uses POST /api/chat with tool calling. Nothing leaves the machine Ollama runs on, there is no
API key and no per-request cost. Small local models follow instructions less reliably than
hosted ones, so the Copilot's own guardrails (argument validation, the amount check, the step
limit) matter more here, not less.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.integrations.llm.provider import (
    ConversationItem,
    LLMError,
    LLMProvider,
    LLMTurn,
    ToolCall,
    ToolResults,
    ToolSpec,
    UserMessage,
)

# Ollama's default context window is small; tool definitions plus results need more room.
CONTEXT_TOKENS = 8192
# Loading the model into memory is the slowest step on a CPU, so it stays loaded for a while
# after each question instead of Ollama's default of five minutes.
KEEP_ALIVE = "30m"
# Some reasoning models write their reasoning inline instead of in the `thinking` field.
INLINE_THINKING = re.compile(r"<think>.*?</think>", re.DOTALL)


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(
        self,
        *,
        model: str,
        base_url: str = "http://127.0.0.1:11434",
        timeout_seconds: float = 300,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not model:
            raise LLMError("Copilot model is not configured.", kind="not_configured")
        self._model = model
        self._base_url = base_url.rstrip("/")
        # Generation on a desktop can take minutes; connecting should not.
        self._timeout = httpx.Timeout(timeout_seconds, connect=5)
        self._transport = transport

    async def respond(
        self,
        *,
        system: str,
        tools: list[ToolSpec],
        conversation: list[ConversationItem],
    ) -> LLMTurn:
        body = {
            "model": self._model,
            "stream": False,
            "keep_alive": KEEP_ALIVE,
            "messages": [{"role": "system", "content": system}, *self._messages(conversation)],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                }
                for tool in tools
            ],
            # Temperature 0: the same question should lead to the same queries.
            "options": {"temperature": 0, "num_ctx": CONTEXT_TOKENS},
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.post(f"{self._base_url}/api/chat", json=body)
        except httpx.TimeoutException as exc:
            raise LLMError("Ollama did not answer in time.", kind="unavailable") from exc
        except httpx.TransportError as exc:
            raise LLMError("Ollama is unreachable. Is it running?", kind="unavailable") from exc

        if response.status_code >= 400:
            raise self._failure(response)
        try:
            payload = response.json()
            message = payload["message"]
            if not isinstance(message, dict):
                raise TypeError
        except (ValueError, KeyError, TypeError) as exc:
            raise LLMError("Ollama returned an invalid response.", kind="unavailable") from exc

        calls = []
        for index, item in enumerate(message.get("tool_calls") or []):
            function = item.get("function") if isinstance(item, dict) else None
            if not isinstance(function, dict) or not isinstance(function.get("name"), str):
                continue
            arguments = function.get("arguments")
            if isinstance(arguments, str):
                # The API returns an object; some models still produce a JSON string.
                try:
                    arguments = json.loads(arguments)
                except ValueError:
                    arguments = None
            # Ollama tool calls carry no id, so one is assigned per turn. Invalid arguments
            # stay invalid: the Copilot rejects them and tells the model.
            calls.append(
                ToolCall(
                    id=f"call-{index}",
                    name=function["name"],
                    arguments=arguments if isinstance(arguments, dict) else {"_invalid": True},
                )
            )

        text = INLINE_THINKING.sub("", str(message.get("content") or "")).strip()
        if calls:
            stop = "tool_use"
        elif payload.get("done_reason") == "length":
            stop = "max_tokens"
        else:
            stop = "end"
        return LLMTurn(text=text, tool_calls=tuple(calls), stop=stop, raw=message)

    def _failure(self, response: httpx.Response) -> LLMError:
        """Describe the failure from the status; Ollama's own text is read but never echoed."""
        try:
            detail = str(response.json().get("error", "")).lower()
        except (ValueError, AttributeError):
            detail = ""
        if response.status_code == 404:
            return LLMError(
                f"Ollama model '{self._model}' is not installed. Run: ollama pull {self._model}",
                kind="not_configured",
            )
        if "does not support tools" in detail:
            return LLMError(
                f"Ollama model '{self._model}' does not support tool calling. "
                "Choose a model with the 'tools' capability.",
                kind="not_configured",
            )
        return LLMError(f"Ollama request failed ({response.status_code}).", kind="unavailable")

    @staticmethod
    def _messages(conversation: list[ConversationItem]) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        names: dict[str, str] = {}
        for item in conversation:
            if isinstance(item, UserMessage):
                messages.append({"role": "user", "content": item.text})
            elif isinstance(item, LLMTurn):
                # The model's own message goes back as it came, tool calls included.
                messages.append(item.raw)
                names = {call.id: call.name for call in item.tool_calls}
            elif isinstance(item, ToolResults):
                # One message per result, naming the tool it answers (calls have no ids).
                messages.extend(
                    {
                        "role": "tool",
                        "content": result.content,
                        "tool_name": names.get(result.call_id, ""),
                    }
                    for result in item.results
                )
        return messages
