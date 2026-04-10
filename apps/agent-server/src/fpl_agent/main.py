"""FPL Agent Server — FastAPI application entry point.

Endpoints:
  GET /health — liveness probe (always 200 if process is alive)

Future endpoints (wired in later milestones):
  GET /ready       — readiness probe (Redis + scheduler check)
  GET /metrics     — Prometheus metrics (M8)
  POST /agent/run  — AG-UI SSE endpoint (M5)
  POST /mcp        — FastMCP Streamable HTTP (M8)
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

import fpl_agent.deps as deps
from fpl_agent.config import settings
from fpl_agent.log_config import get_logger, setup_logging
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

    # Register tools (import triggers @mcp.tool decorators)
    import fpl_agent.mcp.tools  # noqa: F401

    # Prime cache on startup
    await get_bootstrap(cache, client)
    await get_all_fixtures(cache, client)

    # Start hourly refresh jobs
    scheduler = start_scheduler(cache, client)

    yield

    # Cleanup
    scheduler.shutdown(wait=False)
    deps.cache = None
    deps.client = None
    await client.aclose()
    await cache.aclose()
    log.info("agent_server_stopped", message="FPL agent server shut down")


app = FastAPI(
    title="FPL Agent Server",
    description="Fantasy Premier League AI chat backend — FastAPI + FastMCP + AG-UI",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "service": settings.service_name}
