"""In-process MCP client bridge.

M4: wraps FastMCP Client(transport=mcp) for use by the agent loop.
    Zero network overhead — tools execute in-process.
"""

from __future__ import annotations
