-- Migration 001: agent_runs table for durable + idempotent agent runs
--
-- Apply manually via Supabase SQL Editor (Dashboard > SQL Editor).
-- No migration runner in Phase 1 — this file is the source of truth.
--
-- What this creates:
--   - agent_runs table with run_id as primary key (idempotency hook)
--   - composite index on (user_id, created_at DESC) for efficient user history queries
--   - RLS policy that restricts all operations to row owners via auth.uid()
--
-- Design references: docs/design/2026-04-08-fpl-chat-rebuild.md §7

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL CHECK (status IN ('pending', 'streaming', 'completed', 'failed')),
  user_message_content text NOT NULL,
  assistant_message_content text,
  tool_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id_created
  ON agent_runs(user_id, created_at DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_runs_owner ON agent_runs;
CREATE POLICY agent_runs_owner ON agent_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
