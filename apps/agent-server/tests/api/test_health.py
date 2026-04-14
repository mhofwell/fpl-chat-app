"""Tests for /health, /ready, /metrics."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import fpl_agent.deps as deps
from fpl_agent.api import health as health_api


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(health_api.router)
    return app


def test_health_always_200():
    app = _build_test_app()
    with TestClient(app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["service"] == "fpl-agent-server"


def test_ready_503_when_cache_missing():
    orig_cache, orig_loop = deps.cache, deps.agent_loop
    deps.cache = None
    deps.agent_loop = None
    try:
        app = _build_test_app()
        with TestClient(app) as client:
            r = client.get("/ready")
        assert r.status_code == 503
    finally:
        deps.cache, deps.agent_loop = orig_cache, orig_loop


def test_ready_503_when_redis_ping_fails():
    orig_cache, orig_loop = deps.cache, deps.agent_loop
    fake_cache = MagicMock()
    fake_cache.ping = AsyncMock(return_value=False)
    deps.cache = fake_cache
    deps.agent_loop = MagicMock()
    try:
        app = _build_test_app()
        with TestClient(app) as client:
            r = client.get("/ready")
        assert r.status_code == 503
        assert "Redis" in r.json()["detail"]
    finally:
        deps.cache, deps.agent_loop = orig_cache, orig_loop


def test_ready_200_when_everything_up():
    orig_cache, orig_loop = deps.cache, deps.agent_loop
    fake_cache = MagicMock()
    fake_cache.ping = AsyncMock(return_value=True)
    deps.cache = fake_cache
    deps.agent_loop = MagicMock()
    try:
        app = _build_test_app()
        with TestClient(app) as client:
            r = client.get("/ready")
        assert r.status_code == 200
        assert r.json()["status"] == "ready"
    finally:
        deps.cache, deps.agent_loop = orig_cache, orig_loop


def test_metrics_returns_prometheus_exposition():
    app = _build_test_app()
    with TestClient(app) as client:
        r = client.get("/metrics")
    assert r.status_code == 200
    assert "text/plain" in r.headers["content-type"]
    body = r.text
    # Every Phase 1 counter should be present in the exposition
    for metric in (
        "anthropic_cache_read_tokens_total",
        "anthropic_cache_write_tokens_total",
        "anthropic_input_tokens_total",
        "anthropic_output_tokens_total",
        "tool_calls_total",
        "agent_requests_total",
    ):
        assert metric in body, f"{metric} missing from /metrics output"
