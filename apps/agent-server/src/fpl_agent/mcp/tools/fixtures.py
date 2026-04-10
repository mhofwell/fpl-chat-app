"""MCP tool: get_fixtures — query fixtures by gameweek, team, and scope."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastmcp.exceptions import ToolError

from fpl_agent import deps
from fpl_agent.mcp.data.bootstrap import get_bootstrap
from fpl_agent.mcp.data.fixtures import get_all_fixtures
from fpl_agent.mcp.models import Fixture, Meta, TeamRef, ToolResponse
from fpl_agent.mcp.server import mcp


def _build_teams_map(bootstrap: dict) -> dict[int, TeamRef]:
    """Build a team_id → TeamRef lookup from bootstrap data."""
    return {
        t["id"]: TeamRef(id=t["id"], name=t["name"], short_name=t["short_name"])
        for t in bootstrap.get("teams", [])
    }


def _normalize_for_team(raw: dict, team_id: int, teams_map: dict[int, TeamRef]) -> Fixture:
    """Convert a raw fixture to the team-POV shape."""
    is_home = raw.get("team_h") == team_id
    opponent_id = raw.get("team_a") if is_home else raw.get("team_h")
    opponent = teams_map.get(opponent_id, TeamRef(id=0, name="Unknown", short_name="UNK"))

    goals_for = raw.get("team_h_score") if is_home else raw.get("team_a_score")
    goals_against = raw.get("team_a_score") if is_home else raw.get("team_h_score")
    difficulty = raw.get("team_h_difficulty") if is_home else raw.get("team_a_difficulty")

    result = None
    if raw.get("finished") and goals_for is not None and goals_against is not None:
        if goals_for > goals_against:
            result = "W"
        elif goals_for < goals_against:
            result = "L"
        else:
            result = "D"

    return Fixture(
        id=raw["id"],
        gameweek=raw.get("event"),
        kickoff_time=raw.get("kickoff_time"),
        finished=raw.get("finished", False),
        venue="H" if is_home else "A",
        opponent=opponent,
        result=result,
        goals_for=goals_for,
        goals_against=goals_against,
        difficulty=difficulty,
    )


def _neutral(raw: dict, teams_map: dict[int, TeamRef]) -> Fixture:
    """Convert a raw fixture to the neutral shape."""
    home = teams_map.get(raw.get("team_h", 0), TeamRef(id=0, name="Unknown", short_name="UNK"))
    away = teams_map.get(raw.get("team_a", 0), TeamRef(id=0, name="Unknown", short_name="UNK"))

    return Fixture(
        id=raw["id"],
        gameweek=raw.get("event"),
        kickoff_time=raw.get("kickoff_time"),
        finished=raw.get("finished", False),
        home_team=home,
        away_team=away,
        home_score=raw.get("team_h_score"),
        away_score=raw.get("team_a_score"),
        home_difficulty=raw.get("team_h_difficulty"),
        away_difficulty=raw.get("team_a_difficulty"),
    )


@mcp.tool
async def get_fixtures(
    gameweek: int | None = None,
    team_id: int | None = None,
    scope: Literal["all", "past", "upcoming"] = "all",
    limit: int | None = None,
) -> ToolResponse[Fixture]:
    """Query fixtures by gameweek, team, and temporal scope.

    Covers: this week's fixtures, team's next/last N games, GW results.
    When team_id is set, returns team-POV shape (venue, opponent, result).
    Without team_id, returns neutral shape (home_team, away_team, scores).
    """
    if deps.cache is None:
        raise ToolError("Server not ready — FPL data layer is initializing")

    bootstrap = await get_bootstrap(deps.cache, deps.client)
    teams_map = _build_teams_map(bootstrap)
    raw_fixtures = await get_all_fixtures(deps.cache, deps.client)

    # Filter by gameweek
    if gameweek is not None:
        raw_fixtures = [f for f in raw_fixtures if f.get("event") == gameweek]

    # Filter by team
    if team_id is not None:
        raw_fixtures = [
            f for f in raw_fixtures
            if f.get("team_h") == team_id or f.get("team_a") == team_id
        ]

    # Filter by scope
    if scope == "past":
        raw_fixtures = [f for f in raw_fixtures if f.get("finished")]
        raw_fixtures.sort(key=lambda f: f.get("kickoff_time", ""), reverse=True)
    elif scope == "upcoming":
        raw_fixtures = [f for f in raw_fixtures if not f.get("finished")]
        raw_fixtures.sort(key=lambda f: f.get("kickoff_time", ""))
    else:
        raw_fixtures.sort(key=lambda f: f.get("kickoff_time", ""))

    # Limit
    if limit is not None:
        raw_fixtures = raw_fixtures[:limit]

    if not raw_fixtures:
        raise ToolError("No fixtures match the given filters")

    # Build typed fixtures
    if team_id is not None:
        fixtures = [_normalize_for_team(f, team_id, teams_map) for f in raw_fixtures]
    else:
        fixtures = [_neutral(f, teams_map) for f in raw_fixtures]

    return ToolResponse[Fixture](
        data=fixtures,
        meta=Meta(
            source="redis",
            as_of=datetime.now(timezone.utc).isoformat(),
            cache_age_seconds=0,
        ),
    )
