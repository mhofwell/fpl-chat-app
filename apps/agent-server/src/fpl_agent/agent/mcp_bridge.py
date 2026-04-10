"""In-process MCP client bridge.

Wraps FastMCP `Client(transport=mcp)` so the agent loop can list and
call tools without any network overhead. Tools execute in the same
process as the FastAPI app.
"""

from __future__ import annotations

from fastmcp import Client

from fpl_agent.log_config import get_logger
from fpl_agent.mcp.server import mcp

log = get_logger(__name__)


class McpBridge:
    """Thin bridge between the agent loop and the in-process FastMCP server."""

    def __init__(self) -> None:
        self._client = Client(transport=mcp)

    async def list_tools_anthropic_format(self) -> list[dict]:
        """Return all registered tools in Anthropic API format.

        Applies cache_control to the LAST tool — this is the prompt
        cache breakpoint for the tools list (design doc §5).
        """
        async with self._client as c:
            mcp_tools = await c.list_tools()

        anthropic_tools: list[dict] = [
            {
                "name": t.name,
                "description": t.description or "",
                "input_schema": t.inputSchema,
            }
            for t in mcp_tools
        ]

        if anthropic_tools:
            anthropic_tools[-1]["cache_control"] = {"type": "ephemeral"}

        return anthropic_tools

    async def call_tool(self, name: str, args: dict) -> tuple[str, bool]:
        """Execute a tool by name and return (content, is_error).

        Returns the JSON string from the tool's structured output, ready
        to be passed back to Claude as a tool_result content. If the tool
        raises ToolError, returns (error_message, True) so the loop can
        forward it to Claude as a recoverable tool error.
        """
        try:
            async with self._client as c:
                result = await c.call_tool(name, args)
        except Exception as exc:
            log.warning(
                "tool_call_failed",
                message=f"Tool {name} raised: {exc}",
                tool=name,
                error=str(exc),
            )
            return (f"Tool error: {exc}", True)

        # FastMCP returns CallToolResult with `content` (list of TextContent)
        # and `structured_content` (parsed dict). We use content[0].text since
        # that's the canonical JSON string FastMCP serialized for us.
        if result.is_error:
            text = result.content[0].text if result.content else "Unknown tool error"
            return (text, True)

        if result.content:
            return (result.content[0].text, False)

        return ("", False)
