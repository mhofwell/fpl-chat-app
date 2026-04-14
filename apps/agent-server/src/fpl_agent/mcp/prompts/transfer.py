"""MCP prompt: transfer_debate — pre-assembled transfer decision.

Two players in, two teams' fixture outlooks, one rendered user message
with an enforced response format. The model's job is the analysis, not
the lookup.
"""

from __future__ import annotations

import asyncio

from mcp.types import PromptMessage, TextContent

from fpl_agent.mcp.prompts.briefing import _fmt_fixture, _fmt_player
from fpl_agent.mcp.server import mcp
from fpl_agent.mcp.tools.fixtures import get_fixtures
from fpl_agent.mcp.tools.players import get_players


def _render_transfer(
    out_player: dict,
    in_player: dict,
    out_fixtures: list[dict],
    in_fixtures: list[dict],
) -> str:
    out_team = out_player.get("basic", {}).get("team", {}).get("name", "?")
    in_team = in_player.get("basic", {}).get("team", {}).get("name", "?")
    out_fx = "\n".join(f"  - {_fmt_fixture(f)}" for f in out_fixtures) or "  (none)"
    in_fx = "\n".join(f"  - {_fmt_fixture(f)}" for f in in_fixtures) or "  (none)"
    return f"""I'm thinking about transferring {out_player['basic']['web_name']} OUT and {in_player['basic']['web_name']} IN. Help me decide.

OUTGOING PLAYER
  {_fmt_player(out_player)}

{out_team}'s NEXT 5 FIXTURES
{out_fx}

INCOMING PLAYER
  {_fmt_player(in_player)}

{in_team}'s NEXT 5 FIXTURES
{in_fx}

Respond in this exact format:
Recommendation: <Do it | Don't | Hold>
Confidence: <Low | Medium | High>
Reasoning:
  - <bullet citing a specific stat or fixture>
  - <bullet>
  - <bullet>
Risks: <1-2 things that could invalidate the recommendation>
Alternatives: <1-2 other transfer targets worth considering, if relevant>"""


@mcp.prompt(
    name="transfer_debate",
    description="Decide whether to transfer out_player OUT and in_player IN, given form and upcoming fixtures.",
)
async def transfer_debate(out_player: str, in_player: str) -> list[PromptMessage]:
    out_resp, in_resp = await asyncio.gather(
        get_players(name=out_player, limit=1),
        get_players(name=in_player, limit=1),
    )
    out_pl = out_resp.data[0].model_dump()
    in_pl = in_resp.data[0].model_dump()

    out_team_id = out_pl["basic"]["team"]["id"]
    in_team_id = in_pl["basic"]["team"]["id"]

    out_fx_resp, in_fx_resp = await asyncio.gather(
        get_fixtures(team_id=out_team_id, scope="upcoming", limit=5),
        get_fixtures(team_id=in_team_id, scope="upcoming", limit=5),
    )
    out_fx = [f.model_dump() for f in out_fx_resp.data]
    in_fx = [f.model_dump() for f in in_fx_resp.data]

    text = _render_transfer(out_pl, in_pl, out_fx, in_fx)
    return [PromptMessage(role="user", content=TextContent(type="text", text=text))]
