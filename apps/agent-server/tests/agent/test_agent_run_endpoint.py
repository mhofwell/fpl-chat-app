"""Integration tests for POST /agent/run.

Mocks deps.agent_loop with a fake that yields a fixed event sequence.
Verifies the endpoint returns SSE-formatted AG-UI events.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from ag_ui.core.events import (
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

import fpl_agent.deps as deps
from fpl_agent.api import agent as agent_api


def _build_test_app() -> FastAPI:
    """Build a minimal FastAPI app with just the agent router (no lifespan)."""
    app = FastAPI()
    app.include_router(agent_api.router)
    return app


class _FakeAgentLoop:
    """Fake agent loop that yields a fixed sequence of AG-UI events."""

    def __init__(self, events: list[Any]) -> None:
        self._events = events

    async def run_stream(self, user_message, thread_id, run_id, dynamic_context=None):
        for ev in self._events:
            yield ev


@pytest.fixture
def fake_loop_text_only():
    """Fake loop that yields a simple text response."""
    msg_id = "msg-123"
    events = [
        RunStartedEvent(thread_id="t1", run_id="r1"),
        TextMessageStartEvent(message_id=msg_id, role="assistant"),
        TextMessageContentEvent(message_id=msg_id, delta="Hello "),
        TextMessageContentEvent(message_id=msg_id, delta="world"),
        TextMessageEndEvent(message_id=msg_id),
        RunFinishedEvent(thread_id="t1", run_id="r1"),
    ]
    return _FakeAgentLoop(events)


@pytest.fixture
def setup_fake_loop(fake_loop_text_only):
    """Inject fake loop into deps and reset on teardown."""
    original = deps.agent_loop
    deps.agent_loop = fake_loop_text_only
    yield fake_loop_text_only
    deps.agent_loop = original


def _parse_sse_lines(body: str) -> list[dict]:
    """Parse SSE response body into a list of decoded JSON events."""
    events = []
    for line in body.split("\n"):
        if line.startswith("data: "):
            payload = line[len("data: "):]
            events.append(json.loads(payload))
    return events


def test_endpoint_returns_sse_event_stream(setup_fake_loop):
    """The endpoint streams AG-UI events as SSE."""
    app = _build_test_app()
    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "t1",
                "runId": "r1",
                "state": {},
                "messages": [
                    {"id": "u1", "role": "user", "content": "hello"}
                ],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        events = _parse_sse_lines(response.text)
        types = [e["type"] for e in events]
        assert types == [
            "RUN_STARTED",
            "TEXT_MESSAGE_START",
            "TEXT_MESSAGE_CONTENT",
            "TEXT_MESSAGE_CONTENT",
            "TEXT_MESSAGE_END",
            "RUN_FINISHED",
        ]
        # Verify camelCase serialization
        assert events[1]["messageId"] == "msg-123"
        assert events[2]["delta"] == "Hello "
        assert events[3]["delta"] == "world"


@pytest.fixture
def clear_agent_loop():
    """Clear deps.agent_loop and restore on teardown."""
    original = deps.agent_loop
    deps.agent_loop = None
    yield
    deps.agent_loop = original


def test_endpoint_503_when_agent_loop_missing(clear_agent_loop):
    """503 if deps.agent_loop is None."""
    app = _build_test_app()
    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "t1",
                "runId": "r1",
                "state": {},
                "messages": [{"id": "u1", "role": "user", "content": "hi"}],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
        assert response.status_code == 503


class _RaisingAgentLoop:
    """Fake loop that yields RunStarted, then a RunErrorEvent, then raises."""

    async def run_stream(self, user_message, thread_id, run_id, dynamic_context=None):
        yield RunStartedEvent(thread_id=thread_id, run_id=run_id)
        yield RunErrorEvent(message="boom", code="agent_error")
        raise RuntimeError("simulated downstream failure")


@pytest.fixture
def setup_raising_loop():
    """Inject a loop that errors out mid-stream."""
    original = deps.agent_loop
    deps.agent_loop = _RaisingAgentLoop()
    yield
    deps.agent_loop = original


def test_endpoint_streams_run_error_event_before_close(setup_raising_loop):
    """When run_stream raises, the client still receives the RunErrorEvent."""
    app = _build_test_app()
    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "t1",
                "runId": "r1",
                "state": {},
                "messages": [{"id": "u1", "role": "user", "content": "hi"}],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
        assert response.status_code == 200
        events = _parse_sse_lines(response.text)
        types = [e["type"] for e in events]
        assert "RUN_STARTED" in types
        assert "RUN_ERROR" in types
        run_error = next(e for e in events if e["type"] == "RUN_ERROR")
        assert run_error["message"] == "boom"
        assert run_error["code"] == "agent_error"


def test_endpoint_400_when_no_user_message(setup_fake_loop):
    """400 if input.messages has no UserMessage."""
    app = _build_test_app()
    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "threadId": "t1",
                "runId": "r1",
                "state": {},
                "messages": [
                    {"id": "a1", "role": "assistant", "content": "hi"}
                ],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
        assert response.status_code == 400
