"""FPL MCP server package.

Re-exports the shared mcp instance so callers can write:
    from fpl_agent.mcp import mcp
"""

from fpl_agent.mcp.server import mcp as mcp

__all__ = ["mcp"]
