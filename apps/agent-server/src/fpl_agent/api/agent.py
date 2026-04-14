"""POST /agent/run — AG-UI SSE streaming endpoint.

Accepts a RunAgentInput, runs the agent loop, streams AG-UI events.
M5: no auth, no agent_runs persistence — both deferred to M4b.
"""

from __future__ import annotations

from ag_ui.core.types import RunAgentInput, UserMessage
from ag_ui.encoder import EventEncoder
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import fpl_agent.deps as deps
from fpl_agent.log_config import get_logger

log = get_logger(__name__)
router = APIRouter()


def _extract_last_user_message(input: RunAgentInput) -> str:
    """Walk messages from the end, return the content of the last UserMessage."""
    for msg in reversed(input.messages):
        if isinstance(msg, UserMessage):
            content = msg.content
            if isinstance(content, str):
                return content
            # InputContent list — concatenate text parts
            return "".join(
                getattr(part, "text", "") for part in content if hasattr(part, "text")
            )
    raise HTTPException(status_code=400, detail="No user message in input.messages")


@router.post("/agent/run")
async def run_agent(input: RunAgentInput) -> StreamingResponse:
    """Stream AG-UI events for one agent run."""
    if deps.agent_loop is None:
        raise HTTPException(status_code=503, detail="Agent loop not initialized")

    user_message = _extract_last_user_message(input)
    encoder = EventEncoder()

    async def event_generator():
        try:
            async for event in deps.agent_loop.run_stream(
                user_message=user_message,
                thread_id=input.thread_id,
                run_id=input.run_id,
            ):
                yield encoder.encode(event)
        except Exception as exc:
            # run_stream already yielded RunErrorEvent before re-raising;
            # log here for server-side visibility
            log.error(
                "agent_run_endpoint_failed",
                message=f"Stream terminated with error: {exc}",
                error=str(exc),
            )

    return StreamingResponse(
        event_generator(),
        media_type=encoder.get_content_type(),
    )
