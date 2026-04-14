"""POST /agent/run — AG-UI SSE streaming endpoint.

Accepts a RunAgentInput + Authorization: Bearer <JWT>, dispatches on
the agent_runs row state (new / streaming / completed / failed), and
streams AG-UI events.

Dispatch matrix:
  - new (pending)    → mark streaming, run the agent loop, finalize on success
  - already streaming → HTTP 409 (no wait-and-tail in Phase 1)
  - already completed → text replay of the stored assistant message
  - already failed    → RunError with the stored error
"""

from __future__ import annotations

import uuid
from uuid import UUID

from ag_ui.core.events import (
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from ag_ui.core.types import AssistantMessage, RunAgentInput, UserMessage
from ag_ui.encoder import EventEncoder
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from supabase import Client as SupabaseClient

import fpl_agent.deps as deps
from fpl_agent.auth import get_current_user, get_user_supabase_client
from fpl_agent.log_config import get_logger
from fpl_agent.metrics import AGENT_REQUESTS
from fpl_agent.persistence.runs import RunState, create_run_if_not_exists

log = get_logger(__name__)
router = APIRouter()


def _user_message_content_as_text(msg: UserMessage) -> str:
    """Flatten a UserMessage.content (str | list[InputContent]) to plain text."""
    content = msg.content
    if isinstance(content, str):
        return content
    return "".join(
        getattr(part, "text", "") for part in content if hasattr(part, "text")
    )


def _extract_last_user_message(input: RunAgentInput) -> str:
    """Walk messages from the end, return the content of the last UserMessage."""
    for msg in reversed(input.messages):
        if isinstance(msg, UserMessage):
            return _user_message_content_as_text(msg)
    raise HTTPException(status_code=400, detail="No user message in input.messages")


def _convert_messages_for_anthropic(input: RunAgentInput) -> list[dict]:
    """Convert AG-UI conversation history to Anthropic messages format.

    Passes user and assistant turns through; skips tool/reasoning/system
    messages (Claude ignores duplicated system, and tool rounds are
    self-contained within a single assistant turn's tool_use blocks).
    The last message is expected to be the current user turn.
    """
    converted: list[dict] = []
    for msg in input.messages:
        if isinstance(msg, UserMessage):
            converted.append(
                {"role": "user", "content": _user_message_content_as_text(msg)}
            )
        elif isinstance(msg, AssistantMessage) and msg.content:
            # AssistantMessage.content is str | None. Only include non-empty text turns;
            # prior tool_use rounds aren't reconstructible from what the client sends.
            converted.append({"role": "assistant", "content": msg.content})
    return converted


async def _replay_completed_run(run_state: RunState, thread_id: str, run_id: str):
    """Yield a minimal AG-UI event sequence for a previously completed run.

    This is the idempotent retry path: same run_id, stream back the stored
    text as a RunStarted -> TextMessage -> RunFinished sequence. No new
    Anthropic call is made.
    """
    yield RunStartedEvent(thread_id=thread_id, run_id=run_id)
    msg_id = str(uuid.uuid4())
    yield TextMessageStartEvent(message_id=msg_id, role="assistant")
    text = run_state.assistant_message_content or ""
    if text:
        yield TextMessageContentEvent(message_id=msg_id, delta=text)
    yield TextMessageEndEvent(message_id=msg_id)
    yield RunFinishedEvent(thread_id=thread_id, run_id=run_id)


async def _replay_failed_run(run_state: RunState, thread_id: str, run_id: str):
    """Yield RunStarted + RunError for a previously failed run."""
    yield RunStartedEvent(thread_id=thread_id, run_id=run_id)
    err_msg = (run_state.error or {}).get("message", "Previous run failed")
    yield RunErrorEvent(message=err_msg, code="previous_failure")


@router.post("/agent/run")
async def run_agent(
    input: RunAgentInput,
    user_id: UUID = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_user_supabase_client),
) -> StreamingResponse:
    """Stream AG-UI events for one agent run."""
    AGENT_REQUESTS.labels(status="started").inc()
    if deps.agent_loop is None:
        raise HTTPException(status_code=503, detail="Agent loop not initialized")

    user_message = _extract_last_user_message(input)
    conversation_history = _convert_messages_for_anthropic(input)

    try:
        run_uuid = UUID(input.run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="run_id must be a valid UUID") from exc

    run_state = await create_run_if_not_exists(
        run_id=run_uuid,
        user_id=user_id,
        user_message=user_message,
        client=supabase,
    )

    if run_state.status == "streaming":
        raise HTTPException(status_code=409, detail="Run already in progress")

    encoder = EventEncoder()

    async def event_generator():
        if run_state.status == "completed":
            async for ev in _replay_completed_run(run_state, input.thread_id, input.run_id):
                yield encoder.encode(ev)
            AGENT_REQUESTS.labels(status="replayed").inc()
            return

        if run_state.status == "failed":
            async for ev in _replay_failed_run(run_state, input.thread_id, input.run_id):
                yield encoder.encode(ev)
            AGENT_REQUESTS.labels(status="replayed").inc()
            return

        # status == "pending" — we own this run
        try:
            async for event in deps.agent_loop.run_stream(
                user_message=user_message,
                thread_id=input.thread_id,
                run_id=input.run_id,
                user_id=user_id,
                supabase=supabase,
                conversation_history=conversation_history,
            ):
                yield encoder.encode(event)
            AGENT_REQUESTS.labels(status="finished").inc()
        except Exception as exc:
            # run_stream already yielded RunErrorEvent and wrote fail_run;
            # log here for server-side visibility
            AGENT_REQUESTS.labels(status="failed").inc()
            log.error(
                "agent_run_endpoint_failed",
                message=f"Stream terminated with error: {exc}",
                error=str(exc),
            )

    return StreamingResponse(
        event_generator(),
        media_type=encoder.get_content_type(),
    )
