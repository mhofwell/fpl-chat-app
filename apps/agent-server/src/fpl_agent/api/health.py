"""Health, readiness, and metrics endpoints.

- GET /health  → liveness probe (200 if process is alive)
- GET /ready   → readiness probe (200 if cache + scheduler + agent loop are up)
- GET /metrics → Prometheus exposition of the counters in metrics.py
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

import fpl_agent.deps as deps
from fpl_agent.config import settings
from fpl_agent.metrics import render_metrics

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "service": settings.service_name}


@router.get("/ready")
async def ready() -> dict:
    """Readiness probe — 503 if any critical dependency isn't ready."""
    if deps.cache is None:
        raise HTTPException(status_code=503, detail="Redis cache not initialized")
    if deps.agent_loop is None:
        raise HTTPException(status_code=503, detail="Agent loop not initialized")
    redis_ok = await deps.cache.ping()
    if not redis_ok:
        raise HTTPException(status_code=503, detail="Redis not reachable")
    return {"status": "ready", "service": settings.service_name}


@router.get("/metrics")
async def metrics() -> Response:
    """Prometheus metrics exposition."""
    body, content_type = render_metrics()
    return Response(content=body, media_type=content_type)
