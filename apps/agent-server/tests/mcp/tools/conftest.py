"""Test fixtures for MCP tool tests.

Loads frozen bootstrap + fixtures into fakeredis, sets deps, tears down after.
"""

from __future__ import annotations

import json
from pathlib import Path

import fakeredis.aioredis
import pytest

import fpl_agent.deps as deps
from fpl_agent.mcp.data.bootstrap import CACHE_KEY as BOOTSTRAP_KEY
from fpl_agent.mcp.data.cache import RedisCache
from fpl_agent.mcp.data.fixtures import CACHE_KEY as FIXTURES_KEY

FIXTURES_DIR = Path(__file__).parent.parent.parent / "fixtures"


@pytest.fixture
async def tool_deps():
    """Set up fakeredis with frozen data and wire deps. Tears down after test."""
    server = fakeredis.aioredis.FakeServer()
    redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

    # Create a RedisCache backed by fakeredis
    cache = RedisCache.__new__(RedisCache)
    cache._redis = redis

    # Load frozen data
    bootstrap = json.loads((FIXTURES_DIR / "bootstrap_sample.json").read_text())
    fixtures = json.loads((FIXTURES_DIR / "fixtures_sample.json").read_text())

    await cache.set_json(BOOTSTRAP_KEY, bootstrap, ttl_seconds=3600)
    await cache.set_json(FIXTURES_KEY, fixtures, ttl_seconds=3600)

    # Set deps
    deps.cache = cache
    deps.client = None  # Tools only need cache for M3 (no include_history)

    yield

    # Teardown
    deps.cache = None
    deps.client = None
    await redis.aclose()
