"""Anthropic agent loop with in-process FastMCP tool execution.

Non-streaming for M4a. Streaming + AG-UI is M5.

The loop:
1. Builds system prompt blocks (static cached + dynamic prelude)
2. Lists tools from FastMCP in Anthropic format (with cache_control on last)
3. Calls anthropic.messages.create with tool_choice=auto
4. If stop_reason == "tool_use", executes tools via mcp_bridge, appends
   tool_use + tool_result to messages, loops
5. Otherwise returns the final text response
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from anthropic import AsyncAnthropic

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
