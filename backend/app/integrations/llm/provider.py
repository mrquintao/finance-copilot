"""Boundary between the Copilot and whichever model serves it.

The domain talks to `LLMProvider` only, the same way synchronization talks to
`FinancialDataProvider`. A provider turns a conversation into the model's next turn: text,
tool calls, or both. It never sees the database and never computes anything.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Literal

StopReason = Literal["end", "tool_use", "refusal", "max_tokens"]


class LLMError(RuntimeError):
    """Safe model failure: the message never contains prompts, answers or credentials."""

    def __init__(self, message: str, *, kind: Literal["not_configured", "unavailable"]) -> None:
        super().__init__(message)
        self.kind = kind


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ToolResult:
    call_id: str
    content: str
    is_error: bool = False


@dataclass(frozen=True, slots=True)
class LLMTurn:
    text: str
    tool_calls: tuple[ToolCall, ...]
    stop: StopReason
    # Provider-specific content of the turn, echoed back unchanged on the next request.
    raw: Any = None


@dataclass(frozen=True, slots=True)
class UserMessage:
    text: str


@dataclass(frozen=True, slots=True)
class ToolResults:
    results: tuple[ToolResult, ...]


# A conversation is the user's message followed by alternating model turns and tool results.
ConversationItem = UserMessage | LLMTurn | ToolResults


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def respond(
        self,
        *,
        system: str,
        tools: list[ToolSpec],
        conversation: list[ConversationItem],
    ) -> LLMTurn:
        raise NotImplementedError
