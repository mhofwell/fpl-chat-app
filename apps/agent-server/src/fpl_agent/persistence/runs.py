"""Persistence functions for the agent_runs table.

All five functions take a Supabase Client that is authenticated with the
user's JWT so RLS policies enforce per-user access. The Supabase Python
SDK is synchronous; these wrappers are declared async for a unified call
surface and so future migration to an async SDK is transparent.

Durability protocol (design doc §7):
  create_run_if_not_exists   — INSERT ... ON CONFLICT DO NOTHING
  mark_run_streaming         — UPDATE pending -> streaming, returns row count
  append_tool_event          — append to tool_events JSONB
  finalize_run               — UPDATE -> completed with final text
  fail_run                   — UPDATE -> failed with error dict
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from postgrest.exceptions import APIError
from supabase import Client

from fpl_agent.log_config import get_logger

log = get_logger(__name__)

TABLE = "agent_runs"

# Postgres unique-violation SQLSTATE (duplicate key on primary key).
_PG_UNIQUE_VIOLATION = "23505"


def _now_iso() -> str:
    """UTC now as an ISO 8601 string — Postgres accepts this as timestamptz."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RunState:
    """In-memory view of an agent_runs row."""

    run_id: UUID
    user_id: UUID
    status: str  # pending | streaming | completed | failed
    user_message_content: str
    assistant_message_content: str | None
    tool_events: list[dict]
    error: dict | None


def _row_to_state(row: dict) -> RunState:
    return RunState(
        run_id=UUID(row["run_id"]),
        user_id=UUID(row["user_id"]),
        status=row["status"],
        user_message_content=row["user_message_content"],
        assistant_message_content=row.get("assistant_message_content"),
        tool_events=row.get("tool_events") or [],
        error=row.get("error"),
    )


async def create_run_if_not_exists(
    run_id: UUID, user_id: UUID, user_message: str, client: Client
) -> RunState:
    """INSERT a new row; on primary-key conflict return the existing row.

    Only falls back to SELECT when the INSERT failed with code 23505
    (unique_violation). Other errors — RLS denial, schema mismatch,
    network failure — propagate so callers can surface them correctly.
    """
    try:
        resp = (
            client.table(TABLE)
            .insert(
                {
                    "run_id": str(run_id),
                    "user_id": str(user_id),
                    "status": "pending",
                    "user_message_content": user_message,
                }
            )
            .execute()
        )
        return _row_to_state(resp.data[0])
    except APIError as exc:
        if exc.code != _PG_UNIQUE_VIOLATION:
            raise
        log.info(
            "agent_run_duplicate_fetching_existing",
            message=f"run_id={run_id} already exists, fetching existing row",
            run_id=str(run_id),
        )
        resp = (
            client.table(TABLE)
            .select("*")
            .eq("run_id", str(run_id))
            .single()
            .execute()
        )
        return _row_to_state(resp.data)


async def mark_run_streaming(run_id: UUID, client: Client) -> bool:
    """Guarded transition: only moves status pending -> streaming.

    Returns True if this call transitioned the row (caller owns the run),
    False if zero rows matched (another worker already claimed it, or the
    row is no longer in 'pending'). Callers MUST check this return to
    avoid double-execution races.
    """
    resp = (
        client.table(TABLE)
        .update({"status": "streaming", "updated_at": _now_iso()})
        .eq("run_id", str(run_id))
        .eq("status", "pending")
        .execute()
    )
    # PostgREST returns the updated rows; empty list means zero matched.
    return bool(resp.data)


async def append_tool_event(run_id: UUID, event: dict, client: Client) -> None:
    """Append an event to the tool_events JSONB array.

    Two round trips: SELECT current events, then UPDATE with appended list.
    Safe only when a single writer owns the run_id (enforced by
    mark_run_streaming's guard). If concurrent writes become possible,
    move this to a Postgres function with atomic JSONB append.

    Note: tool_events can grow large across iterations (each event stores
    the full tool result). No size cap in Phase 1 — acceptable given
    max_iters=5 and FPL API response sizes.
    """
    resp = (
        client.table(TABLE)
        .select("tool_events")
        .eq("run_id", str(run_id))
        .single()
        .execute()
    )
    events = list(resp.data.get("tool_events") or [])
    events.append(event)
    (
        client.table(TABLE)
        .update({"tool_events": events, "updated_at": _now_iso()})
        .eq("run_id", str(run_id))
        .execute()
    )


async def finalize_run(run_id: UUID, assistant_text: str, client: Client) -> None:
    """Mark the run completed and store the final assistant message.

    assistant_text is the concatenation of text blocks from every
    Anthropic iteration. For simple Q&A this is just the final answer;
    for tool-heavy responses it may include intermediate text like
    "Let me check...". Acceptable for Phase 1 replay semantics.
    """
    now = _now_iso()
    (
        client.table(TABLE)
        .update(
            {
                "status": "completed",
                "assistant_message_content": assistant_text,
                "completed_at": now,
                "updated_at": now,
            }
        )
        .eq("run_id", str(run_id))
        .execute()
    )


async def fail_run(run_id: UUID, error: dict[str, Any], client: Client) -> None:
    """Mark the run failed and store the error dict."""
    (
        client.table(TABLE)
        .update({"status": "failed", "error": error, "updated_at": _now_iso()})
        .eq("run_id", str(run_id))
        .execute()
    )
