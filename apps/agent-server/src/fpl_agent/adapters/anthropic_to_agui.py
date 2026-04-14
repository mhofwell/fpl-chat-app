"""Anthropic streaming events -> AG-UI events adapter.

Stateful per Anthropic round (one streamed assistant turn). The adapter
walks the stream of `RawMessageStreamEvent` objects, yields the AG-UI
events that correspond to each, and accumulates state needed by the
agent loop after the stream ends:

  - stop_reason (from `message_delta`) — drives the loop's iteration
  - completed_tool_uses — list of tool calls with assembled JSON args

Usage:
    adapter = AnthropicToAGUIAdapter()
    async with anthropic_client.messages.stream(...) as stream:
        async for event in stream:
            async for agui_event in adapter.adapt(event):
                yield agui_event
    if adapter.stop_reason == "tool_use":
        for tu in adapter.completed_tool_uses:
            ...

The adapter is stateless wrt requests and runs — instantiate one per
Anthropic round (per call to `messages.stream`).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from ag_ui.core.events import (
    BaseEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ThinkingTextMessageContentEvent,
    ThinkingTextMessageEndEvent,
    ThinkingTextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
)


@dataclass
class ToolUseRecord:
    """A completed tool_use block ready for execution by the agent loop."""

    id: str
    name: str
    input_json: str  # full JSON string assembled from input_json_delta events


@dataclass
class _BlockState:
    """Per-content-block state tracked while streaming."""

    block_type: str  # "text" | "tool_use" | "thinking"
    message_id: str | None = None  # for text blocks
    tool_use_id: str | None = None  # for tool_use blocks
    tool_use_name: str | None = None
    tool_input_buffer: str = ""


class AnthropicToAGUIAdapter:
    """Translates Anthropic streaming events to AG-UI protocol events."""

    def __init__(self) -> None:
        self._blocks: dict[int, _BlockState] = {}
        self._stop_reason: str | None = None
        self._completed_tool_uses: list[ToolUseRecord] = []

    @property
    def stop_reason(self) -> str | None:
        return self._stop_reason

    @property
    def completed_tool_uses(self) -> list[ToolUseRecord]:
        return list(self._completed_tool_uses)

    async def adapt(self, event: Any) -> AsyncIterator[BaseEvent]:
        """Yield zero or more AG-UI events for one Anthropic stream event."""
        event_type = getattr(event, "type", None)

        if event_type == "message_start":
            return  # nothing to emit; message_id comes from content blocks

        if event_type == "content_block_start":
            async for e in self._on_content_block_start(event):
                yield e
            return

        if event_type == "content_block_delta":
            async for e in self._on_content_block_delta(event):
                yield e
            return

        if event_type == "content_block_stop":
            async for e in self._on_content_block_stop(event):
                yield e
            return

        if event_type == "message_delta":
            self._on_message_delta(event)
            return

        if event_type == "message_stop":
            return  # nothing to emit; loop yields RunFinished after stream ends

        # Unknown event type — silently ignore for forward compat
        return

    async def _on_content_block_start(self, event: Any) -> AsyncIterator[BaseEvent]:
        index = event.index
        block = event.content_block
        block_type = block.type

        if block_type == "text":
            msg_id = str(uuid.uuid4())
            self._blocks[index] = _BlockState(block_type="text", message_id=msg_id)
            yield TextMessageStartEvent(message_id=msg_id, role="assistant")

        elif block_type == "tool_use":
            self._blocks[index] = _BlockState(
                block_type="tool_use",
                tool_use_id=block.id,
                tool_use_name=block.name,
            )
            yield ToolCallStartEvent(
                tool_call_id=block.id,
                tool_call_name=block.name,
            )

        elif block_type == "thinking":
            self._blocks[index] = _BlockState(block_type="thinking")
            yield ThinkingTextMessageStartEvent()

        # Other block types (e.g., redacted_thinking) are ignored

    async def _on_content_block_delta(self, event: Any) -> AsyncIterator[BaseEvent]:
        index = event.index
        block_state = self._blocks.get(index)
        if block_state is None:
            return  # delta without a start — shouldn't happen

        delta = event.delta
        delta_type = getattr(delta, "type", None)

        if delta_type == "text_delta" and block_state.block_type == "text":
            text = delta.text
            if text and block_state.message_id:
                yield TextMessageContentEvent(
                    message_id=block_state.message_id,
                    delta=text,
                )

        elif delta_type == "input_json_delta" and block_state.block_type == "tool_use":
            partial = delta.partial_json
            if partial and block_state.tool_use_id:
                block_state.tool_input_buffer += partial
                yield ToolCallArgsEvent(
                    tool_call_id=block_state.tool_use_id,
                    delta=partial,
                )

        elif delta_type == "thinking_delta" and block_state.block_type == "thinking":
            thinking = delta.thinking
            if thinking:
                yield ThinkingTextMessageContentEvent(delta=thinking)

    async def _on_content_block_stop(self, event: Any) -> AsyncIterator[BaseEvent]:
        index = event.index
        block_state = self._blocks.pop(index, None)
        if block_state is None:
            return

        if block_state.block_type == "text" and block_state.message_id:
            yield TextMessageEndEvent(message_id=block_state.message_id)

        elif block_state.block_type == "tool_use" and block_state.tool_use_id:
            yield ToolCallEndEvent(tool_call_id=block_state.tool_use_id)
            self._completed_tool_uses.append(
                ToolUseRecord(
                    id=block_state.tool_use_id,
                    name=block_state.tool_use_name or "",
                    input_json=block_state.tool_input_buffer,
                )
            )

        elif block_state.block_type == "thinking":
            yield ThinkingTextMessageEndEvent()

    def _on_message_delta(self, event: Any) -> None:
        delta = getattr(event, "delta", None)
        if delta is not None:
            stop_reason = getattr(delta, "stop_reason", None)
            if stop_reason:
                self._stop_reason = stop_reason
