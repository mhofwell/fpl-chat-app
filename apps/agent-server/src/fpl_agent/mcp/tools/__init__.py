"""MCP tool registrations.

Importing this package causes @mcp.tool decorators to fire,
registering all three tools on the shared mcp instance.
"""

import fpl_agent.mcp.tools.fixtures  # noqa: F401
import fpl_agent.mcp.tools.players  # noqa: F401
import fpl_agent.mcp.tools.teams  # noqa: F401
