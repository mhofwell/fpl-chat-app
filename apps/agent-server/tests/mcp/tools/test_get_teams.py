"""Tests for the get_teams MCP tool."""

from __future__ import annotations

import pytest
from fastmcp.exceptions import ToolError

from fpl_agent.mcp.tools.teams import get_teams


@pytest.mark.asyncio
async def test_fuzzy_match_team_name(tool_deps):
    """Match by team name."""
    result = await get_teams(name="Arsenal")
    assert len(result.data) == 1
    assert result.data[0].name == "Arsenal"


@pytest.mark.asyncio
async def test_fuzzy_match_short_name(tool_deps):
    """Match by short name."""
    result = await get_teams(name="LIV")
    assert len(result.data) == 1
    assert result.data[0].name == "Liverpool"


@pytest.mark.asyncio
async def test_fuzzy_match_case_insensitive(tool_deps):
    """Case-insensitive matching."""
    result = await get_teams(name="arsenal")
    assert len(result.data) == 1
    assert result.data[0].name == "Arsenal"


@pytest.mark.asyncio
async def test_sort_by_position_asc(tool_deps):
    """Sort by league position ascending (default)."""
    result = await get_teams(sort_by="position", sort_dir="asc")
    positions = [t.position for t in result.data]
    assert positions == sorted(positions)


@pytest.mark.asyncio
async def test_sort_by_strength_desc(tool_deps):
    """Sort by strength_attack_home descending."""
    result = await get_teams(sort_by="strength_attack_home", sort_dir="desc")
    strengths = [t.strength_attack_home for t in result.data]
    assert strengths == sorted(strengths, reverse=True)


@pytest.mark.asyncio
async def test_by_ids(tool_deps):
    """Lookup by explicit IDs."""
    result = await get_teams(ids=[1, 11])
    assert len(result.data) == 2
    names = {t.name for t in result.data}
    assert names == {"Arsenal", "Liverpool"}


@pytest.mark.asyncio
async def test_limit(tool_deps):
    """Limit caps results."""
    result = await get_teams(sort_by="position", limit=2)
    assert len(result.data) == 2


@pytest.mark.asyncio
async def test_not_found_raises_tool_error(tool_deps):
    """Non-existent team raises ToolError."""
    with pytest.raises(ToolError, match="No team found"):
        await get_teams(name="Zzzznonexistent")
