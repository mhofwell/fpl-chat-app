"""HTTP client for the Fantasy Premier League API.

All methods return raw parsed JSON (dict or list). No transformation —
that happens at the tool layer (M3).

Retries transient failures (5xx, timeouts) up to 3 times with
exponential backoff. Logs every request with URL, duration, and status.
"""

from __future__ import annotations

import time

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from fpl_agent.config import settings
from fpl_agent.log_config import get_logger

log = get_logger(__name__)

# Retry on server errors and timeouts, not on 4xx
_RETRY_EXCEPTIONS = (httpx.HTTPStatusError, httpx.TimeoutException, httpx.ConnectError)


def _is_retryable(exc: BaseException) -> bool:
    """Only retry 5xx status errors, timeouts, and connection errors."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return isinstance(exc, (httpx.TimeoutException, httpx.ConnectError))


class FplClient:
    """Async HTTP client for the FPL API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.fpl_api_base).rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(10.0),
            headers={"User-Agent": "fpl-agent-server/0.1.0"},
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
        retry=retry_if_exception_type(_RETRY_EXCEPTIONS),
        before_sleep=lambda retry_state: log.warning(
            "fpl_api_retry",
            message=f"Retrying FPL API request (attempt {retry_state.attempt_number})",
            attempt=retry_state.attempt_number,
        ),
        reraise=True,
    )
    async def _get(self, path: str) -> dict | list:
        """GET a path, raise on non-2xx, return parsed JSON."""
        start = time.monotonic()
        response = await self._client.get(path)
        duration_ms = round((time.monotonic() - start) * 1000)

        log.info(
            "fpl_api_request",
            message=f"{response.status_code} GET {path}",
            path=path,
            status=response.status_code,
            duration_ms=duration_ms,
        )

        response.raise_for_status()
        return response.json()

    async def fetch_bootstrap(self) -> dict:
        """Fetch /bootstrap-static/ — teams, players, gameweeks, positions."""
        return await self._get("/bootstrap-static/")

    async def fetch_fixtures(self) -> list[dict]:
        """Fetch /fixtures/ — all fixtures for the season."""
        return await self._get("/fixtures/")

    async def fetch_element_summary(self, player_id: int) -> dict:
        """Fetch /element-summary/{id}/ — per-player history and fixtures."""
        return await self._get(f"/element-summary/{player_id}/")

    async def fetch_live_gameweek(self, gw_id: int) -> dict:
        """Fetch /event/{id}/live/ — live stats for an active gameweek."""
        return await self._get(f"/event/{gw_id}/live/")

    async def fetch_set_piece_notes(self) -> list[dict]:
        """Fetch /team/set-piece-notes/ — set piece taker assignments."""
        return await self._get("/team/set-piece-notes/")

    async def aclose(self) -> None:
        """Close the underlying httpx client."""
        await self._client.aclose()
