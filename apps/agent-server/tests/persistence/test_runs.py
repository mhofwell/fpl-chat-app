"""Unit tests for persistence/runs.py with a mocked Supabase Client."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from postgrest.exceptions import APIError

from fpl_agent.persistence.runs import (
    RunState,
    append_tool_event,
    create_run_if_not_exists,
    fail_run,
    finalize_run,
    mark_run_streaming,
)


def _api_error(code: str) -> APIError:
    """Build a minimal APIError with the given Postgres SQLSTATE code."""
    return APIError({"code": code, "message": "mock"})

RUN_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")


def _row(
    status: str = "pending",
    assistant_text: str | None = None,
    tool_events: list | None = None,
    error: dict | None = None,
) -> dict:
    """Build a fake agent_runs row."""
    return {
        "run_id": str(RUN_ID),
        "user_id": str(USER_ID),
        "status": status,
        "user_message_content": "test message",
        "assistant_message_content": assistant_text,
        "tool_events": tool_events or [],
        "error": error,
    }


def _make_query_chain(final_data):
    """Build a mock chain object whose .execute() returns data=final_data."""
    chain = MagicMock()
    chain.execute.return_value = SimpleNamespace(data=final_data)
    # Any fluent method returns the chain itself
    for name in ("insert", "select", "update", "eq", "single"):
        getattr(chain, name).return_value = chain
    return chain


def _make_client(
    rows_for_select: list | dict | None = None,
    raise_on_insert: Exception | None = None,
    update_returns: list | None = None,
):
    """Build a fake Supabase client with a .table() method that returns a chain.

    Callers can reach into client.update_chain / .select_chain / .insert_chain
    to assert call arguments."""
    client = MagicMock()

    # Chain for insert operations
    insert_chain = MagicMock()
    if raise_on_insert:
        insert_chain.execute.side_effect = raise_on_insert
    else:
        insert_chain.execute.return_value = SimpleNamespace(data=[_row()])
    insert_chain.insert.return_value = insert_chain

    # Chain for update operations — default to one "row updated"
    update_chain = MagicMock()
    update_chain.execute.return_value = SimpleNamespace(
        data=update_returns if update_returns is not None else [{"ok": True}]
    )
    for name in ("update", "eq"):
        getattr(update_chain, name).return_value = update_chain

    # Chain for select operations
    select_chain = MagicMock()
    select_chain.execute.return_value = SimpleNamespace(data=rows_for_select)
    for name in ("select", "eq", "single"):
        getattr(select_chain, name).return_value = select_chain

    # Dispatch table() calls: return a chain that can handle any path
    super_chain = MagicMock()
    super_chain.insert = insert_chain.insert
    super_chain.update = update_chain.update
    super_chain.select = select_chain.select
    client.table.return_value = super_chain

    client.insert_chain = insert_chain
    client.update_chain = update_chain
    client.select_chain = select_chain
    return client


@pytest.mark.asyncio
async def test_create_run_if_not_exists_new_row():
    """Happy path: INSERT succeeds, returns the new row as a RunState."""
    client = _make_client()
    state = await create_run_if_not_exists(RUN_ID, USER_ID, "hello", client)
    assert isinstance(state, RunState)
    assert state.run_id == RUN_ID
    assert state.user_id == USER_ID
    assert state.status == "pending"
    assert state.user_message_content == "test message"


@pytest.mark.asyncio
async def test_create_run_if_not_exists_conflict_falls_back_to_select():
    """On 23505 unique violation, falls back to SELECT and returns existing row."""
    existing = _row(status="completed", assistant_text="cached answer")
    client = _make_client(
        rows_for_select=existing,
        raise_on_insert=_api_error("23505"),
    )
    state = await create_run_if_not_exists(RUN_ID, USER_ID, "hello", client)
    assert state.status == "completed"
    assert state.assistant_message_content == "cached answer"


@pytest.mark.asyncio
async def test_create_run_if_not_exists_rls_violation_propagates():
    """RLS errors (42501) must NOT be silently treated as conflicts."""
    client = _make_client(raise_on_insert=_api_error("42501"))
    with pytest.raises(APIError) as ctx:
        await create_run_if_not_exists(RUN_ID, USER_ID, "hello", client)
    assert ctx.value.code == "42501"


@pytest.mark.asyncio
async def test_mark_run_streaming_updates_with_pending_guard():
    """mark_run_streaming filters on status='pending' AND returns True on success."""
    client = _make_client()
    claimed = await mark_run_streaming(RUN_ID, client)
    assert claimed is True

    update_call = client.update_chain.update.call_args
    body = update_call.args[0]
    assert body["status"] == "streaming"
    # updated_at must be a real ISO 8601 timestamp, not the literal "now()"
    datetime.fromisoformat(body["updated_at"])

    # Verify the pending guard was actually applied
    eq_calls = [c.args for c in client.update_chain.eq.call_args_list]
    assert ("status", "pending") in eq_calls


@pytest.mark.asyncio
async def test_mark_run_streaming_returns_false_when_zero_rows_affected():
    """When no row matched (another worker claimed it), return False."""
    client = _make_client(update_returns=[])
    claimed = await mark_run_streaming(RUN_ID, client)
    assert claimed is False


@pytest.mark.asyncio
async def test_append_tool_event_roundtrip():
    """append_tool_event fetches existing events, appends, and updates."""
    existing_events = [{"type": "tool_call", "tool_name": "get_players"}]
    client = _make_client(rows_for_select={"tool_events": existing_events})

    new_event = {"type": "tool_call", "tool_name": "get_teams"}
    await append_tool_event(RUN_ID, new_event, client)

    # Verify update was called with appended list
    update_call = client.update_chain.update.call_args
    assert update_call.args[0]["tool_events"] == existing_events + [new_event]


@pytest.mark.asyncio
async def test_append_tool_event_handles_null_events():
    """If tool_events is null/missing, start from empty list."""
    client = _make_client(rows_for_select={"tool_events": None})

    event = {"type": "tool_call"}
    await append_tool_event(RUN_ID, event, client)

    update_call = client.update_chain.update.call_args
    assert update_call.args[0]["tool_events"] == [event]


@pytest.mark.asyncio
async def test_finalize_run_sets_completed():
    """finalize_run sets status=completed and stores the text with real timestamps."""
    client = _make_client()
    await finalize_run(RUN_ID, "final answer text", client)

    update_call = client.update_chain.update.call_args
    body = update_call.args[0]
    assert body["status"] == "completed"
    assert body["assistant_message_content"] == "final answer text"
    # Both timestamp fields must parse as ISO 8601
    datetime.fromisoformat(body["completed_at"])
    datetime.fromisoformat(body["updated_at"])


@pytest.mark.asyncio
async def test_fail_run_stores_error():
    """fail_run sets status=failed and stores the error dict with real timestamp."""
    client = _make_client()
    error = {"message": "boom", "type": "RuntimeError"}
    await fail_run(RUN_ID, error, client)

    update_call = client.update_chain.update.call_args
    body = update_call.args[0]
    assert body["status"] == "failed"
    assert body["error"] == error
    datetime.fromisoformat(body["updated_at"])
