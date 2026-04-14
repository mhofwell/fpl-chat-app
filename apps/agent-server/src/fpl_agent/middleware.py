"""HTTP middleware for the FPL agent server.

- Request-ID propagation: reads X-Request-Id (generates a UUID if absent),
  binds it into structlog's contextvars for the request lifetime so every
  log line in the request carries the same id, and mirrors it back on the
  response. The browser / Next.js can pass the same id to correlate logs
  across services.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import Request

REQUEST_ID_HEADER = "X-Request-Id"


async def request_id_middleware(request: Request, call_next):
    req_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(request_id=req_id)
    try:
        response = await call_next(request)
    finally:
        structlog.contextvars.unbind_contextvars("request_id")
    response.headers[REQUEST_ID_HEADER] = req_id
    return response
