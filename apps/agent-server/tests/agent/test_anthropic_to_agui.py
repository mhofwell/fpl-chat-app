"""Tests for AnthropicToAGUIAdapter."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from fpl_agent.adapters.anthropic_to_agui import AnthropicToAGUIAdapter


# ── Helpers to build mock Anthropic stream events ────────────────────


def _message_start():
    return SimpleNamespace(type="message_start")


def _content_block_start_text(index: int):
    return SimpleNamespace(
        type="content_block_start",
        index=index,
        content_block=SimpleNamespace(type="text", text=""),
    )


def _content_block_delta_text(index: int, text: str):
    return SimpleNamespace(
        type="content_block_delta",
        index=index,
        delta=SimpleNamespace(type="text_delta", text=text),
    )


def _content_block_start_tool(index: int, tool_id: str, name: str):
    return SimpleNamespace(
        type="content_block_start",
        index=index,
        content_block=SimpleNamespace(type="tool_use", id=tool_id, name=name, input={}),
    )


def _content_block_delta_tool(index: int, partial_json: str):
    return SimpleNamespace(
        type="content_block_delta",
        index=index,
        delta=SimpleNamespace(type="input_json_delta", partial_json=partial_json),
    )


def _content_block_start_thinking(index: int):
    return SimpleNamespace(
        type="content_block_start",
        index=index,
        content_block=SimpleNamespace(type="thinking"),
    )


def _content_block_delta_thinking(index: int, text: str):
    return SimpleNamespace(
        type="content_block_delta",
        index=index,
        delta=SimpleNamespace(type="thinking_delta", thinking=text),
    )


def _content_block_stop(index: int):
    return SimpleNamespace(type="content_block_stop", index=index)


def _message_delta(stop_reason: str):
    return SimpleNamespace(
        type="message_delta",
        delta=SimpleNamespace(stop_reason=stop_reason),
    )


def _message_stop():
    return SimpleNamespace(type="message_stop")


async def _collect(adapter, events):
    """Run a sequence of events through the adapter and collect AG-UI events."""
    out = []
    for ev in events:
        async for agui_event in adapter.adapt(ev):
            out.append(agui_event)
    return out


# ── Tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_text_only_response():
    """Plain text response: TextMessageStart, content deltas, TextMessageEnd."""
    adapter = AnthropicToAGUIAdapter()
    events = [
        _message_start(),
        _content_block_start_text(0),
        _content_block_delta_text(0, "Hello "),
        _content_block_delta_text(0, "world"),
        _content_block_stop(0),
        _message_delta("end_turn"),
        _message_stop(),
    ]

    agui_events = await _collect(adapter, events)
    types = [type(e).__name__ for e in agui_events]
    assert types == [
        "TextMessageStartEvent",
        "TextMessageContentEvent",
        "TextMessageContentEvent",
        "TextMessageEndEvent",
    ]
    assert agui_events[1].delta == "Hello "
    assert agui_events[2].delta == "world"
    # Same message_id across the three events
    msg_id = agui_events[0].message_id
    assert agui_events[1].message_id == msg_id
    assert agui_events[3].message_id == msg_id

    assert adapter.stop_reason == "end_turn"
    assert adapter.completed_tool_uses == []


@pytest.mark.asyncio
async def test_single_tool_use():
    """Tool use block: ToolCallStart, ToolCallArgs deltas, ToolCallEnd. Buffer assembled."""
    adapter = AnthropicToAGUIAdapter()
    events = [
        _message_start(),
        _content_block_start_tool(0, "toolu_abc", "get_players"),
        _content_block_delta_tool(0, '{"name"'),
        _content_block_delta_tool(0, ': "Haa'),
        _content_block_delta_tool(0, 'land"}'),
        _content_block_stop(0),
        _message_delta("tool_use"),
        _message_stop(),
    ]

    agui_events = await _collect(adapter, events)
    types = [type(e).__name__ for e in agui_events]
    assert types == [
        "ToolCallStartEvent",
        "ToolCallArgsEvent",
        "ToolCallArgsEvent",
        "ToolCallArgsEvent",
        "ToolCallEndEvent",
    ]
    assert agui_events[0].tool_call_id == "toolu_abc"
    assert agui_events[0].tool_call_name == "get_players"
    assert agui_events[1].delta == '{"name"'

    assert adapter.stop_reason == "tool_use"
    assert len(adapter.completed_tool_uses) == 1
    tu = adapter.completed_tool_uses[0]
    assert tu.id == "toolu_abc"
    assert tu.name == "get_players"
    assert tu.input_json == '{"name": "Haaland"}'


@pytest.mark.asyncio
async def test_text_then_tool_use():
    """Text block followed by tool_use block in the same response."""
    adapter = AnthropicToAGUIAdapter()
    events = [
        _message_start(),
        _content_block_start_text(0),
        _content_block_delta_text(0, "Let me check."),
        _content_block_stop(0),
        _content_block_start_tool(1, "toolu_x", "get_teams"),
        _content_block_delta_tool(1, '{"name": "Arsenal"}'),
        _content_block_stop(1),
        _message_delta("tool_use"),
        _message_stop(),
    ]

    agui_events = await _collect(adapter, events)
    types = [type(e).__name__ for e in agui_events]
    assert types == [
        "TextMessageStartEvent",
        "TextMessageContentEvent",
        "TextMessageEndEvent",
        "ToolCallStartEvent",
        "ToolCallArgsEvent",
        "ToolCallEndEvent",
    ]
    assert len(adapter.completed_tool_uses) == 1
    assert adapter.completed_tool_uses[0].input_json == '{"name": "Arsenal"}'


@pytest.mark.asyncio
async def test_thinking_block():
    """Extended thinking block emits ThinkingTextMessage* events."""
    adapter = AnthropicToAGUIAdapter()
    events = [
        _message_start(),
        _content_block_start_thinking(0),
        _content_block_delta_thinking(0, "Considering..."),
        _content_block_stop(0),
        _message_delta("end_turn"),
    ]

    agui_events = await _collect(adapter, events)
    types = [type(e).__name__ for e in agui_events]
    assert types == [
        "ThinkingTextMessageStartEvent",
        "ThinkingTextMessageContentEvent",
        "ThinkingTextMessageEndEvent",
    ]
    assert agui_events[1].delta == "Considering..."


@pytest.mark.asyncio
async def test_stop_reason_max_tokens():
    """stop_reason captures max_tokens correctly."""
    adapter = AnthropicToAGUIAdapter()
    await _collect(adapter, [_message_delta("max_tokens")])
    assert adapter.stop_reason == "max_tokens"


@pytest.mark.asyncio
async def test_parallel_tool_uses():
    """Multiple tool_use blocks in one response are tracked separately."""
    adapter = AnthropicToAGUIAdapter()
    events = [
        _message_start(),
        _content_block_start_tool(0, "toolu_1", "get_players"),
        _content_block_delta_tool(0, '{"a": 1}'),
        _content_block_stop(0),
        _content_block_start_tool(1, "toolu_2", "get_teams"),
        _content_block_delta_tool(1, '{"b": 2}'),
        _content_block_stop(1),
        _message_delta("tool_use"),
    ]

    await _collect(adapter, events)
    assert len(adapter.completed_tool_uses) == 2
    assert adapter.completed_tool_uses[0].id == "toolu_1"
    assert adapter.completed_tool_uses[0].input_json == '{"a": 1}'
    assert adapter.completed_tool_uses[1].id == "toolu_2"
    assert adapter.completed_tool_uses[1].input_json == '{"b": 2}'


@pytest.mark.asyncio
async def test_unknown_event_type_ignored():
    """Forward-compat: unknown event types are silently ignored."""
    adapter = AnthropicToAGUIAdapter()
    weird = SimpleNamespace(type="some_future_event_type")
    out = []
    async for e in adapter.adapt(weird):
        out.append(e)
    assert out == []
