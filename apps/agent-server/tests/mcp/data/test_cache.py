"""Tests for the Redis cache wrapper."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_set_and_get_json(cache):
    """set_json then get_json returns the same data."""
    data = {"key": "value", "nested": [1, 2, 3]}
    await cache.set_json("test:key", data, ttl_seconds=60)
    result = await cache.get_json("test:key")
    assert result == data


@pytest.mark.asyncio
async def test_get_json_returns_none_on_miss(cache):
    """get_json returns None for a key that doesn't exist."""
    result = await cache.get_json("nonexistent:key")
    assert result is None


@pytest.mark.asyncio
async def test_delete_removes_key(cache):
    """delete removes a key from the cache."""
    await cache.set_json("test:delete", {"a": 1}, ttl_seconds=60)
    assert await cache.exists("test:delete") is True
    await cache.delete("test:delete")
    assert await cache.exists("test:delete") is False


@pytest.mark.asyncio
async def test_exists(cache):
    """exists returns True for present keys, False for missing."""
    assert await cache.exists("missing") is False
    await cache.set_json("present", {}, ttl_seconds=60)
    assert await cache.exists("present") is True


@pytest.mark.asyncio
async def test_set_json_overwrites(cache):
    """set_json is idempotent — overwrites existing values."""
    await cache.set_json("test:overwrite", {"v": 1}, ttl_seconds=60)
    await cache.set_json("test:overwrite", {"v": 2}, ttl_seconds=60)
    result = await cache.get_json("test:overwrite")
    assert result == {"v": 2}


@pytest.mark.asyncio
async def test_get_json_handles_list(cache):
    """get_json works with list values, not just dicts."""
    data = [{"id": 1}, {"id": 2}]
    await cache.set_json("test:list", data, ttl_seconds=60)
    result = await cache.get_json("test:list")
    assert result == data


@pytest.mark.asyncio
async def test_ping(cache):
    """ping returns True for a connected (fake) Redis."""
    assert await cache.ping() is True
