"""FastAPI authentication dependencies for Supabase JWT verification.

Two dependencies exposed:
  - `get_current_user(request)` — validates the Authorization: Bearer <jwt>
    header and returns the user's UUID (from the `sub` claim).
  - `get_user_supabase_client(request)` — returns a Supabase client whose
    database queries are auth'd as the current user, so RLS policies apply.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, Request
from supabase import Client

import fpl_agent.deps as deps
from fpl_agent.log_config import get_logger

log = get_logger(__name__)


def _extract_bearer_token(request: Request) -> str:
    """Pull the raw token out of Authorization: Bearer <...>, or raise 401."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header"
        )
    return auth_header[len("Bearer ") :]


async def get_current_user(request: Request) -> UUID:
    """FastAPI dependency: validate JWT, return user UUID.

    Raises 401 for:
      - Missing / malformed Authorization header
      - Invalid signature / expired token
      - Missing `sub` claim
    Raises 503 if the JWT verifier hasn't been initialized (server startup bug).
    """
    if deps.jwt_verifier is None:
        raise HTTPException(status_code=503, detail="Auth not initialized")

    token = _extract_bearer_token(request)
    access_token = await deps.jwt_verifier.load_access_token(token)
    if access_token is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    sub = access_token.claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim")

    try:
        return UUID(sub)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid user id in token") from exc


def get_user_supabase_client(request: Request) -> Client:
    """FastAPI dependency: return a Supabase client scoped to the current user.

    Reuses the singleton client created at lifespan startup, attaching the
    user's JWT to its PostgREST calls so RLS policies enforce per-user
    access. The .postgrest.auth() call is idempotent and does no IO —
    safe to invoke per request without leaking connection pools.
    """
    if deps.supabase_client is None:
        raise HTTPException(
            status_code=503, detail="Supabase client not initialized"
        )

    token = _extract_bearer_token(request)
    deps.supabase_client.postgrest.auth(token)
    return deps.supabase_client
