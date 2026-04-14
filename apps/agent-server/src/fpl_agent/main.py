"""FPL Agent Server — FastAPI application entry point.

Endpoints:
  GET  /health          — liveness probe (200 if process is alive)
  GET  /ready           — readiness probe (cache + scheduler + agent_loop)
  GET  /metrics         — Prometheus exposition of the 6 Phase 1 counters
  POST /agent/run       — AG-UI SSE streaming chat (JWT-auth'd, persisted)
  POST /agent/chat/test — non-streaming test endpoint (no auth)

Middleware stack (outer to inner):
  request_id_middleware  — reads/generates X-Request-Id, binds to structlog
  CORSMiddleware         — allows the configured Next.js origin

Deferred to Phase 2: public /mcp Streamable HTTP endpoint for Claude Desktop.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from anthropic import AsyncAnthropic
from fastmcp.server.auth.providers.jwt import JWTVerifier
from supabase import create_client

import fpl_agent.deps as deps
from fpl_agent.agent.loop import AgentLoop
from fpl_agent.agent.mcp_bridge import McpBridge
from fpl_agent.api import agent, chat, health
from fpl_agent.config import settings
from fpl_agent.log_config import get_logger, setup_logging
from fpl_agent.middleware import request_id_middleware
from fpl_agent.mcp.data.bootstrap import get_bootstrap
from fpl_agent.mcp.data.cache import RedisCache
from fpl_agent.mcp.data.fixtures import get_all_fixtures
from fpl_agent.mcp.data.fpl_client import FplClient
from fpl_agent.scheduler import start_scheduler

setup_logging(settings.log_level)
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — initialize data layer and scheduler."""
    log.info("agent_server_starting", message="FPL agent server starting up")

    cache = RedisCache(url=settings.redis_url)
    client = FplClient(base_url=settings.fpl_api_base)

    # Set runtime deps so tools can access cache/client
    deps.cache = cache
    deps.client = client

    # Register tools + prompts (imports trigger @mcp.tool / @mcp.prompt decorators)
    import fpl_agent.mcp.tools  # noqa: F401
    import fpl_agent.mcp.prompts  # noqa: F401

    # Prime cache on startup
    await get_bootstrap(cache, client)
    await get_all_fixtures(cache, client)

    # Initialize the Anthropic agent loop
    anthropic_client = AsyncAnthropic(api_key=settings.claude_api_key)
    mcp_bridge = McpBridge()
    deps.agent_loop = AgentLoop(
        anthropic_client=anthropic_client,
        mcp_bridge=mcp_bridge,
        model=settings.anthropic_model,
    )
    log.info(
        "agent_loop_ready",
        message=f"Agent loop initialized with model={settings.anthropic_model}",
    )

    # Initialize the Supabase JWT verifier + shared client for /agent/run
    if settings.supabase_url and settings.supabase_anon_key:
        jwks_uri = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1"
        deps.jwt_verifier = JWTVerifier(
            jwks_uri=jwks_uri,
            issuer=issuer,
            audience="authenticated",
            algorithm=settings.supabase_jwt_algorithm,
        )
        deps.supabase_client = create_client(
            settings.supabase_url, settings.supabase_anon_key
        )
        log.info(
            "supabase_ready",
            message=f"Supabase JWT verifier + shared client initialized for {issuer}",
        )
    else:
        log.warning(
            "supabase_skipped",
            message="SUPABASE_URL or SUPABASE_ANON_KEY not set — /agent/run will 503 until configured",
        )

    # Start hourly refresh jobs
    scheduler = start_scheduler(cache, client)

    yield

    # Cleanup
    scheduler.shutdown(wait=False)
    deps.supabase_client = None
    deps.jwt_verifier = None
    deps.agent_loop = None
    deps.cache = None
    deps.client = None
    await anthropic_client.close()
    await client.aclose()
    await cache.aclose()
    log.info("agent_server_stopped", message="FPL agent server shut down")


app = FastAPI(
    title="FPL Agent Server",
    description="Fantasy Premier League AI chat backend — FastAPI + FastMCP + AG-UI",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
)
app.middleware("http")(request_id_middleware)
app.include_router(health.router)
app.include_router(chat.router)
app.include_router(agent.router)
