"""Tests for the AgentLoop with mocked Anthropic and McpBridge."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from fpl_agent.agent.loop import AgentLoop, AgentLoopError
from fpl_agent.mcp.system_prompt import DynamicContext


def _usage(input_tokens=100, output_tokens=50, cache_create=0, cache_read=0):
    """Mock Usage object with token counts."""
    return SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_creation_input_tokens=cache_create,
        cache_read_input_tokens=cache_read,
    )


def _text_block(text: str):
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(tool_id: str, name: str, input_dict: dict):
    return SimpleNamespace(type="tool_use", id=tool_id, name=name, input=input_dict)


def _response(stop_reason: str, content: list, usage=None):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=content,
        usage=usage or _usage(),
    )


@pytest.fixture
def mock_mcp_bridge():
    """Mock bridge that mimics the real McpBridge contract:
    list_tools_anthropic_format returns tools with cache_control on the last one."""
    bridge = MagicMock()
    bridge.list_tools_anthropic_format = AsyncMock(
        return_value=[
            {
                "name": "get_players",
                "description": "Query players",
                "input_schema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_teams",
                "description": "Query teams",
                "input_schema": {"type": "object", "properties": {}},
                "cache_control": {"type": "ephemeral"},
            },
        ]
    )
    bridge.call_tool = AsyncMock(return_value=('{"data": [], "meta": {}}', False))
    return bridge


@pytest.fixture
def mock_anthropic():
    client = MagicMock()
    client.messages = MagicMock()
    client.messages.create = AsyncMock()
    return client


@pytest.fixture
def loop(mock_anthropic, mock_mcp_bridge):
    return AgentLoop(
        anthropic_client=mock_anthropic,
        mcp_bridge=mock_mcp_bridge,
        model="claude-test",
        max_tool_iterations=3,
    )


@pytest.mark.asyncio
async def test_simple_response_no_tools(loop, mock_anthropic):
    """Anthropic returns end_turn immediately — loop returns the text."""
    mock_anthropic.messages.create.return_value = _response(
        stop_reason="end_turn",
        content=[_text_block("Arsenal are playing well this season.")],
    )

    result = await loop.run("How is Arsenal doing?")

    assert result.response_text == "Arsenal are playing well this season."
    assert result.iterations == 1
    assert result.tool_calls == []
    assert mock_anthropic.messages.create.call_count == 1


@pytest.mark.asyncio
async def test_single_tool_call(loop, mock_anthropic, mock_mcp_bridge):
    """Anthropic asks for a tool, then returns final answer."""
    mock_anthropic.messages.create.side_effect = [
        _response(
            stop_reason="tool_use",
            content=[_tool_use_block("tu_1", "get_players", {"name": "Haaland"})],
        ),
        _response(
            stop_reason="end_turn",
            content=[_text_block("Haaland has 16 goals.")],
        ),
    ]

    result = await loop.run("How many goals does Haaland have?")

    assert result.response_text == "Haaland has 16 goals."
    assert result.iterations == 2
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].name == "get_players"
    assert result.tool_calls[0].input == {"name": "Haaland"}
    mock_mcp_bridge.call_tool.assert_awaited_once_with("get_players", {"name": "Haaland"})


@pytest.mark.asyncio
async def test_max_iterations_exceeded(loop, mock_anthropic):
    """If Anthropic keeps asking for tools, loop raises after max iterations."""
    mock_anthropic.messages.create.return_value = _response(
        stop_reason="tool_use",
        content=[_tool_use_block("tu_x", "get_players", {})],
    )

    with pytest.raises(AgentLoopError, match="max_tool_iterations"):
        await loop.run("infinite loop")


@pytest.mark.asyncio
async def test_tool_error_forwarded_to_claude(loop, mock_anthropic, mock_mcp_bridge):
    """When the bridge reports a tool error, the loop forwards it as is_error."""
    mock_mcp_bridge.call_tool.return_value = ("Tool error: not found", True)
    mock_anthropic.messages.create.side_effect = [
        _response(
            stop_reason="tool_use",
            content=[_tool_use_block("tu_e", "get_players", {"name": "Zzz"})],
        ),
        _response(
            stop_reason="end_turn",
            content=[_text_block("I couldn't find that player.")],
        ),
    ]

    result = await loop.run("Tell me about Zzz")

    assert result.tool_calls[0].is_error is True
    # The second call to Anthropic should include the tool_result with is_error
    second_call_messages = mock_anthropic.messages.create.call_args_list[1].kwargs["messages"]
    user_tool_result = second_call_messages[-1]["content"][0]
    assert user_tool_result["is_error"] is True


@pytest.mark.asyncio
async def test_cache_control_on_last_tool(loop, mock_anthropic, mock_mcp_bridge):
    """Tools list passed to Anthropic has cache_control on the LAST tool."""
    mock_anthropic.messages.create.return_value = _response(
        stop_reason="end_turn",
        content=[_text_block("ok")],
    )

    await loop.run("hello")

    call_kwargs = mock_anthropic.messages.create.call_args.kwargs
    tools = call_kwargs["tools"]
    assert "cache_control" not in tools[0]
    assert tools[-1]["cache_control"] == {"type": "ephemeral"}


@pytest.mark.asyncio
async def test_cache_control_on_static_system_block(loop, mock_anthropic):
    """The first system block (static) has cache_control; the second (dynamic) does not."""
    mock_anthropic.messages.create.return_value = _response(
        stop_reason="end_turn",
        content=[_text_block("ok")],
    )

    await loop.run("hello", DynamicContext(current_gameweek_number=15))

    system_blocks = mock_anthropic.messages.create.call_args.kwargs["system"]
    assert system_blocks[0]["cache_control"] == {"type": "ephemeral"}
    assert "cache_control" not in system_blocks[1]
    # The dynamic block should mention the gameweek
    assert "Gameweek: 15" in system_blocks[1]["text"]


@pytest.mark.asyncio
async def test_usage_logging_includes_cache_metrics(loop, mock_anthropic):
    """Cache_creation and cache_read tokens are passed to the logger."""
    from unittest.mock import patch

    mock_anthropic.messages.create.return_value = _response(
        stop_reason="end_turn",
        content=[_text_block("ok")],
        usage=_usage(input_tokens=200, output_tokens=80, cache_create=2500, cache_read=0),
    )

    with patch("fpl_agent.agent.loop.log") as mock_log:
        await loop.run("hi")

    # Find the anthropic_usage log call
    usage_calls = [
        c for c in mock_log.info.call_args_list
        if c.args and c.args[0] == "anthropic_usage"
    ]
    assert len(usage_calls) == 1
    kwargs = usage_calls[0].kwargs
    assert kwargs["input_tokens"] == 200
    assert kwargs["output_tokens"] == 80
    assert kwargs["cache_creation_input_tokens"] == 2500
    assert kwargs["cache_read_input_tokens"] == 0


@pytest.mark.asyncio
async def test_max_tokens_truncation_logs_warning(loop, mock_anthropic):
    """When stop_reason='max_tokens', a warning is logged and stop_reason is propagated."""
    from unittest.mock import patch

    mock_anthropic.messages.create.return_value = _response(
        stop_reason="max_tokens",
        content=[_text_block("partial answer cut off because")],
    )

    with patch("fpl_agent.agent.loop.log") as mock_log:
        result = await loop.run("write me a long essay")

    assert result.stop_reason == "max_tokens"
    assert result.response_text == "partial answer cut off because"
    truncation_warnings = [
        c for c in mock_log.warning.call_args_list
        if c.args and c.args[0] == "anthropic_response_truncated"
    ]
    assert len(truncation_warnings) == 1


@pytest.mark.asyncio
async def test_empty_text_response_logs_warning(loop, mock_anthropic):
    """When the model returns no text blocks, a warning is logged."""
    from unittest.mock import patch

    mock_anthropic.messages.create.return_value = _response(
        stop_reason="end_turn",
        content=[],  # no blocks at all
    )

    with patch("fpl_agent.agent.loop.log") as mock_log:
        result = await loop.run("hi")

    assert result.response_text == ""
    empty_warnings = [
        c for c in mock_log.warning.call_args_list
        if c.args and c.args[0] == "anthropic_response_empty_text"
    ]
    assert len(empty_warnings) == 1
