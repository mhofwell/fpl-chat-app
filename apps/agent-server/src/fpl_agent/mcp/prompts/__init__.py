"""MCP prompt registrations.

Importing this package triggers @mcp.prompt decorators so the two
Phase 1 prompts (team_briefing, transfer_debate) are discoverable
via MCP list_prompts / get_prompt.
"""

import fpl_agent.mcp.prompts.briefing  # noqa: F401
import fpl_agent.mcp.prompts.transfer  # noqa: F401
