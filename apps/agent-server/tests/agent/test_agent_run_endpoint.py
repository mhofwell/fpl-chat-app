"""Integration tests for POST /agent/run.

Uses FastAPI dependency overrides to mock JWT auth + Supabase client.
Mocks deps.agent_loop with fakes that yield fixed AG-UI event sequences.
Mocks persistence.create_run_if_not_exists to return RunState instances
for the desired dispatch path.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

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
from fpl_agent.auth import get_current_user, get_user_supabase_client
from fpl_agent.persistence.runs import RunState


TEST_USER_ID = UUID("12345678-1234-5678-1234-567812345678")
TEST_RUN_ID = UUID("87654321-4321-8765-4321-876543218765")


def _build_test_app(
    *,
    override_auth: bool = True,
    override_supabase: bool = True,
) -> FastAPI:
    """Build a minimal FastAPI app with the agent router and dep overrides."""
    app = FastAPI()
    app.include_router(agent_api.router)
    if override_auth:
        app.dependency_overrides[get_current_user] = lambda: TEST_USER_ID
    if override_supabase:
        app.dependency_overrides[get_user_supabase_client] = lambda: MagicMock()
    return app


class _FakeAgentLoop:
    """Fake agent loop that yields a fixed sequence of AG-UI events."""

    def __init__(self, events: list[Any]) -> None:
        self._events = events

    async def run_stream(
        self,
        user_message,
        thread_id,
        run_id,
        user_id=None,
        supabase=None,
        dynamic_context=None,
    ):
        for ev in self._events:
            yield ev


@pytest.fixture
def fake_loop_text_only():
    """Fake loop that yields a simple text response."""
    msg_id = "msg-123"
    events = [
        RunStartedEvent(thread_id="t1", run_id=str(TEST_RUN_ID)),
        TextMessageStartEvent(message_id=msg_id, role="assistant"),
        TextMessageContentEvent(message_id=msg_id, delta="Hello "),
        TextMessageContentEvent(message_id=msg_id, delta="world"),
        TextMessageEndEvent(message_id=msg_id),
        RunFinishedEvent(thread_id="t1", run_id=str(TEST_RUN_ID)),
    ]
    return _FakeAgentLoop(events)


@pytest.fixture
def setup_fake_loop(fake_loop_text_only):
    """Inject fake loop into deps and reset on teardown."""
    original = deps.agent_loop
    deps.agent_loop = fake_loop_text_only
    yield fake_loop_text_only
    deps.agent_loop = original


@pytest.fixture
def clear_agent_loop():
    original = deps.agent_loop
    deps.agent_loop = None
    yield
    deps.agent_loop = original


def _parse_sse_lines(body: str) -> list[dict]:
    events = []
    for line in body.split("\n"):
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def _request_body() -> dict:
    return {
        "threadId": "t1",
        "runId": str(TEST_RUN_ID),
        "state": {},
        "messages": [{"id": "u1", "role": "user", "content": "hello"}],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }


def _pending_run_state() -> RunState:
    return RunState(
        run_id=TEST_RUN_ID,
        user_id=TEST_USER_ID,
        status="pending",
        user_message_content="hello",
        assistant_message_content=None,
        tool_events=[],
        error=None,
    )


def _streaming_run_state() -> RunState:
    state = _pending_run_state()
    state.status = "streaming"
    return state


def _completed_run_state(text: str = "cached answer") -> RunState:
    state = _pending_run_state()
    state.status = "completed"
    state.assistant_message_content = text
    return state


def _failed_run_state(message: str = "prior boom") -> RunState:
    state = _pending_run_state()
    state.status = "failed"
    state.error = {"message": message, "type": "RuntimeError"}
    return state


# ── Happy path ──────────────────────────────────────────────────────


def test_endpoint_returns_sse_event_stream(setup_fake_loop):
    """Pending run -> runs the agent loop -> streams events."""
    app = _build_test_app()
    with patch(
        "fpl_agent.api.agent.create_run_if_not_exists",
        return_value=_pending_run_state(),
    ):
        with TestClient(app) as client:
            response = client.post("/agent/run", json=_request_body())

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


# ── Auth ─────────────────────────────────────────────────────────────


def test_endpoint_503_when_jwt_verifier_not_initialized():
    """If deps.jwt_verifier is None, the auth dependency returns 503."""
    original = deps.jwt_verifier
    deps.jwt_verifier = None
    try:
        app = _build_test_app(override_auth=False, override_supabase=False)
        with TestClient(app) as client:
            response = client.post("/agent/run", json=_request_body())
        assert response.status_code == 503
    finally:
        deps.jwt_verifier = original


def test_endpoint_401_with_missing_authorization_header():
    """With jwt_verifier set, a missing Bearer header returns 401."""
    # Stand up a fake verifier so we reach the header check.
    fake_verifier = MagicMock()
    original = deps.jwt_verifier
    deps.jwt_verifier = fake_verifier
    try:
        app = _build_test_app(override_auth=False, override_supabase=False)
        with TestClient(app) as client:
            response = client.post("/agent/run", json=_request_body())
        assert response.status_code == 401
        assert "Authorization" in response.json()["detail"]
    finally:
        deps.jwt_verifier = original


# ── Idempotency dispatch ─────────────────────────────────────────────


def test_endpoint_409_on_streaming_duplicate(setup_fake_loop):
    """Existing streaming run -> HTTP 409 Conflict."""
    app = _build_test_app()
    with patch(
        "fpl_agent.api.agent.create_run_if_not_exists",
        return_value=_streaming_run_state(),
    ):
        with TestClient(app) as client:
            response = client.post("/agent/run", json=_request_body())

            assert response.status_code == 409


def test_endpoint_replays_completed_run(setup_fake_loop):
    """Existing completed run -> stream text replay, no new agent call.

    Uses a MagicMock as agent_loop to prove run_stream is never invoked
    during replay.
    """
    app = _build_test_app()
    spy_loop = MagicMock()
    spy_loop.run_stream = MagicMock()
    original = deps.agent_loop
    deps.agent_loop = spy_loop
    try:
        completed = _completed_run_state(text="Arsenal are playing well.")
        with patch(
            "fpl_agent.api.agent.create_run_if_not_exists",
            return_value=completed,
        ):
            with TestClient(app) as client:
                response = client.post("/agent/run", json=_request_body())

                assert response.status_code == 200
                events = _parse_sse_lines(response.text)
                types = [e["type"] for e in events]
                assert types == [
                    "RUN_STARTED",
                    "TEXT_MESSAGE_START",
                    "TEXT_MESSAGE_CONTENT",
                    "TEXT_MESSAGE_END",
                    "RUN_FINISHED",
                ]
                content_event = next(e for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")
                assert content_event["delta"] == "Arsenal are playing well."
                # Critical assertion: no new agent run was triggered
                spy_loop.run_stream.assert_not_called()
    finally:
        deps.agent_loop = original


def test_endpoint_replays_failed_run(setup_fake_loop):
    """Existing failed run -> stream RunStarted + RunError with stored message."""
    app = _build_test_app()
    failed = _failed_run_state(message="earlier exception")
    with patch(
        "fpl_agent.api.agent.create_run_if_not_exists",
        return_value=failed,
    ):
        with TestClient(app) as client:
            response = client.post("/agent/run", json=_request_body())

            assert response.status_code == 200
            events = _parse_sse_lines(response.text)
            types = [e["type"] for e in events]
            assert types == ["RUN_STARTED", "RUN_ERROR"]
            err_event = events[1]
            assert err_event["message"] == "earlier exception"
            assert err_event["code"] == "previous_failure"


# ── Error paths ──────────────────────────────────────────────────────


def test_endpoint_503_when_agent_loop_missing(clear_agent_loop):
    """503 if deps.agent_loop is None."""
    app = _build_test_app()
    with TestClient(app) as client:
        response = client.post("/agent/run", json=_request_body())
        assert response.status_code == 503


def test_endpoint_400_when_no_user_message(setup_fake_loop):
    """400 if input.messages has no UserMessage."""
    app = _build_test_app()
    with TestClient(app) as client:
        body = _request_body()
        body["messages"] = [{"id": "a1", "role": "assistant", "content": "hi"}]
        response = client.post("/agent/run", json=body)
        assert response.status_code == 400


def test_endpoint_400_on_invalid_run_id(setup_fake_loop):
    """400 if run_id is not a valid UUID."""
    app = _build_test_app()
    with TestClient(app) as client:
        body = _request_body()
        body["runId"] = "not-a-uuid"
        response = client.post("/agent/run", json=body)
        assert response.status_code == 400


class _RaisingAgentLoop:
    async def run_stream(
        self, user_message, thread_id, run_id, user_id=None, supabase=None, dynamic_context=None
    ):
        yield RunStartedEvent(thread_id=thread_id, run_id=run_id)
        yield RunErrorEvent(message="boom", code="agent_error")
        raise RuntimeError("simulated downstream failure")


@pytest.fixture
def setup_raising_loop():
    original = deps.agent_loop
    deps.agent_loop = _RaisingAgentLoop()
    yield
    deps.agent_loop = original


def test_endpoint_streams_run_error_event_before_close(setup_raising_loop):
    """When run_stream raises, the client still receives the RunErrorEvent."""
    app = _build_test_app()
    with patch(
        "fpl_agent.api.agent.create_run_if_not_exists",
        return_value=_pending_run_state(),
    ):
        with TestClient(app) as client:
            response = client.post("/agent/run", json=_request_body())

            assert response.status_code == 200
            events = _parse_sse_lines(response.text)
            types = [e["type"] for e in events]
            assert "RUN_STARTED" in types
            assert "RUN_ERROR" in types
