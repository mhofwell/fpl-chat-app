"""Tests for MCP prompts.

Uses the `tool_deps` fixture from the sibling conftest, which
pre-populates fakeredis with the frozen bootstrap + fixtures sample data.
The prompts call the tool functions directly (same fakeredis-backed deps),
so no additional setup is needed.
"""

from __future__ import annotations

import pytest
from fastmcp.exceptions import ToolError
from mcp.types import PromptMessage, TextContent

from fpl_agent.mcp.prompts.briefing import team_briefing
from fpl_agent.mcp.prompts.transfer import transfer_debate


@pytest.mark.asyncio
async def test_team_briefing_returns_one_user_message(tool_deps):
    result = await team_briefing("Arsenal")

    assert isinstance(result, list)
    assert len(result) == 1
    msg = result[0]
    assert isinstance(msg, PromptMessage)
    assert msg.role == "user"
    assert isinstance(msg.content, TextContent)

    text = msg.content.text
    assert "Arsenal" in text
    assert "TEAM" in text
    assert "RECENT 5 RESULTS" in text
    assert "UPCOMING 5 FIXTURES" in text
    assert "IN-FORM PLAYERS" in text
    assert "Respond in this exact format" in text


@pytest.mark.asyncio
async def test_team_briefing_unknown_team_raises(tool_deps):
    with pytest.raises(ToolError):
        await team_briefing("Zzznonexistent")


@pytest.mark.asyncio
async def test_transfer_debate_returns_one_user_message(tool_deps):
    result = await transfer_debate("Haaland", "Saka")

    assert isinstance(result, list)
    assert len(result) == 1
    msg = result[0]
    assert isinstance(msg, PromptMessage)
    assert msg.role == "user"
    assert isinstance(msg.content, TextContent)

    text = msg.content.text
    assert "Haaland" in text
    assert "Saka" in text
    assert "OUTGOING PLAYER" in text
    assert "INCOMING PLAYER" in text
    assert "Recommendation" in text
    assert "Confidence" in text


@pytest.mark.asyncio
async def test_transfer_debate_unknown_player_raises(tool_deps):
    with pytest.raises(ToolError):
        await transfer_debate("Zzznonexistent", "Haaland")
