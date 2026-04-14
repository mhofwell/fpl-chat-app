"""FastMCP server instance for the FPL domain.

Phase 1 uses this instance in-process only, via `Client(transport=mcp)`
from the agent loop — zero network overhead. Phase 2 will mount the same
instance at a public `/mcp` Streamable HTTP endpoint so external MCP
clients (Claude Desktop, third-party LLMs) can install it.

Tools, prompts, and resources are registered via decorators in their
respective submodules. Those modules must be imported before server usage
to ensure decorators fire.

Phase 1 inventory:
  - 3 tools:   get_players, get_teams, get_fixtures (registered in M3)
  - 2 prompts: team_briefing, transfer_debate (registered in M7)
  - 0 resources (Phase 2a)
"""

from __future__ import annotations

from fastmcp import FastMCP

mcp = FastMCP(
    name="fpl",
    instructions=(
        "FPL Coach — a Fantasy Premier League assistant. "
        "Use the available tools to answer questions about players, teams, and fixtures."
    ),
)
