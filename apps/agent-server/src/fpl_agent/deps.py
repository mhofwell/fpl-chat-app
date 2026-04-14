"""Runtime dependency references for the FPL agent server.

Set during FastAPI lifespan startup, read by tool implementations.
Must be reset to None on shutdown and in test teardown.

Usage in tools:
    from fpl_agent import deps
    if deps.cache is None:
        raise ToolError("Server not ready")
    data = await get_bootstrap(deps.cache, deps.client)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastmcp.server.auth.providers.jwt import JWTVerifier

    from fpl_agent.agent.loop import AgentLoop
    from fpl_agent.mcp.data.cache import RedisCache
    from fpl_agent.mcp.data.fpl_client import FplClient

cache: RedisCache | None = None
client: FplClient | None = None
agent_loop: AgentLoop | None = None
jwt_verifier: JWTVerifier | None = None
