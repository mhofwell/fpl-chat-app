"""Shared pytest fixtures for the FPL agent server test suite."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import pytest

from fpl_agent.mcp.data.cache import RedisCache
from fpl_agent.mcp.data.fpl_client import FplClient


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio as the anyio backend for async tests."""
    return "asyncio"


@pytest.fixture
async def fake_redis():
    """A fakeredis instance for tests that need Redis without a running server."""
    server = fakeredis.aioredis.FakeServer()
    r = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)
    yield r
    await r.aclose()


@pytest.fixture
async def cache(fake_redis):
    """A RedisCache backed by fakeredis."""
    rc = RedisCache.__new__(RedisCache)
    rc._redis = fake_redis
    yield rc


@pytest.fixture
def mock_fpl_client():
    """An FplClient with mocked HTTP responses."""
    client = FplClient.__new__(FplClient)
    client._base_url = "https://fantasy.premierleague.com/api"
    client._client = AsyncMock()
    return client


SAMPLE_BOOTSTRAP = {
    "events": [{"id": 1, "name": "Gameweek 1", "finished": True}],
    "teams": [{"id": 1, "name": "Arsenal", "short_name": "ARS"}],
    "elements": [{"id": 1, "web_name": "Saka", "team": 1, "element_type": 3}],
    "element_types": [{"id": 3, "singular_name": "Midfielder"}],
}

SAMPLE_FIXTURES = [
    {
        "id": 1,
        "event": 1,
        "team_h": 1,
        "team_a": 2,
        "team_h_score": 2,
        "team_a_score": 0,
        "finished": True,
        "kickoff_time": "2025-08-16T14:00:00Z",
    },
]
