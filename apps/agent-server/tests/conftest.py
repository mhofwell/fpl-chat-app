"""Shared pytest fixtures for the FPL agent server test suite.

M1: minimal — lets `uv run pytest` exit 0 with "no tests ran".

M2/M3 additions:
  - fakeredis fixture for unit tests
  - frozen bootstrap fixture (loads tests/fixtures/bootstrap_frozen.json)
  - FastMCP in-process client fixture
  - settings override fixture for test-specific env vars
"""

from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio as the anyio backend for async tests."""
    return "asyncio"
