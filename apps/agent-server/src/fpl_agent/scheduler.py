"""APScheduler integration — stub for M2.

M2: AsyncIOScheduler is wired here with refresh_bootstrap and
    refresh_fixtures jobs, then started from main.py lifespan.

SINGLETON CONSTRAINT (from design doc §5, §11):
  The scheduler runs inside the FastAPI lifespan. Every process that
  boots the agent server starts every job. Phase 1 must run exactly
  one replica (Railway: 1 instance, uvicorn --workers 1).
  All scheduled writes must be idempotent. See design doc §5 and §7.
"""

from __future__ import annotations
