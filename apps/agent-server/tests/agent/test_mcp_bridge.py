"""Tests for McpBridge — uses the real in-process FastMCP client."""

from __future__ import annotations

import json
from pathlib import Path

import fakeredis.aioredis
import pytest

import fpl_agent.deps as deps
import fpl_agent.mcp.tools  # noqa: F401 — register tools
from fpl_agent.agent.mcp_bridge import McpBridge
from fpl_agent.mcp.data.bootstrap import CACHE_KEY as BOOTSTRAP_KEY
from fpl_agent.mcp.data.cache import RedisCache
from fpl_agent.mcp.data.fixtures import CACHE_KEY as FIXTURES_KEY

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.fixture
async def setup_deps():
    """Wire up fakeredis with frozen data so tools can run."""
    server = fakeredis.aioredis.FakeServer()
    redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)
    cache = RedisCache.__new__(RedisCache)
    cache._redis = redis

    bootstrap = json.loads((FIXTURES_DIR / "bootstrap_sample.json").read_text())
    fixtures = json.loads((FIXTURES_DIR / "fixtures_sample.json").read_text())
    await cache.set_json(BOOTSTRAP_KEY, bootstrap, ttl_seconds=3600)
    await cache.set_json(FIXTURES_KEY, fixtures, ttl_seconds=3600)

    deps.cache = cache
    deps.client = None
    yield
    deps.cache = None
    deps.client = None
    await redis.aclose()


@pytest.mark.asyncio
async def test_list_tools_returns_three_tools(setup_deps):
    """The bridge lists all three M3 tools."""
    bridge = McpBridge()
    tools = await bridge.list_tools_anthropic_format()
    names = {t["name"] for t in tools}
    assert names == {"get_players", "get_teams", "get_fixtures"}


@pytest.mark.asyncio
async def test_list_tools_anthropic_format_shape(setup_deps):
    """Each tool has name, description, input_schema."""
    bridge = McpBridge()
    tools = await bridge.list_tools_anthropic_format()
    for t in tools:
        assert "name" in t
        assert "description" in t
        assert "input_schema" in t
        assert t["input_schema"]["type"] == "object"


@pytest.mark.asyncio
async def test_cache_control_on_last_tool_only(setup_deps):
    """Only the last tool has cache_control set."""
    bridge = McpBridge()
    tools = await bridge.list_tools_anthropic_format()
    for t in tools[:-1]:
        assert "cache_control" not in t
    assert tools[-1]["cache_control"] == {"type": "ephemeral"}


@pytest.mark.asyncio
async def test_call_tool_returns_json_string(setup_deps):
    """call_tool returns a JSON string from a successful tool execution."""
    bridge = McpBridge()
    content, is_error = await bridge.call_tool("get_players", {"name": "Haaland", "limit": 1})
    assert is_error is False
    parsed = json.loads(content)
    assert "data" in parsed
    assert parsed["data"][0]["basic"]["web_name"] == "Haaland"


@pytest.mark.asyncio
async def test_call_tool_handles_tool_error(setup_deps):
    """A ToolError from the tool returns is_error=True with the message."""
    bridge = McpBridge()
    content, is_error = await bridge.call_tool("get_players", {"name": "Zzznonexistent"})
    assert is_error is True
    assert "No player found" in content
