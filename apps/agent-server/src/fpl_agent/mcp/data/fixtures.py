"""Cache-aside for FPL fixtures data.

Contains all fixtures for the season with scores, stats, and
difficulty ratings. Cached in Redis with a 1h TTL. Match-day
dynamic TTLs are deferred to Phase 2.
"""

from __future__ import annotations

from fpl_agent.log_config import get_logger
from fpl_agent.mcp.data.cache import RedisCache
from fpl_agent.mcp.data.fpl_client import FplClient

log = get_logger(__name__)

CACHE_KEY = "fpl:v1:fixtures:all"
TTL_SECONDS = 3600  # 1 hour


async def get_all_fixtures(
    cache: RedisCache,
    client: FplClient,
    *,
    force: bool = False,
) -> list[dict]:
    """Return all season fixtures, reading from cache when possible.

    Args:
        cache: Redis cache instance.
        client: FPL API client.
        force: If True, bypass cache and fetch fresh from FPL API.
    """
    if not force:
        cached = await cache.get_json(CACHE_KEY)
        if cached is not None:
            log.info("fixtures_cache_hit", message="Fixtures loaded from cache")
            return cached

    data = await client.fetch_fixtures()
    await cache.set_json(CACHE_KEY, data, TTL_SECONDS)
    log.info("fixtures_primed", message="Fixtures fetched from FPL API and cached")
    return data
