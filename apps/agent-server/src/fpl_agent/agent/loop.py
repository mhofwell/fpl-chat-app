"""Anthropic agent loop with in-process FastMCP tool execution.

Two entry points:
- `run()` — non-streaming, returns AgentRunResult. Used by /agent/chat/test.
- `run_stream()` — async generator yielding AG-UI events. Used by /agent/run.

Both share the same multi-iteration agent loop pattern. The streaming
version translates Anthropic streaming events into AG-UI events via
AnthropicToAGUIAdapter and yields them as they arrive.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from ag_ui.core.events import (
    BaseEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    ToolCallResultEvent,
)
from anthropic import AsyncAnthropic

from fpl_agent.adapters.anthropic_to_agui import AnthropicToAGUIAdapter
from fpl_agent.agent.mcp_bridge import McpBridge
from fpl_agent.log_config import get_logger
from fpl_agent.mcp.system_prompt import DynamicContext, build_system_prompt_blocks

log = get_logger(__name__)


class AgentLoopError(Exception):
    """Raised when the agent loop cannot complete normally."""


@dataclass
class ToolCallRecord:
    """A tool invocation that happened during a run."""

    name: str
    input: dict
    result: str
    is_error: bool


@dataclass
class AgentRunResult:
    """Final result of an agent run."""

    response_text: str
    iterations: int
    stop_reason: str
    tool_calls: list[ToolCallRecord] = field(default_factory=list)


class AgentLoop:
    """Non-streaming agent loop over Claude with in-process MCP tools."""

    def __init__(
        self,
        anthropic_client: AsyncAnthropic,
        mcp_bridge: McpBridge,
        model: str = "claude-sonnet-4-5",
        max_tool_iterations: int = 5,
        max_tokens: int = 4096,
    ) -> None:
        self._anthropic = anthropic_client
        self._mcp = mcp_bridge
        self._model = model
        self._max_iters = max_tool_iterations
        self._max_tokens = max_tokens

    async def run(
        self,
        user_message: str,
        dynamic_context: DynamicContext | None = None,
    ) -> AgentRunResult:
        """Run the agent loop until stop_reason != tool_use or max iterations."""
        system_blocks = build_system_prompt_blocks(dynamic_context or DynamicContext())
        tools = await self._mcp.list_tools_anthropic_format()
        messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]
        tool_calls: list[ToolCallRecord] = []

        for iteration in range(self._max_iters):
            response = await self._anthropic.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                system=system_blocks,
                tools=tools,
                tool_choice={"type": "auto"},
                messages=messages,
            )

            self._log_usage(response.usage, iteration)

            if response.stop_reason != "tool_use":
                if response.stop_reason == "max_tokens":
                    log.warning(
                        "anthropic_response_truncated",
                        message=(
                            f"Response truncated at max_tokens={self._max_tokens} "
                            f"on iteration {iteration}"
                        ),
                        iteration=iteration,
                    )
                response_text = _extract_text(response.content)
                if not response_text:
                    log.warning(
                        "anthropic_response_empty_text",
                        message=(
                            f"Response had no text blocks (stop_reason={response.stop_reason})"
                        ),
                        stop_reason=response.stop_reason,
                    )
                return AgentRunResult(
                    response_text=response_text,
                    iterations=iteration + 1,
                    stop_reason=response.stop_reason or "unknown",
                    tool_calls=tool_calls,
                )

            # Append the assistant turn with its tool_use blocks
            messages.append({"role": "assistant", "content": response.content})

            # Execute each tool_use and build tool_result content blocks
            tool_results: list[dict] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                content, is_error = await self._mcp.call_tool(block.name, dict(block.input))
                tool_calls.append(
                    ToolCallRecord(
                        name=block.name,
                        input=dict(block.input),
                        result=content,
                        is_error=is_error,
                    )
                )
                tool_result_block: dict[str, Any] = {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": content,
                }
                if is_error:
                    tool_result_block["is_error"] = True
                tool_results.append(tool_result_block)

            messages.append({"role": "user", "content": tool_results})

        raise AgentLoopError(
            f"Agent loop exceeded max_tool_iterations={self._max_iters}"
        )

    async def run_stream(
        self,
        user_message: str,
        thread_id: str,
        run_id: str,
        dynamic_context: DynamicContext | None = None,
    ) -> AsyncIterator[BaseEvent]:
        """Streaming agent loop yielding AG-UI events.

        Wraps the multi-iteration tool-calling loop with AG-UI semantics:
        emits RunStartedEvent at the start, RunFinishedEvent on success,
        RunErrorEvent on failure, and ToolCallResultEvent after each tool
        execution. Per-token text and per-chunk tool args come from the
        AnthropicToAGUIAdapter.
        """
        yield RunStartedEvent(thread_id=thread_id, run_id=run_id)

        try:
            # Build system prompt + tool list inside the try so that any
            # error here is reported as a RunErrorEvent rather than closing
            # the stream silently after RunStartedEvent.
            system_blocks = build_system_prompt_blocks(
                dynamic_context or DynamicContext()
            )
            tools = await self._mcp.list_tools_anthropic_format()
            messages: list[dict[str, Any]] = [
                {"role": "user", "content": user_message}
            ]

            for iteration in range(self._max_iters):
                adapter = AnthropicToAGUIAdapter()

                async with self._anthropic.messages.stream(
                    model=self._model,
                    max_tokens=self._max_tokens,
                    system=system_blocks,
                    tools=tools,
                    tool_choice={"type": "auto"},
                    messages=messages,
                ) as stream:
                    async for event in stream:
                        async for agui_event in adapter.adapt(event):
                            yield agui_event

                    final_message = await stream.get_final_message()

                self._log_usage(final_message.usage, iteration)

                if adapter.stop_reason != "tool_use":
                    if adapter.stop_reason == "max_tokens":
                        log.warning(
                            "anthropic_response_truncated",
                            message=f"Stream truncated at max_tokens on iteration {iteration}",
                            iteration=iteration,
                        )
                    yield RunFinishedEvent(thread_id=thread_id, run_id=run_id)
                    return

                # Append assistant turn from final_message snapshot for next iteration
                messages.append({"role": "assistant", "content": final_message.content})

                # Execute each completed tool_use and emit a ToolCallResultEvent
                tool_results: list[dict] = []
                for tu in adapter.completed_tool_uses:
                    try:
                        args = json.loads(tu.input_json) if tu.input_json else {}
                    except json.JSONDecodeError:
                        args = {}
                        log.warning(
                            "tool_input_json_invalid",
                            message=f"Could not parse tool input JSON for {tu.name}",
                            tool=tu.name,
                            buffer=tu.input_json,
                        )

                    content, is_error = await self._mcp.call_tool(tu.name, args)
                    yield ToolCallResultEvent(
                        message_id=tu.id,
                        tool_call_id=tu.id,
                        content=content,
                    )

                    block: dict[str, Any] = {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": content,
                    }
                    if is_error:
                        block["is_error"] = True
                    tool_results.append(block)

                messages.append({"role": "user", "content": tool_results})

            # Max iterations exceeded
            yield RunErrorEvent(
                message=f"Agent loop exceeded max_tool_iterations={self._max_iters}",
                code="max_iterations",
            )

        except Exception as exc:
            log.exception("agent_stream_failed", message=str(exc))
            yield RunErrorEvent(message=str(exc), code="agent_error")
            raise

    def _log_usage(self, usage: Any, iteration: int) -> None:
        """Log token usage including cache metrics. Cache verification hook."""
        log.info(
            "anthropic_usage",
            message=(
                f"iter={iteration} "
                f"in={usage.input_tokens} out={usage.output_tokens} "
                f"cache_create={getattr(usage, 'cache_creation_input_tokens', 0)} "
                f"cache_read={getattr(usage, 'cache_read_input_tokens', 0)}"
            ),
            iteration=iteration,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_creation_input_tokens=getattr(usage, "cache_creation_input_tokens", 0),
            cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", 0),
        )


def _extract_text(content: list) -> str:
    """Extract concatenated text from a list of content blocks."""
    return "".join(block.text for block in content if getattr(block, "type", None) == "text")
