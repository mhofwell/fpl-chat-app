"""POST /agent/chat/test — non-streaming test endpoint for the agent loop.

No auth in M4a. Will be replaced by /agent/run with AG-UI streaming in M5
and Supabase JWT auth in M4b.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import fpl_agent.deps as deps
from fpl_agent.agent.loop import AgentLoopError
from fpl_agent.log_config import get_logger

log = get_logger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    iterations: int
    tool_calls: list[dict] = []


@router.post("/agent/chat/test", response_model=ChatResponse)
async def chat_test(req: ChatRequest) -> ChatResponse:
    """Test endpoint — runs the agent loop and returns the final text."""
    if deps.agent_loop is None:
        raise HTTPException(status_code=503, detail="Agent loop not initialized")

    try:
        result = await deps.agent_loop.run(req.message)
    except AgentLoopError as exc:
        log.error("agent_loop_failed", message=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ChatResponse(
        response=result.response_text,
        iterations=result.iterations,
        tool_calls=[
            {"name": tc.name, "input": tc.input, "is_error": tc.is_error}
            for tc in result.tool_calls
        ],
    )
