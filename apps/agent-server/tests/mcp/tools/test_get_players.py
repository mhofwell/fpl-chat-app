"""Tests for the get_players MCP tool."""

from __future__ import annotations

import pytest
from fastmcp.exceptions import ToolError

from fpl_agent.mcp.tools.players import get_players


@pytest.mark.asyncio
async def test_fuzzy_match_exact_web_name(tool_deps):
    """Exact match on web_name."""
    result = await get_players(name="Haaland", limit=1)
    assert len(result.data) == 1
    assert result.data[0].basic.web_name == "Haaland"


@pytest.mark.asyncio
async def test_fuzzy_match_case_insensitive(tool_deps):
    """Case-insensitive matching."""
    result = await get_players(name="salah", limit=1)
    assert len(result.data) == 1
    assert result.data[0].basic.web_name == "M.Salah"


@pytest.mark.asyncio
async def test_fuzzy_match_unicode_normalized(tool_deps):
    """Accented characters are normalized (Fábio → fabio)."""
    result = await get_players(name="fabio vieira", limit=1)
    assert len(result.data) == 1
    assert result.data[0].basic.web_name == "Fábio Vieira"


@pytest.mark.asyncio
async def test_fuzzy_match_substring(tool_deps):
    """Substring match when no exact match."""
    result = await get_players(name="pal", limit=5)
    # Should match Palmer via substring on web_name
    names = {p.basic.web_name for p in result.data}
    assert "Palmer" in names


@pytest.mark.asyncio
async def test_by_ids(tool_deps):
    """Lookup by explicit IDs."""
    result = await get_players(ids=[1, 3])
    assert len(result.data) == 2
    ids = {p.basic.id for p in result.data}
    assert ids == {1, 3}


@pytest.mark.asyncio
async def test_filter_by_position(tool_deps):
    """Filter by position returns only matching element_type."""
    result = await get_players(position="FWD", limit=10)
    assert len(result.data) == 2  # Haaland + Isak
    for p in result.data:
        assert p.basic.position == "FWD"


@pytest.mark.asyncio
async def test_filter_by_team(tool_deps):
    """Filter by team_id."""
    result = await get_players(team_id=1, limit=10)
    for p in result.data:
        assert p.basic.team.id == 1


@pytest.mark.asyncio
async def test_sort_by_form_desc(tool_deps):
    """Sort by form descending."""
    result = await get_players(sort_by="form", sort_dir="desc", limit=5)
    forms = [float(p.form.form) for p in result.data]
    assert forms == sorted(forms, reverse=True)


@pytest.mark.asyncio
async def test_sort_by_now_cost_asc(tool_deps):
    """Sort by cost ascending."""
    result = await get_players(sort_by="now_cost", sort_dir="asc", limit=5)
    costs = [p.basic.now_cost for p in result.data]
    assert costs == sorted(costs)


@pytest.mark.asyncio
async def test_limit_enforcement(tool_deps):
    """Limit caps the number of results."""
    result = await get_players(limit=3)
    assert len(result.data) <= 3


@pytest.mark.asyncio
async def test_not_found_raises_tool_error(tool_deps):
    """Non-existent player name raises ToolError."""
    with pytest.raises(ToolError, match="No player found"):
        await get_players(name="Zzzznonexistent")


@pytest.mark.asyncio
async def test_cost_conversion(tool_deps):
    """now_cost is converted from 0.1M int to float."""
    result = await get_players(name="Haaland", limit=1)
    assert result.data[0].basic.now_cost == 15.0  # 150 / 10


@pytest.mark.asyncio
async def test_meta_envelope(tool_deps):
    """Response includes meta envelope."""
    result = await get_players(name="Saka", limit=1)
    assert result.meta.source == "redis"
    assert result.meta.as_of is not None
