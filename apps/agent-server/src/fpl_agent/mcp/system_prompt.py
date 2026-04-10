"""FPL agent system prompt builder.

The static prompt lives in `system_prompt_static.md` (sections 1-7).
The dynamic prelude is built per request from current state.

Cache placement: cache_control on the static block (last in the cached
range), nothing on the dynamic prelude. The dynamic block sits AFTER
the cached block so it doesn't break the cache.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_STATIC_PROMPT_FILE = Path(__file__).parent / "system_prompt_static.md"


@dataclass
class DynamicContext:
    """Per-request context injected into the system prompt."""

    current_gameweek_number: int | None = None
    current_gameweek_name: str | None = None
    deadline_iso: str | None = None
    deadline_countdown_human: str | None = None
    user_favorite_team_name: str | None = None


@lru_cache(maxsize=1)
def load_static_prompt() -> str:
    """Read the static system prompt from disk. Cached after first read."""
    return _STATIC_PROMPT_FILE.read_text(encoding="utf-8")


def _format_dynamic_prelude(ctx: DynamicContext) -> str:
    """Format the dynamic state block."""
    lines = ["Current state:"]
    if ctx.current_gameweek_number is not None:
        gw_label = ctx.current_gameweek_name or f"Gameweek {ctx.current_gameweek_number}"
        lines.append(f"- Gameweek: {ctx.current_gameweek_number} ({gw_label})")
    else:
        lines.append("- Gameweek: not set")

    if ctx.deadline_iso:
        countdown = f" ({ctx.deadline_countdown_human})" if ctx.deadline_countdown_human else ""
        lines.append(f"- Deadline: {ctx.deadline_iso}{countdown}")
    else:
        lines.append("- Deadline: not set")

    favorite = ctx.user_favorite_team_name or "not set"
    lines.append(f"- User favorite team: {favorite}")

    return "\n".join(lines)


def build_system_prompt_blocks(dynamic_context: DynamicContext) -> list[dict]:
    """Build the Anthropic API system prompt blocks.

    Returns a list of content blocks:
      [0] static prompt with cache_control (CACHE BREAKPOINT)
      [1] dynamic prelude (no cache)
    """
    return [
        {
            "type": "text",
            "text": load_static_prompt(),
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": _format_dynamic_prelude(dynamic_context),
        },
    ]
