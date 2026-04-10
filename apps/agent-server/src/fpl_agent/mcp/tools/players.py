"""MCP tool: get_players — query FPL players by name, team, position, or metric."""

from __future__ import annotations

import unicodedata
from datetime import datetime, timezone
from typing import Literal

from fastmcp.exceptions import ToolError

from fpl_agent import deps
from fpl_agent.mcp.data.bootstrap import CACHE_KEY as BOOTSTRAP_KEY
from fpl_agent.mcp.data.bootstrap import get_bootstrap
from fpl_agent.mcp.models import (
    BasicInfo,
    FormStats,
    Meta,
    OwnershipStats,
    PlayerProfile,
    PlayingTime,
    ScoringStats,
    TeamRef,
    ToolResponse,
)
from fpl_agent.mcp.server import mcp

POSITION_MAP = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
POSITION_REVERSE = {"GKP": 1, "DEF": 2, "MID": 3, "FWD": 4}


def _normalize(s: str) -> str:
    """NFKD-decompose, strip combining marks, lowercase, strip whitespace."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    ).lower().strip()


def _match_players(elements: list[dict], search: str) -> list[dict]:
    """Three-tier fuzzy match: exact → substring → token."""
    norm_search = _normalize(search)

    # Tier 1: exact match on normalized web_name, full name, or second_name
    exact = []
    for el in elements:
        names = [
            _normalize(el.get("web_name", "")),
            _normalize(f"{el.get('first_name', '')} {el.get('second_name', '')}"),
            _normalize(el.get("second_name", "")),
        ]
        if norm_search in names:
            exact.append(el)
    if exact:
        return exact

    # Tier 2: substring match
    substring = []
    for el in elements:
        fields = [
            _normalize(el.get("web_name", "")),
            _normalize(f"{el.get('first_name', '')} {el.get('second_name', '')}"),
        ]
        if any(norm_search in f for f in fields):
            substring.append(el)
    if substring:
        return substring

    # Tier 3: token match — all search tokens present in full name
    tokens = norm_search.split()
    if tokens:
        token_matches = []
        for el in elements:
            full = _normalize(f"{el.get('first_name', '')} {el.get('second_name', '')}")
            if all(t in full for t in tokens):
                token_matches.append(el)
        if token_matches:
            return token_matches

    return []


def _build_teams_map(bootstrap: dict) -> dict[int, TeamRef]:
    """Build a team_id → TeamRef lookup from bootstrap data."""
    return {
        t["id"]: TeamRef(id=t["id"], name=t["name"], short_name=t["short_name"])
        for t in bootstrap.get("teams", [])
    }


def _build_profile(el: dict, teams_map: dict[int, TeamRef]) -> PlayerProfile:
    """Convert a raw bootstrap element to a PlayerProfile."""
    team = teams_map.get(el.get("team", 0), TeamRef(id=0, name="Unknown", short_name="UNK"))
    position = POSITION_MAP.get(el.get("element_type", 0), "UNK")

    return PlayerProfile(
        basic=BasicInfo(
            id=el["id"],
            web_name=el.get("web_name", ""),
            first_name=el.get("first_name", ""),
            second_name=el.get("second_name", ""),
            team=team,
            position=position,
            now_cost=el.get("now_cost", 0) / 10.0,
            total_points=el.get("total_points", 0),
            status=el.get("status", "a"),
        ),
        scoring=ScoringStats(
            goals_scored=el.get("goals_scored", 0),
            assists=el.get("assists", 0),
            clean_sheets=el.get("clean_sheets", 0),
            bonus=el.get("bonus", 0),
            expected_goals=str(el.get("expected_goals", "0.00")),
            expected_assists=str(el.get("expected_assists", "0.00")),
            expected_goal_involvements=str(el.get("expected_goal_involvements", "0.00")),
            ict_index=str(el.get("ict_index", "0.0")),
            influence=str(el.get("influence", "0.0")),
            creativity=str(el.get("creativity", "0.0")),
            threat=str(el.get("threat", "0.0")),
        ),
        form=FormStats(
            form=str(el.get("form", "0.0")),
            points_per_game=str(el.get("points_per_game", "0.0")),
            form_rank=el.get("form_rank"),
            points_per_game_rank=el.get("points_per_game_rank"),
        ),
        ownership=OwnershipStats(
            selected_by_percent=str(el.get("selected_by_percent", "0.0")),
            transfers_in=el.get("transfers_in", 0),
            transfers_out=el.get("transfers_out", 0),
            transfers_in_event=el.get("transfers_in_event", 0),
            transfers_out_event=el.get("transfers_out_event", 0),
            cost_change_event=el.get("cost_change_event", 0),
        ),
        playing=PlayingTime(
            minutes=el.get("minutes", 0),
            starts=el.get("starts", 0),
            chance_of_playing_this_round=el.get("chance_of_playing_this_round"),
            chance_of_playing_next_round=el.get("chance_of_playing_next_round"),
            news=el.get("news", ""),
            news_added=el.get("news_added"),
        ),
    )


@mcp.tool
async def get_players(
    name: str | None = None,
    ids: list[int] | None = None,
    team_id: int | None = None,
    position: Literal["GKP", "DEF", "MID", "FWD"] | None = None,
    sort_by: Literal[
        "total_points", "form", "now_cost", "selected_by_percent",
        "ict_index", "goals_scored", "assists", "bonus",
        "expected_goals", "expected_goal_involvements",
    ] | None = None,
    sort_dir: Literal["asc", "desc"] = "desc",
    limit: int = 10,
) -> ToolResponse[PlayerProfile]:
    """Query FPL players by identity, team, position, or ranked metric.

    Covers: single player lookup, bulk comparison by IDs, ranked lists
    (e.g. top midfielders by form), team rosters, filtered queries.
    """
    if deps.cache is None:
        raise ToolError("Server not ready — FPL data layer is initializing")

    bootstrap = await get_bootstrap(deps.cache, deps.client)
    elements: list[dict] = bootstrap.get("elements", [])
    teams_map = _build_teams_map(bootstrap)

    # Filter by IDs
    if ids:
        id_set = set(ids)
        elements = [el for el in elements if el["id"] in id_set]
        if not elements:
            raise ToolError(f"No players found with IDs: {ids}")

    # Filter by name (fuzzy)
    if name:
        elements = _match_players(elements, name)
        if not elements:
            raise ToolError(f'No player found matching "{name}"')

    # Filter by team
    if team_id is not None:
        elements = [el for el in elements if el.get("team") == team_id]

    # Filter by position
    if position is not None:
        element_type = POSITION_REVERSE.get(position)
        if element_type is not None:
            elements = [el for el in elements if el.get("element_type") == element_type]

    # Sort
    if sort_by:
        def sort_key(el: dict):
            val = el.get(sort_by, 0)
            try:
                return float(val)
            except (TypeError, ValueError):
                return 0.0
        elements = sorted(elements, key=sort_key, reverse=(sort_dir == "desc"))

    # Limit
    elements = elements[:limit]

    if not elements:
        raise ToolError("No players match the given filters")

    profiles = [_build_profile(el, teams_map) for el in elements]

    return ToolResponse[PlayerProfile](
        data=profiles,
        meta=Meta(
            source="redis",
            as_of=datetime.now(timezone.utc).isoformat(),
            cache_age_seconds=0,
        ),
    )
