"""FPL Agent Server — FastAPI application entry point.

Endpoints:
  GET /health — liveness probe (always 200 if process is alive)

Future endpoints (wired in later milestones):
  GET /ready       — readiness probe (M2: Redis + scheduler check)
  GET /metrics     — Prometheus metrics (M8)
  POST /agent/run  — AG-UI SSE endpoint (M5)
  POST /mcp        — FastMCP Streamable HTTP (M8)
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from fpl_agent.config import settings
from fpl_agent.log_config import get_logger, setup_logging

setup_logging(settings.log_level)
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan.

    M1: no-op — logs startup/shutdown.
    M2: will prime Redis cache and start APScheduler here.
    """
    log.info("agent_server_starting", message="FPL agent server starting up")
    yield
    log.info("agent_server_stopping", message="FPL agent server shutting down")


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
