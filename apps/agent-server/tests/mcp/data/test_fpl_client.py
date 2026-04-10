"""Tests for the FPL API HTTP client."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fpl_agent.mcp.data.fpl_client import FplClient


@pytest.fixture
def client():
    """FplClient with a mocked httpx.AsyncClient."""
    c = FplClient.__new__(FplClient)
    c._base_url = "https://fantasy.premierleague.com/api"
    c._client = AsyncMock(spec=httpx.AsyncClient)
    return c


def _mock_response(data, status_code=200):
    """Create a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = data
    resp.raise_for_status = MagicMock()
    return resp


@pytest.mark.asyncio
async def test_fetch_bootstrap_calls_correct_path(client):
    """fetch_bootstrap hits /bootstrap-static/."""
    client._client.get = AsyncMock(return_value=_mock_response({"events": []}))
    result = await client.fetch_bootstrap()
    client._client.get.assert_called_once_with("/bootstrap-static/")
    assert result == {"events": []}


@pytest.mark.asyncio
async def test_fetch_fixtures_calls_correct_path(client):
    """fetch_fixtures hits /fixtures/."""
    client._client.get = AsyncMock(return_value=_mock_response([{"id": 1}]))
    result = await client.fetch_fixtures()
    client._client.get.assert_called_once_with("/fixtures/")
    assert result == [{"id": 1}]


@pytest.mark.asyncio
async def test_fetch_element_summary_includes_player_id(client):
    """fetch_element_summary uses the player_id in the path."""
    client._client.get = AsyncMock(return_value=_mock_response({"history": []}))
    result = await client.fetch_element_summary(302)
    client._client.get.assert_called_once_with("/element-summary/302/")
    assert result == {"history": []}


@pytest.mark.asyncio
async def test_fetch_live_gameweek_includes_gw_id(client):
    """fetch_live_gameweek uses the gameweek id in the path."""
    client._client.get = AsyncMock(return_value=_mock_response({"elements": []}))
    result = await client.fetch_live_gameweek(15)
    client._client.get.assert_called_once_with("/event/15/live/")
    assert result == {"elements": []}


@pytest.mark.asyncio
async def test_fetch_set_piece_notes_calls_correct_path(client):
    """fetch_set_piece_notes hits /team/set-piece-notes/."""
    client._client.get = AsyncMock(return_value=_mock_response([]))
    result = await client.fetch_set_piece_notes()
    client._client.get.assert_called_once_with("/team/set-piece-notes/")
    assert result == []
