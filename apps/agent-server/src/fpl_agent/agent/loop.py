"""Anthropic agent loop.

M4: implements the agentic loop over Claude Sonnet 4.6 with in-process
    FastMCP tool execution via Client(transport=mcp).
    Prompt caching applied at tool list breakpoint and system prompt breakpoint.
"""

from __future__ import annotations
