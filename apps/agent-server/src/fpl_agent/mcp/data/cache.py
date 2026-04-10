"""Redis cache wrapper for FPL data.

Thin wrapper around redis.asyncio providing JSON get/set with TTL.
Callers pass full key names (e.g. "fpl:v1:bootstrap") — this class
does not auto-prefix keys.
"""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from fpl_agent.log_config import get_logger

log = get_logger(__name__)


class RedisCache:
    """Cache-aside wrapper for redis.asyncio."""

    def __init__(self, url: str) -> None:
        self._redis = aioredis.from_url(url, decode_responses=True)

    async def get_json(self, key: str) -> dict | list | None:
        """Return parsed JSON for *key*, or None on cache miss."""
        raw = await self._redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Serialize *value* as JSON and SET with TTL. Idempotent (overwrites)."""
        await self._redis.set(key, json.dumps(value), ex=ttl_seconds)

    async def delete(self, key: str) -> None:
        """Delete *key*. No-op if key does not exist."""
        await self._redis.delete(key)

    async def exists(self, key: str) -> bool:
        """Return True if *key* exists in Redis."""
        return bool(await self._redis.exists(key))

    async def ping(self) -> bool:
        """Return True if Redis is reachable."""
        try:
            return await self._redis.ping()
        except Exception:
            return False

    async def aclose(self) -> None:
        """Close the Redis connection pool."""
        await self._redis.aclose()
