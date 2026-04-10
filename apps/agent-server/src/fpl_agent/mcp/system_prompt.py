"""FPL agent system prompt.

M4: static sections (identity, tools, resources, decision principles,
    output format, domain vocabulary, safety constraints) + dynamic
    prelude builder for per-request injection.
"""

from __future__ import annotations
