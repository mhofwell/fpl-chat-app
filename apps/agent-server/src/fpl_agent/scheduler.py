"""APScheduler integration — periodic FPL data refresh.

Two hourly jobs keep the Redis cache warm:
  - refresh_bootstrap: re-fetches bootstrap-static
  - refresh_fixtures: re-fetches fixtures

SINGLETON CONSTRAINT (from design doc §5, §11):
  The scheduler runs inside the FastAPI lifespan. Every process that
  boots the agent server starts every job. Phase 1 must run exactly
  one replica (Railway: 1 instance, uvicorn --workers 1).
  All scheduled writes must be idempotent (Redis SET overwrites).
"""

from __future__ import annotations

import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from fpl_agent.log_config import get_logger
from fpl_agent.mcp.data.bootstrap import get_bootstrap
from fpl_agent.mcp.data.cache import RedisCache
from fpl_agent.mcp.data.fixtures import get_all_fixtures
from fpl_agent.mcp.data.fpl_client import FplClient

log = get_logger(__name__)


async def _refresh_bootstrap(cache: RedisCache, client: FplClient) -> None:
    """Scheduled job: force-refresh bootstrap cache."""
    try:
        await get_bootstrap(cache, client, force=True)
    except Exception:
        log.exception("refresh_bootstrap_failed", message="Failed to refresh bootstrap cache")


async def _refresh_fixtures(cache: RedisCache, client: FplClient) -> None:
    """Scheduled job: force-refresh fixtures cache."""
    try:
        await get_all_fixtures(cache, client, force=True)
    except Exception:
        log.exception("refresh_fixtures_failed", message="Failed to refresh fixtures cache")


def start_scheduler(cache: RedisCache, client: FplClient) -> AsyncIOScheduler:
    """Create and start the APScheduler with hourly refresh jobs.

    Returns the scheduler so main.py can shut it down on teardown.
    """
    scheduler = AsyncIOScheduler()

    # Get the running event loop for wrapping coroutines
    loop = asyncio.get_running_loop()

    scheduler.add_job(
        lambda: loop.create_task(_refresh_bootstrap(cache, client)),
        "interval",
        hours=1,
        id="refresh_bootstrap",
        name="Refresh FPL bootstrap-static cache",
        replace_existing=True,
    )

    scheduler.add_job(
        lambda: loop.create_task(_refresh_fixtures(cache, client)),
        "interval",
        hours=1,
        id="refresh_fixtures",
        name="Refresh FPL fixtures cache",
        replace_existing=True,
    )

    scheduler.start()
    log.info(
        "scheduler_started",
        message="APScheduler started with 2 hourly refresh jobs",
        jobs=[j.id for j in scheduler.get_jobs()],
    )
    return scheduler
