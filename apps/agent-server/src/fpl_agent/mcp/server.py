"""FastMCP server instance for the FPL domain.

Used by:
  1. The in-process agent loop (Client(transport=mcp)) — zero network overhead
  2. The public /mcp Streamable HTTP endpoint (M8) — external MCP clients

Tools, prompts, and resources are registered via decorators in their
respective submodules. Those modules must be imported before server usage
to ensure decorators fire.

M1: server created, no tools/prompts/resources registered yet.
M3: tools registered via @mcp.tool
M7: prompts registered via @mcp.prompt
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
