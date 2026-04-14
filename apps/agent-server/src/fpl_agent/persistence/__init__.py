"""Persistence layer — agent_runs table CRUD + idempotency.

Phase 1 uses only the Supabase Python SDK, scoped to the user's JWT for
RLS enforcement. See migrations/001_agent_runs.sql for the schema.
"""
