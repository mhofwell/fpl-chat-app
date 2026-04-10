"""MCP tool: get_teams — query Premier League teams by name, ID, or strength."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastmcp.exceptions import ToolError

from fpl_agent import deps
from fpl_agent.mcp.data.bootstrap import get_bootstrap
from fpl_agent.mcp.models import Meta, TeamProfile, ToolResponse
from fpl_agent.mcp.server import mcp
from fpl_agent.mcp.tools.players import _normalize


def _match_teams(teams: list[dict], search: str) -> list[dict]:
    """Fuzzy match on team name and short_name."""
    norm = _normalize(search)

    # Exact match
    exact = [
        t for t in teams
        if norm in (_normalize(t.get("name", "")), _normalize(t.get("short_name", "")))
    ]
    if exact:
        return exact

    # Substring match
    return [
        t for t in teams
        if norm in _normalize(t.get("name", "")) or norm in _normalize(t.get("short_name", ""))
    ]


def _build_team_profile(t: dict) -> TeamProfile:
    """Convert a raw bootstrap team to a TeamProfile."""
    return TeamProfile(
        id=t["id"],
        name=t.get("name", ""),
        short_name=t.get("short_name", ""),
        strength=t.get("strength", 0),
        position=t.get("position", 0),
        played=t.get("played", 0),
        win=t.get("win", 0),
        draw=t.get("draw", 0),
        loss=t.get("loss", 0),
        points=t.get("points", 0),
        strength_overall_home=t.get("strength_overall_home", 0),
        strength_overall_away=t.get("strength_overall_away", 0),
        strength_attack_home=t.get("strength_attack_home", 0),
        strength_attack_away=t.get("strength_attack_away", 0),
        strength_defence_home=t.get("strength_defence_home", 0),
        strength_defence_away=t.get("strength_defence_away", 0),
    )


@mcp.tool
async def get_teams(
    name: str | None = None,
    ids: list[int] | None = None,
    sort_by: Literal[
        "position", "points", "strength_overall_home", "strength_overall_away",
        "strength_attack_home", "strength_attack_away",
        "strength_defence_home", "strength_defence_away",
    ] | None = None,
    sort_dir: Literal["asc", "desc"] = "asc",
    limit: int | None = None,
) -> ToolResponse[TeamProfile]:
    """Query PL teams by name, ID, or ranked strength/table metric.

    Covers: team lookup, league table, strength rankings.
    """
    if deps.cache is None:
        raise ToolError("Server not ready — FPL data layer is initializing")

    bootstrap = await get_bootstrap(deps.cache, deps.client)
    teams: list[dict] = bootstrap.get("teams", [])

    # Filter by IDs
    if ids:
        id_set = set(ids)
        teams = [t for t in teams if t["id"] in id_set]
        if not teams:
            raise ToolError(f"No teams found with IDs: {ids}")

    # Filter by name (fuzzy)
    if name:
        teams = _match_teams(teams, name)
        if not teams:
            raise ToolError(f'No team found matching "{name}"')

    # Sort
    if sort_by:
        def sort_key(t: dict):
            val = t.get(sort_by, 0)
            try:
                return float(val)
            except (TypeError, ValueError):
                return 0.0
        teams = sorted(teams, key=sort_key, reverse=(sort_dir == "desc"))

    # Limit
    if limit is not None:
        teams = teams[:limit]

    if not teams:
        raise ToolError("No teams match the given filters")

    profiles = [_build_team_profile(t) for t in teams]

    return ToolResponse[TeamProfile](
        data=profiles,
        meta=Meta(
            source="redis",
            as_of=datetime.now(timezone.utc).isoformat(),
            cache_age_seconds=0,
        ),
    )
