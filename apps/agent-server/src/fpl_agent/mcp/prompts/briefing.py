"""MCP prompt: team_briefing — pre-assembled team briefing.

The prompt does the data fetching server-side so the model doesn't
burn tool calls on a pattern we already know. Returns one user
message with the team's profile, recent form, upcoming fixtures, and
in-form players, plus an enforced response format.
"""

from __future__ import annotations

import asyncio

from mcp.types import PromptMessage, TextContent

from fpl_agent.mcp.server import mcp
from fpl_agent.mcp.tools.fixtures import get_fixtures
from fpl_agent.mcp.tools.players import get_players
from fpl_agent.mcp.tools.teams import get_teams


def _fmt_fixture(f: dict) -> str:
    """One-line summary of a fixture (handles team-POV and neutral shapes)."""
    gw = f.get("gameweek")
    gw_s = f"GW{gw}" if gw is not None else "GW?"
    if f.get("venue"):
        opp = (f.get("opponent") or {}).get("short_name", "?")
        venue = f["venue"]
        difficulty = f.get("difficulty", "?")
        if f.get("finished"):
            result = f.get("result", "?")
            gf = f.get("goals_for")
            ga = f.get("goals_against")
            return f"{gw_s} {result} {gf}-{ga} {venue} vs {opp} (FDR {difficulty})"
        return f"{gw_s} {venue} vs {opp} (FDR {difficulty})"
    home = (f.get("home_team") or {}).get("short_name", "?")
    away = (f.get("away_team") or {}).get("short_name", "?")
    return f"{gw_s} {home} vs {away}"


def _fmt_player(p: dict) -> str:
    basic = p.get("basic", {})
    form = p.get("form", {})
    scoring = p.get("scoring", {})
    playing = p.get("playing", {})
    name = basic.get("web_name", "?")
    pos = basic.get("position", "?")
    cost = basic.get("now_cost", 0)
    pts = basic.get("total_points", 0)
    form_v = form.get("form", "0.0")
    goals = scoring.get("goals_scored", 0)
    assists = scoring.get("assists", 0)
    news = playing.get("news", "") or ""
    news_s = f" | note: {news}" if news else ""
    return (
        f"{name} ({pos}, £{cost}m) — {pts} pts, form {form_v}, "
        f"{goals}G / {assists}A{news_s}"
    )


def _render_briefing(team: dict, past: list[dict], upcoming: list[dict], players: list[dict]) -> str:
    name = team.get("name", "the team")
    pos = team.get("position", "?")
    w = team.get("win", 0)
    d = team.get("draw", 0)
    loss = team.get("loss", 0)
    pts = team.get("points", 0)
    played = team.get("played", 0)
    past_s = "\n".join(f"  - {_fmt_fixture(f)}" for f in past) or "  (none)"
    upcoming_s = "\n".join(f"  - {_fmt_fixture(f)}" for f in upcoming) or "  (none)"
    players_s = "\n".join(f"  - {_fmt_player(p)}" for p in players) or "  (none)"
    return f"""I want a briefing on {name}.

TEAM
  League position: {pos}
  Record: {w}W-{d}D-{loss}L, {pts} pts from {played} played

RECENT 5 RESULTS
{past_s}

UPCOMING 5 FIXTURES (FDR = Fixture Difficulty Rating, 1 easy → 5 hard)
{upcoming_s}

IN-FORM PLAYERS (top 5 by form)
{players_s}

Respond in this exact format:
Position & Record: <one line summary>
Recent Form: <W/D/L string and one-line commentary>
Upcoming Fixtures: <overall verdict across the next 5>
Key Players: <top 3 names with why they matter for FPL>
Bottom Line: <one sentence on the team's current trajectory>"""


@mcp.prompt(
    name="team_briefing",
    description="Generate a structured briefing on a Premier League team (record, recent form, upcoming fixtures, in-form players).",
)
async def team_briefing(name_or_id: str) -> list[PromptMessage]:
    """Build a pre-assembled team briefing for the model.

    `name_or_id` is fuzzy-matched against team name/short_name. The prompt
    does four parallel reads from the Redis cache and renders one user
    message; the model only has to analyze, not fetch.
    """
    team_resp = await get_teams(name=name_or_id, limit=1)
    team = team_resp.data[0].model_dump()
    team_id = team["id"]

    past_resp, upcoming_resp, players_resp = await asyncio.gather(
        get_fixtures(team_id=team_id, scope="past", limit=5),
        get_fixtures(team_id=team_id, scope="upcoming", limit=5),
        get_players(team_id=team_id, sort_by="form", limit=5),
    )
    past = [f.model_dump() for f in past_resp.data]
    upcoming = [f.model_dump() for f in upcoming_resp.data]
    players = [p.model_dump() for p in players_resp.data]

    text = _render_briefing(team, past, upcoming, players)
    return [PromptMessage(role="user", content=TextContent(type="text", text=text))]
