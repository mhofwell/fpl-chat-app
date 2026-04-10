"""Tests for the get_fixtures MCP tool."""

from __future__ import annotations

import pytest
from fastmcp.exceptions import ToolError

from fpl_agent.mcp.tools.fixtures import get_fixtures


@pytest.mark.asyncio
async def test_all_fixtures_neutral_shape(tool_deps):
    """Without team_id, returns neutral shape."""
    result = await get_fixtures(limit=3)
    for f in result.data:
        assert f.home_team is not None
        assert f.away_team is not None
        assert f.venue is None  # neutral shape, not team-POV


@pytest.mark.asyncio
async def test_team_filter_returns_pov_shape(tool_deps):
    """With team_id, returns team-POV shape."""
    result = await get_fixtures(team_id=1, limit=5)
    for f in result.data:
        assert f.venue in ("H", "A")
        assert f.opponent is not None
        assert f.home_team is None  # POV shape, not neutral


@pytest.mark.asyncio
async def test_scope_past_returns_finished(tool_deps):
    """scope=past returns only finished fixtures, reverse chronological."""
    result = await get_fixtures(scope="past", limit=10)
    for f in result.data:
        assert f.finished is True
    # Reverse chronological
    times = [f.kickoff_time for f in result.data]
    assert times == sorted(times, reverse=True)


@pytest.mark.asyncio
async def test_scope_upcoming_returns_unfinished(tool_deps):
    """scope=upcoming returns only unfinished fixtures, chronological."""
    result = await get_fixtures(scope="upcoming", limit=10)
    for f in result.data:
        assert f.finished is False
    # Chronological
    times = [f.kickoff_time for f in result.data]
    assert times == sorted(times)


@pytest.mark.asyncio
async def test_gameweek_filter(tool_deps):
    """Filter by specific gameweek."""
    result = await get_fixtures(gameweek=1, limit=10)
    for f in result.data:
        assert f.gameweek == 1


@pytest.mark.asyncio
async def test_team_pov_result(tool_deps):
    """Team-POV fixture has correct result (W/D/L)."""
    # Arsenal (1) vs Newcastle (14) GW1: 2-1 home win for Arsenal
    result = await get_fixtures(team_id=1, scope="past", limit=5)
    gw1_home = [f for f in result.data if f.gameweek == 1 and f.venue == "H"]
    assert len(gw1_home) == 1
    assert gw1_home[0].result == "W"
    assert gw1_home[0].goals_for == 2
    assert gw1_home[0].goals_against == 1


@pytest.mark.asyncio
async def test_limit_enforcement(tool_deps):
    """Limit caps results."""
    result = await get_fixtures(limit=2)
    assert len(result.data) <= 2


@pytest.mark.asyncio
async def test_no_match_raises_tool_error(tool_deps):
    """Non-existent gameweek raises ToolError."""
    with pytest.raises(ToolError, match="No fixtures match"):
        await get_fixtures(gameweek=99)
