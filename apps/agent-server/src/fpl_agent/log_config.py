"""Structured logging configuration using structlog with JSON output.

Log schema (shared with Next.js pino logs, see docs/design §9):
  timestamp  — ISO 8601 UTC
  service    — "fpl-agent-server"
  level      — "info" | "warn" | "error" | "debug"
  request_id — UUID, propagated via contextvars (set by middleware in M5)
  event      — short snake_case event identifier
"""

from __future__ import annotations

import logging
import sys

import structlog


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structlog for JSON output to stdout.

    Call once at application startup, before the first log line.
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _add_service_name,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


def _add_service_name(
    logger: object,
    method: str,
    event_dict: dict,
) -> dict:
    """Inject 'service' field from config into every log record."""
    from fpl_agent.config import settings  # late import to avoid circular

    event_dict.setdefault("service", settings.service_name)
    return event_dict


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Return a structlog logger."""
    return structlog.get_logger(name)
