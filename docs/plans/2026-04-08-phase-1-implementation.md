# Phase 1 Implementation Plan — FPL Chat Rebuild

**Date:** 2026-04-08
**Design doc:** [`docs/design/2026-04-08-fpl-chat-rebuild.md`](../design/2026-04-08-fpl-chat-rebuild.md)
**Target:** a working, deployed chat app answering real FPL questions via Python FastMCP + AG-UI, with Anthropic prompt caching verified in production logs.

## Ground rules

1. **Every milestone leaves the tree in a working state.** After any merge to main, `docs/design/*.md` is the source of truth and the deployed system functions.
2. **Do not write code that depends on unfinished code.** If M3 needs something from M2, M2 lands first.
3. **Tests land with the code they test, not in a separate "testing" milestone.** M3 ships with tool tests; M5 ships with adapter tests.
4. **Diff discipline.** Commits are small, atomic, conventional. No `updates` commits.
5. **Stop and ask before any destructive filesystem operation** (`rm -rf`, `git mv` of root dirs). Human confirmation required even if in scope.

## Prerequisites (assumed present before M0)

- Git repo on `main`, clean working tree (after committing the design doc)
- Railway account with billing configured
- Supabase project already running with `profiles`, `user_preferences`, `chats`, `messages` tables and RLS enabled
- Anthropic API key with Claude Sonnet 4.6 + Opus 4.6 access
- Redis add-on on Railway (or local Redis for dev)
- Python 3.11+ installed locally; `uv` package manager preferred over pip/poetry
- Node 20+ installed locally

## Milestone map

```
M0: Repo restructure           ──▶  M1: Python skeletons
                                         │
                                         ▼
                               M2: FPL data layer (Redis cache, APScheduler)
                                         │
                                         ▼
                               M3: Three Phase 1 tools + tests
                                         │
                                         ▼
                               M4: System prompt + Anthropic loop + caching
                                         │
                                         ▼
                               M5: AG-UI adapter + /agent/run endpoint
                                         │
                                         ▼
                               M6: Next.js AG-UI consumer + delete old code
                                         │
                                         ▼
                               M7: Two Phase 1 prompts
                                         │
                                         ▼
                               M8: Observability, deploy, production smoke test
                                         │
                                         ▼
                                    Phase 1 DONE
```

---

## M0 — Repo pivot and fresh git baseline (COMPLETED 2026-04-08)

**Context.** During initial planning, a prior rebuild attempt was discovered at `/Users/bigviking/Documents/github/projects/mhofwell/fpl-chat-app-2/`. It was already in an `apps/` + `packages/` Turborepo layout with a working Next.js chat UI, Supabase auth, and shadcn components — a materially better starting point than the original `fpl-chat-app/`'s `fpl-nextjs-app/` directory. M0 was therefore rewritten as a one-shot pivot from the prior attempt, not an in-place restructure.

**Goal:** arrive at a clean monorepo (`apps/web/`, `apps/agent-server/` to come in M1, `packages/` reserved for Phase 4) with:
- The Next.js shell from the prior attempt as `apps/web/`
- All TypeScript Express MCP server code removed
- All Bun / Turborepo scaffolding removed
- Legacy shared `@fpl/types` and `@fpl/redis` workspace packages inlined or deleted
- Docs organized into `design/`, `plans/`, `standards/`, `vision/`, `reference/` subdirectories
- Design doc and Phase 1 plan (this file) present in the new tree
- Fresh `git init`, single initial commit, no remote configured yet

**Explicit destructive targets (no generic wildcards).** Every `rm` below is an exact path. Nothing like `rm -rf packages/` without specifying what's inside.

**Tasks:**

1. **Backup both directories** (safety net; excludes `node_modules/`, `.next/`, `.turbo/`):
   - `rsync -a --exclude node_modules --exclude .next --exclude .turbo fpl-chat-app/ fpl-chat-app-backup-20260408/`
   - `rsync -a --exclude node_modules --exclude .next --exclude .turbo fpl-chat-app-2/ fpl-chat-app-2-backup-20260408/`
   - Verify both backups contain the design doc, plan doc, git history, and apps/ directories.

2. **Inspect the prior attempt's internals** before any deletion. Specifically read:
   - `fpl-chat-app-2/package.json` — root Turborepo config (confirmed Bun + Turborepo, workspaces `apps/*`, `packages/*`, `types`)
   - `fpl-chat-app-2/tsconfig.base.json` — workspace base TypeScript config
   - `fpl-chat-app-2/apps/next-client/package.json` — workspace deps (confirmed `@fpl/redis` declared but unused, `@fpl/types` imported in 2 files)
   - `fpl-chat-app-2/apps/next-client/tsconfig.json` — extends the base config
   - `fpl-chat-app-2/types/index.ts` — contains 237 lines of shared types, only `ErrorType`, `ErrorResponse`, `ToolCall` are actually imported by next-client
   - `fpl-chat-app-2/.claude/` — contains only an empty `commands/` dir and a 130-byte `settings.local.json`
   - `fpl-chat-app-2/examples/` — legacy reference implementations, not needed for rebuild
   - `fpl-chat-app-2/docs/` — contains reusable `coding-standards.md`, `naming-conventions.md`, `agent-operating-guidelines.md`, `differentiators.md`, plus reference material

3. **Execute the pivot** — absolute paths throughout, no `cd`:
   - `rm -rf /Users/bigviking/Documents/github/projects/mhofwell/fpl-chat-app` (backup verified in step 1)
   - `mv /Users/bigviking/Documents/github/projects/mhofwell/fpl-chat-app-2 /Users/bigviking/Documents/github/projects/mhofwell/fpl-chat-app`

4. **Clean up legacy in the new fpl-chat-app/** — every target is explicit:
   - `rm -rf .git apps/fpl-mcp-server packages/redis types examples .turbo node_modules dump.rdb`
   - `rm bun.lock bunfig.toml tsconfig.base.json turbo.json package.json`
   - The `packages/` directory remains empty (reserved for Phase 4 MCP extraction); it is not deleted.

5. **Rename and inline**:
   - `mv apps/next-client apps/web`
   - `rm -rf apps/web/node_modules` (will reinstall fresh in M0 step 8)
   - Create `apps/web/lib/types/fpl-types.ts` containing `ErrorType`, `ErrorResponse`, `ToolCall` inlined from the deleted `@fpl/types` package
   - Update `apps/web/lib/claude/error.ts` import from `@fpl/types` → `@/lib/types/fpl-types`
   - Update `apps/web/app/api/chat/stream/route.ts` import from `@fpl/types` → `@/lib/types/fpl-types`
   - Rewrite `apps/web/package.json`: drop `@fpl/redis` and `@fpl/types` workspace deps, rename package to `fpl-chat-web`, no scope
   - Rewrite `apps/web/tsconfig.json` to be standalone (no `extends` from deleted base config)

6. **Reorganize docs into subdirectories**:
   - `mkdir -p docs/standards docs/vision docs/reference docs/plans docs/design`
   - `mv docs/coding-standards.md docs/standards/`
   - `mv docs/naming-conventions.md docs/standards/`
   - `mv docs/agent-operating-guidelines.md docs/standards/`
   - `mv docs/differentiators.md docs/vision/`
   - `mv docs/product-overview.md docs/reference/`
   - `mv docs/progress.md docs/reference/progress-prior-attempt.md` (renamed for clarity — it's the prior attempt's status, not ours)
   - `mv docs/fpl-api-schema.md docs/reference/`
   - `mv docs/railway-deployment.md docs/reference/`
   - `rm -rf docs/mcp docs/design/ui.png` (MCP learning notes superseded by FastMCP docs; ui.png is a loose screenshot)

7. **Copy design doc + plan doc from the backup**:
   - `cp /.../fpl-chat-app-backup-20260408/docs/design/2026-04-08-fpl-chat-rebuild.md docs/design/`
   - `cp /.../fpl-chat-app-backup-20260408/docs/plans/2026-04-08-phase-1-implementation.md docs/plans/`
   - Then apply the design + plan updates documented in M0 steps 9-10.

8. **Verify the Next.js shell still builds** after the inlining and package.json changes:
   - `cd apps/web && bun install`
   - `cd apps/web && bun run build`
   - Must succeed. If `@fpl/*` imports remain anywhere, grep and fix.

9. **Apply design doc updates** (pre-first-commit, so the initial commit has the corrected version):
   - §1 Goals: add "Primary use case: pre-deadline decision engine"
   - §1 Goals: add chat persistence durability as a top-level goal
   - §3 Tools: sectioned `PlayerProfile` shape (basic/scoring/form/ownership/playing) — lifted from the prior attempt's `progress.md` Stage 1.5 work
   - §3 Tools: `PlayerSearchResult` with `{exact, suggestions}` for ambiguous name matches
   - §3 Tools: explicit NFKD Unicode-safe normalize function for fuzzy matching
   - §5 Caching: scheduler singleton constraint note + idempotent-writes requirement
   - §7 Data layer: new `chat_runs` table schema with `run_id` as idempotency key, plus the durability protocol (insert pending row before loop, update during streaming, finalize on completion)
   - §7 Data layer: APScheduler job table updated to show UPSERT on every write
   - §11 Risks: scheduler singleton as risk #1 (from Codex review), stale streaming runs as risk #2

10. **Apply plan doc updates** (this file):
    - M0: this rewrite (pivot documentation)
    - M1: single-package structure (collapse `apps/agent-server/` into `apps/agent-server/src/fpl_agent/mcp/`; `packages/` stays empty until Phase 4)
    - M2: explicit UPSERT notes on every scheduled write
    - M4: `chat_runs` pending-row insertion BEFORE agent loop, durability checkpoints during streaming, `run_id` idempotency on all writes
    - Risks table: APScheduler multi-instance risk + mitigation

11. **Fresh `git init` and initial commit**:
    - `git init`
    - `git add .`
    - `git commit -m "chore: initial commit — Phase 1 rebuild baseline"`
    - No remote configured. Remote strategy deferred.

**Definition of done:**
- `fpl-chat-app/` is the renamed prior attempt with old legacy removed
- `apps/web/` exists (renamed from `apps/next-client/`), builds successfully, runs locally on `bun run dev`
- `packages/` directory exists but is empty (reserved)
- No imports of `@fpl/types` or `@fpl/redis` remain in `apps/web/` source
- Docs organized into `design/`, `plans/`, `standards/`, `vision/`, `reference/` subdirectories
- Design doc + plan doc updated with Codex findings + prior-attempt insights
- Fresh git history with exactly one commit
- Both backup directories (`fpl-chat-app-backup-20260408/`, `fpl-chat-app-2-backup-20260408/`) still present as safety net

---

## M1 — Python skeletons (package + agent server)

**Goal:** create the Python project structure with runnable-but-empty scaffolding for both the MCP package and the agent server.

**Tasks:**

**Phase 1 uses a single Python package: `apps/agent-server/`.** The MCP server (tools, prompts, resources, data layer) lives inside `apps/agent-server/src/fpl_agent/mcp/` as a module, NOT as a separate publishable package. Phase 4 will extract `apps/agent-server/` for PyPI publishing via `git mv` when the need to ship it standalone becomes real. Defer the packaging cost until it has a concrete consumer.

1. Create `apps/agent-server/`:
   ```
   apps/agent-server/
   ├── pyproject.toml              # the only Python package in Phase 1
   ├── Dockerfile
   ├── railway.toml
   ├── .python-version             # 3.11
   ├── src/
   │   └── fpl_agent/
   │       ├── __init__.py
   │       ├── main.py             # FastAPI app + lifespan
   │       ├── config.py           # env vars via pydantic-settings
   │       ├── logging.py          # structlog setup, request ID binding
   │       ├── scheduler.py        # APScheduler (M2)
   │       ├── mcp/                # the MCP server lives here
   │       │   ├── __init__.py
   │       │   ├── server.py       # mcp = FastMCP("fpl")
   │       │   ├── models.py       # Pydantic models — empty for now
   │       │   ├── system_prompt.py  # empty for now (M4)
   │       │   ├── tools/          # empty, M3
   │       │   │   └── __init__.py
   │       │   ├── prompts/        # empty, M7
   │       │   │   └── __init__.py
   │       │   └── data/           # empty, M2
   │       │       └── __init__.py
   │       ├── agent/              # empty modules, M4
   │       │   ├── __init__.py
   │       │   ├── loop.py
   │       │   └── mcp_bridge.py
   │       ├── adapters/           # empty, M5
   │       │   ├── __init__.py
   │       │   └── anthropic_to_agui.py
   │       └── api/                # empty modules, filled in M4/M5/M7
   │           ├── __init__.py
   │           ├── agent.py
   │           ├── mcp.py
   │           └── prompts.py
   └── tests/
       ├── __init__.py
       ├── conftest.py             # shared pytest fixtures
       ├── mcp/
       │   ├── tools/              # M3
       │   └── prompts/            # M7
       └── agent/                  # M4/M5
   ```
   `pyproject.toml` dependencies: `fastmcp>=3.2`, `fastapi>=0.110`, `uvicorn[standard]`, `anthropic>=0.39`, `ag-ui-protocol`, `apscheduler>=3.10`, `pydantic>=2`, `pydantic-settings`, `httpx>=0.27`, `redis>=5`, `structlog>=24`, `prometheus-client`, `supabase>=2`. Dev deps: `pytest`, `pytest-asyncio`, `inline-snapshot`, `dirty-equals`, `fakeredis`.

2. Root-level tooling:
   - `.python-version` at the repo root pinning 3.11 (used by both uv and asdf)
   - No root `pyproject.toml`, no uv workspace config (Phase 1 has exactly one Python package)
   - `packages/` directory stays empty at the repo root — reserved for Phase 4 extraction

3. Implement `apps/agent-server/src/fpl_agent/main.py`:
   - FastAPI instance
   - `GET /health` returns `{"status": "ok", "service": "fpl-agent-server"}`
   - Lifespan context that's currently a no-op (scheduler wiring comes in M2)
   - Structured logging initialized via `logging.py`

4. Implement `apps/agent-server/src/fpl_agent/mcp/server.py`:
   - `mcp = FastMCP("fpl")` — nothing else yet
   - `__init__.py` re-exports `mcp`

5. Verify:
   ```bash
   cd apps/agent-server && uv sync
   uv run uvicorn fpl_agent.main:app --port 8000
   curl http://localhost:8000/health   # returns {"status":"ok","service":"fpl-agent-server"}
   uv run pytest                         # zero tests, exit 0
   uv run python -c "from fpl_agent.mcp.server import mcp; print(mcp)"
   ```

6. Dockerfile sanity check: `docker build apps/agent-server/` must succeed. Actual deploy happens in M8.

**Definition of done:**
- `cd apps/agent-server && uv sync` installs cleanly
- Agent server runs locally and responds on `/health`
- `from fpl_agent.mcp.server import mcp` works
- Dockerfile builds locally
- Structured logging outputs JSON to stdout

---

## M2 — FPL data layer (Redis cache + APScheduler refresher)

**Goal:** fetch FPL API data into Redis reliably, with versioned cache keys and a scheduled refresher. Nothing is exposed to the model yet; this is pure plumbing.

**Load-bearing constraint (from Codex adversarial review):** the APScheduler runs inside the FastAPI lifespan, so every process that boots the agent server will start the refresh jobs. Phase 1 runs exactly one replica (`uvicorn --workers 1`, Railway service pinned to 1 instance). Every write path in M2 (and M3, M4, M7) MUST be idempotent so even accidental double-firing is safe:
- Redis writes use `SET` (overwrites are fine).
- Postgres writes — when they come in Phase 2b — use `INSERT ... ON CONFLICT (...) DO UPDATE`, NEVER a plain `INSERT`.
- External state changes (e.g. publishing AG-UI `StateDelta` events) are idempotent by protocol design (JSON Patch applied against the current state).

This constraint is documented in the design doc §5 and §11. Any code review that introduces a non-idempotent scheduled write must fail the review.

**Tasks:**

1. `apps/agent-server/src/fpl_agent/mcp/data/fpl_client.py`:
   - `httpx.AsyncClient` with 10s timeout, 3 retries with exponential backoff
   - Methods: `fetch_bootstrap()`, `fetch_fixtures()`, `fetch_element_summary(player_id)`, `fetch_live_gameweek(gw_id)`, `fetch_set_piece_notes()`
   - Each returns raw JSON; no transformation
   - Logs every request with URL + duration + status

2. `apps/agent-server/src/fpl_agent/mcp/data/cache.py`:
   - `RedisCache` class wrapping `redis.asyncio`
   - Methods: `get_json(key)`, `set_json(key, value, ttl_seconds)`, `delete(key)`, `exists(key)`
   - Keys use `v1:` prefix (e.g., `fpl:v1:bootstrap`) so a schema change can be rolled out by bumping the version

3. `apps/agent-server/src/fpl_agent/mcp/data/bootstrap.py`:
   - Cache-aside function `get_bootstrap(cache, client) -> dict`:
     - Redis hit → return
     - Redis miss → fetch from FPL API → write Redis with 1h TTL → return
   - Returns a typed Pydantic model, not raw dict (parse at cache boundary, not at tool boundary)
   - TTL is 1h normally; match-day detection is NOT in Phase 1 — static 1h is fine

4. `apps/agent-server/src/fpl_agent/mcp/data/fixtures.py`:
   - Same pattern: `get_all_fixtures(cache, client) -> list[RawFixture]`
   - Cache key: `fpl:v1:fixtures:all`
   - TTL 1h

5. `apps/agent-server/src/fpl_agent/scheduler.py`:
   - APScheduler `AsyncIOScheduler` instance
   - Two jobs:
     - `refresh_bootstrap` — every hour, calls `get_bootstrap()` with `force=True` (cache bust)
     - `refresh_fixtures` — every hour, calls `get_all_fixtures()` with `force=True`
   - Started from FastAPI lifespan; stopped on shutdown

6. Wire scheduler into `apps/agent-server/src/fpl_agent/main.py` lifespan:
   ```python
   @asynccontextmanager
   async def lifespan(app: FastAPI):
       cache = RedisCache(url=settings.redis_url)
       client = FplClient()
       await get_bootstrap(cache, client)         # prime cache on startup
       await get_all_fixtures(cache, client)
       scheduler = start_scheduler(cache, client)
       yield
       scheduler.shutdown()
       await client.aclose()
   ```

7. Tests (in `apps/agent-server/tests/mcp/`):
   - `test_fpl_client.py` — mock httpx, verify retry behavior, verify URL construction
   - `test_cache.py` — fakeredis or real Redis, verify get/set/delete/TTL
   - `test_bootstrap.py` — cache hit path, cache miss path, fetch-on-startup path
   - Coverage target: 80%+ on the data layer

8. Add `FPL_API_BASE`, `REDIS_URL`, `LOG_LEVEL` to `config.py`; document in README

**Definition of done:**
- Agent server starts, logs "bootstrap primed" and "fixtures primed", APScheduler reports jobs scheduled
- `redis-cli GET fpl:v1:bootstrap` returns JSON
- Tests pass locally
- Restarting the agent server re-primes the cache in under 2s with a warm Redis

---

## M3 — Three Phase 1 tools

**Goal:** implement `get_players`, `get_teams`, `get_fixtures` with full signatures, register them with FastMCP, and verify via in-process client tests.

**Tasks:**

1. `apps/agent-server/src/fpl_agent/mcp/models.py`:
   - `PlayerProfile` — mirrors FPL `elements[i]` with cleaned field names
   - `TeamProfile` — mirrors FPL `teams[i]`
   - `TeamRef` — small reference type `{id, name, short_name}`
   - `Fixture` — the dual-shape model from §3 of the design doc (normalized vs neutral)
   - `Meta` — `{source, as_of, cache_age_seconds}`
   - `ToolResponse[T]` — generic envelope

2. `apps/agent-server/src/fpl_agent/mcp/tools/players.py`:
   - `get_players(...)` with every parameter from the design doc
   - Fuzzy match: exact (case-insensitive on `web_name`, `first_name + " " + second_name`, `second_name`) → substring → token-based
   - Sort logic uses `getattr` on the cleaned field names
   - `include_history=True` path calls `fetch_element_summary(id)` for each result (acknowledge this is expensive; document it)
   - Returns `ToolResponse[PlayerProfile]`
   - Register with `@mcp.tool` decorator

3. `apps/agent-server/src/fpl_agent/mcp/tools/teams.py`:
   - `get_teams(...)` with every parameter
   - Register with `@mcp.tool`

4. `apps/agent-server/src/fpl_agent/mcp/tools/fixtures.py`:
   - `get_fixtures(...)` with the scope/limit/team_id parameters
   - Normalization function: `_normalize_fixture_for_team(raw_fixture, team_id) -> Fixture` — produces the `venue`/`opponent`/`result`/`difficulty` shape
   - Neutral shape function: `_neutral_fixture(raw_fixture) -> Fixture` — produces the `home_team`/`away_team`/`home_score`/etc. shape
   - `scope="past"` filters to `finished=true`, reverse-sorts by `kickoff_time`, applies limit
   - `scope="upcoming"` filters to `finished=false`, sorts by `kickoff_time`, applies limit
   - Register with `@mcp.tool`

5. `apps/agent-server/src/fpl_agent/mcp/tools/__init__.py`:
   - Imports all three modules so the decorators fire and the tools register on the shared `mcp` instance

6. Tests in `apps/agent-server/tests/mcp/tools/`:
   - `conftest.py` — fixture that loads `tests/fixtures/bootstrap_frozen.json` (committed to repo), writes it to a fakeredis instance, yields a FastMCP `Client(transport=mcp)`
   - `test_get_players.py` — see examples in design doc §8
     - Fuzzy match (3 cases)
     - Bulk by ids (2 cases)
     - Position filter
     - Sort by form/points/cost
     - Limit enforcement
     - Not-found raises `ToolError`
   - `test_get_teams.py`:
     - Fuzzy name match
     - Sort by position (asc)
     - Sort by strength
     - Not-found raises `ToolError`
   - `test_get_fixtures.py`:
     - No team filter → neutral shape returned
     - With team filter → normalized shape with `venue`, `opponent`, `result` populated
     - `scope="past"` returns only finished, reverse-chronological
     - `scope="upcoming"` returns only unfinished, chronological
     - Limit enforcement

7. Commit `tests/fixtures/bootstrap_frozen.json` — a real FPL API response snapshot (from sometime in the current season) used as the deterministic source for tests. **Do NOT commit the full response** if it's multi-megabyte — trim to a representative subset (first 50 players, all 20 teams, first 10 gameweeks, first 30 fixtures).

**Definition of done:**
- All three tools implemented and registered
- `uv run pytest apps/agent-server` passes with all new tests green
- `uv run python -c "from fpl_agent.mcp.server import mcp; print(mcp.tools)"` lists 3 tools
- An in-process test can call `get_players(name="Haaland")` and get a result with the `ToolResponse` envelope intact

---

## M4 — System prompt + Anthropic agent loop + prompt caching

**Goal:** a working agent loop that takes user messages + history, calls Claude Sonnet 4.6 with tools, executes tool calls in-process against the FastMCP server, and produces a complete response. Caching verified in logs.

**Tasks:**

1. `apps/agent-server/src/fpl_agent/mcp/system_prompt.py`:
   - The static system prompt as a Python module-level constant, structured across all 7 sections from §4 of the design doc
   - Export function `build_system_prompt_blocks(dynamic_context: DynamicContext) -> list[dict]` that returns the list of content blocks ready for the Anthropic API — one cached block for static content + one non-cached block for dynamic prelude

2. `apps/agent-server/src/fpl_agent/mcp/system_prompt_static.md`:
   - The actual text of sections 1–7, bundled as package data
   - First draft written in this milestone; will be iterated on in Phase 3

3. `apps/agent-server/src/fpl_agent/agent/loop.py`:
   - `AgentLoop` class taking `anthropic_client`, `mcp_client`, `model="claude-sonnet-4-6"`, `max_tool_iterations=5`
   - `run(messages, user_context) -> AgentRunResult`:
     - Build system blocks via `build_system_prompt_blocks`
     - Get tool list via `mcp_client.list_tools()`, convert to Anthropic format
     - Apply `cache_control: {"type": "ephemeral", "ttl": "1h"}` to last tool
     - Apply `cache_control` to last system block
     - Apply automatic caching to messages list
     - Call `anthropic.messages.create(...)` non-streaming for now (streaming is M5)
     - If response has `stop_reason == "tool_use"`:
       - Execute each tool_use via `mcp_client.call_tool(name, args)`
       - Append tool_use message + tool_result message to history
       - Loop back
     - Else: return final response
   - Log every iteration with `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`, `output_tokens` — this is the cache verification hook

4. `apps/agent-server/src/fpl_agent/agent/mcp_bridge.py`:
   - Thin wrapper that instantiates an in-process FastMCP `Client(transport=mcp)` against the shared `mcp` instance from `fpl_agent.mcp.server`
   - Exposes `list_tools()` and `call_tool(name, args)` async methods

5. `apps/agent-server/src/fpl_agent/api/chat.py`:
   - `POST /agent/chat/test` — non-streaming test endpoint (will be replaced by `/agent/run` in M5)
   - Takes `{"message": "..."}`, returns complete response as JSON
   - This exists so M4 can be validated without needing M5's AG-UI machinery

6. Supabase JWT verification via FastMCP's `JWTVerifier`:
   - Configure with Supabase JWKS URL from env
   - Apply as FastAPI dependency on `/agent/chat/test`
   - Reject unauthenticated requests with 401

7. **Durable, idempotent chat persistence** (addresses Codex review finding #2):
   - Supabase migration: add `chat_runs` table per design doc §7
     ```sql
     CREATE TABLE chat_runs (
       run_id uuid PRIMARY KEY,
       chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
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
     CREATE INDEX idx_chat_runs_chat_id ON chat_runs(chat_id);
     CREATE INDEX idx_chat_runs_user_id_created ON chat_runs(user_id, created_at DESC);
     ALTER TABLE chat_runs ENABLE ROW LEVEL SECURITY;
     CREATE POLICY chat_runs_owner ON chat_runs FOR ALL TO authenticated USING (user_id = auth.uid());
     ALTER TABLE messages ADD COLUMN run_id uuid REFERENCES chat_runs(run_id);
     ```
   - `apps/agent-server/src/fpl_agent/persistence/runs.py` — module with:
     - `create_run_if_not_exists(run_id, chat_id, user_id, user_message, supabase_client) -> RunState` — performs the `INSERT ... ON CONFLICT (run_id) DO NOTHING RETURNING *`. Returns either the fresh row (caller owns the run) or the existing row (caller is a retry).
     - `mark_run_streaming(run_id, supabase_client)` — `UPDATE chat_runs SET status='streaming' WHERE run_id=$1 AND status='pending'`
     - `append_tool_event(run_id, event, supabase_client)` — batched append to `tool_events` JSONB. Batched every 500ms or on tool boundary (whichever comes first) to avoid per-chunk DB chatter.
     - `finalize_run(run_id, assistant_content, supabase_client)` — `UPDATE chat_runs SET status='completed', assistant_message_content=$1, completed_at=now() WHERE run_id=$2`; then insert a corresponding `messages` row with `role='assistant'`, `run_id=$2`, `content=$1`, and final `tool_calls`/`tool_results` JSONB for eval replay.
     - `fail_run(run_id, error, supabase_client)` — `UPDATE chat_runs SET status='failed', error=$err`
   - Wire into the agent loop entry point:
     - `create_run_if_not_exists` BEFORE the first Anthropic call.
     - If the returned row has `status='completed'`, short-circuit: replay the stored `assistant_message_content` + `tool_events` as the response (non-streaming for M4; M5 replays as AG-UI events).
     - If the returned row has `status='streaming'`, return a "run already in progress" 409 response (naive handling for M4; Phase 2+ can add wait-and-tail).
     - If the returned row has `status='failed'`, replay the error.
     - If the insert happened, proceed to `mark_run_streaming` → Anthropic call → `append_tool_event` during the loop → `finalize_run` at the end.
   - Use the user's JWT (forwarded via Supabase Python client) so RLS enforces ownership on every write.

8. Tests:
   - `test_agent_loop.py` — mock the Anthropic client, verify tool_use → tool execution → tool_result roundtrip
   - `test_cache_headers.py` — assert that the cache_control block placement is correct in the request payload
   - `test_runs_idempotency.py` — integration test: call the endpoint twice with the same `run_id`, assert the second call returns the stored result without re-invoking Anthropic. Also: call with a fresh `run_id`, kill the process mid-run, restart, call again with the same `run_id`, assert the stale `streaming` state is handled correctly.
   - `test_chat_persistence.py` — integration test against a real Supabase test project verifying the `chat_runs` row + `messages` row are written with the correct `user_id` under RLS

9. Manual verification with real Anthropic API:
   - `curl -H "Authorization: Bearer <jwt>" -d '{"run_id":"...","chat_id":"...","message":"How is Arsenal doing?"}' http://localhost:8000/agent/chat/test`
   - Check logs: `cache_creation_input_tokens > 2048` on first call
   - Second call within 5 minutes: `cache_read_input_tokens > 0`, `cache_creation_input_tokens == 0`
   - **If caching isn't working, stop and debug before M5.** This is the single most important validation step in Phase 1.
   - Retry the same request with the same `run_id` → must return the stored result WITHOUT a new Anthropic call (verify by checking the cache metrics don't increment)

**Definition of done:**
- A real question hits the test endpoint and comes back with a grounded answer
- Cache hits confirmed in logs on the second request
- `chat_runs` row created in `pending` before the loop, updated to `streaming` during, and `completed` after
- `messages` row inserted with `run_id` foreign key pointing at the run
- Retry with the same `run_id` returns the stored result, NOT a new LLM call
- RLS verified: a request with user A's JWT cannot read/write user B's runs or messages

---

## M5 — AG-UI adapter + `/agent/run` SSE endpoint

**Goal:** turn the agent loop's output into a streamed sequence of AG-UI events over SSE. This replaces the M4 non-streaming test endpoint.

**Tasks:**

1. `apps/agent-server/src/fpl_agent/adapters/anthropic_to_agui.py`:
   - `async def stream_agent_run(loop, messages, thread_id, run_id) -> AsyncIterator[AGUIEvent]`
   - Yields the full event sequence per the mapping table in design doc §6:
     - `RunStarted` → `TextMessageStart/Content/End` → `ToolCallStart/Args/End` → `ToolCallResult` → loop back → `RunFinished`
   - On exception: yield `RunError` and re-raise
   - Handles the case where Claude emits multiple tool calls in a single assistant turn (the spec allows parallel tool_use blocks)

2. Switch the Anthropic agent loop to streaming:
   - `loop.run_streaming(messages, user_context) -> AsyncIterator[StreamingEvent]` yielding raw Anthropic streaming events
   - Tool execution still happens in-process; after tool_use block completes, loop yields a `ToolCallResult` event and continues streaming the next Claude call

3. `apps/agent-server/src/fpl_agent/api/agent.py`:
   - `POST /agent/run` — accepts `RunAgentInput` (AG-UI Python SDK typed model): `{thread_id, run_id, messages, tools: [], state: {}}`
   - Returns `StreamingResponse` with `media_type="text/event-stream"`
   - Inside: calls `stream_agent_run()`, encodes each event via `ag_ui.encoder.EventEncoder`, yields the encoded bytes
   - JWT auth via the same FastAPI dependency from M4

4. Delete the M4 test endpoint — `/agent/chat/test` is gone now

5. Tests:
   - `test_anthropic_to_agui.py` — fake Anthropic streaming response (list of chunks), verify event sequence matches expectation
   - `test_agent_run_endpoint.py` — TestClient hits `/agent/run`, parses SSE output, verifies event sequence shape
   - `test_auth.py` — unauthenticated request → 401; valid JWT → 200

6. Manual verification:
   ```bash
   curl -N -H "Authorization: Bearer <jwt>" \
        -H "Content-Type: application/json" \
        -d '{"thread_id":"t1","run_id":"r1","messages":[{"role":"user","content":"How is Arsenal doing?"}],"tools":[],"state":{}}' \
        http://localhost:8000/agent/run
   ```
   - Should stream a sequence of `data: {...}` lines, each a valid AG-UI event JSON
   - Final event is `RunFinished`

**Definition of done:**
- SSE endpoint responds with well-formed AG-UI events
- Adapter tests pass with a fake Anthropic client
- A manual curl returns the full event sequence for a real question
- Cache hit/miss metrics still working — M4's caching wasn't broken by the streaming switch

---

## M6 — Next.js AG-UI consumer + delete old code

**Goal:** the Next.js frontend calls `/agent/run` on the Python backend and renders AG-UI events in the chat UI. Old TypeScript streaming code is deleted.

**Tasks:**

1. In `apps/web/`: `bun add @ag-ui/client @ag-ui/core`

2. `apps/web/lib/agent-client.ts`:
   - Export a `createAgentClient(accessToken: string)` factory that returns an `HttpAgent` configured with `POST /agent/run` URL and `Authorization: Bearer <token>` header
   - Reads backend URL from `NEXT_PUBLIC_AGENT_SERVER_URL` env var

3. `apps/web/lib/agent-subscriber.ts`:
   - Custom `AgentSubscriber` subclass with handlers for:
     - `onRunStarted` → reset UI state, show "thinking"
     - `onTextMessageContent` → append delta to current assistant message
     - `onToolCallStart` → show tool indicator ("Looking up player data...")
     - `onToolCallArgs` → accumulate tool args for potential display
     - `onToolCallEnd` → update tool indicator to "Completed"
     - `onToolCallResult` → could display tool result summary (optional)
     - `onRunFinished` → finalize message, scroll to bottom
     - `onRunError` → show error in UI
     - `onStateDelta` → ignored in Phase 1 (relevant in Phase 2b)

4. Rewrite `apps/web/components/chat/public-chat-ui.tsx`:
   - Replace current streaming logic with `agentClient.runAgent({...}, new FplAgentSubscriber(...))`
   - UI components stay the same visually — only the streaming plumbing changes
   - Add a tool indicator component that shows during tool calls

5. Delete the following files and any imports of them:
   - `apps/web/lib/stream-client.ts`
   - `apps/web/app/api/chat/stream/route.ts`
   - `apps/web/app/actions/chat-stream.ts`
   - `apps/web/lib/mcp/` (the entire old MCP client directory)
   - `apps/web/app/actions/mcp-tools.ts`
   - `apps/web/lib/fpl-api/` (data fetching now happens in Python backend)
   - `apps/web/app/api/fpl/` and `apps/web/app/api/cron/` and `apps/web/app/api/queue/`
   - Anything else that was part of the old streaming path — grep for `streamChatResponse` and `getMcpClient` to find references

6. Chat persistence from the frontend:
   - After `onRunFinished`, POST the user message + assistant message to a thin Next.js route `POST /api/chats/:chatId/messages` that writes to Supabase
   - Alternative: have Python write directly (as in M4). Pick one and document.
   - **Decision for Phase 1:** Python writes. Next.js doesn't need a chat-message API. Remove Next.js-side write path.

7. Environment variables:
   - `NEXT_PUBLIC_AGENT_SERVER_URL` — the public URL of the Python backend
   - Document in `apps/web/README.md`

8. Tests:
   - Component test for the chat UI with a mocked `HttpAgent` — verify text streaming, tool indicator, error handling
   - E2E test is deferred to M8 (full production smoke test)

**Definition of done:**
- Local dev: Next.js + Python backend both running, browser chat works end-to-end against a real Anthropic call
- All files listed in step 5 are deleted from `apps/web/`
- No imports of old streaming code remain anywhere
- Chat message written to Supabase after each successful turn

---

## M7 — Phase 1 prompts (`/team_briefing`, `/transfer_debate`)

**Goal:** both prompts implemented, registered with FastMCP, accessible via slash commands in the chat UI.

**Tasks:**

1. `apps/agent-server/src/fpl_agent/mcp/prompts/team_briefing.py`:
   - `@mcp.prompt` decorated function `team_briefing(name_or_id: str) -> list[Message]`
   - Server-side parallel data fetch:
     - `get_teams(name=name_or_id)` → resolve team
     - `get_fixtures(team_id=team.id, scope="past", limit=5)` → past results
     - `get_fixtures(team_id=team.id, scope="upcoming", limit=5)` → upcoming fixtures
     - `get_players(team_id=team.id, sort_by="form", limit=5)` → in-form players
   - Returns a `[Message(...)]` list with a single user message containing:
     - Prose framing (the question and the expected format)
     - Four embedded resource blocks (`content.type="resource"`) for each dataset
   - Error handling: if team not found, return a single message explaining the resolution failure (prompts don't raise; they return rendered prompts)

2. `apps/agent-server/src/fpl_agent/mcp/prompts/transfer_debate.py`:
   - `@mcp.prompt` function `transfer_debate(out_player: str, in_player: str) -> list[Message]`
   - Server-side parallel data fetch for both players + both teams' fixtures
   - Returns a single user message with four embedded resource blocks

3. `apps/agent-server/src/fpl_agent/mcp/prompts/__init__.py`:
   - Import both modules so decorators fire

4. Next.js slash-command menu:
   - New component `apps/web/components/chat/slash-menu.tsx`
   - On `/` keystroke, shows a dropdown listing available prompts (fetched from the Python backend via a new endpoint — see step 5)
   - User selects prompt → UI prompts for arguments inline
   - On submit: calls the backend to get the rendered prompt messages, then sends them to `/agent/run` as the user messages

5. `apps/agent-server/src/fpl_agent/api/prompts.py`:
   - `GET /prompts` — returns the list of prompt names + argument schemas from the in-process FastMCP client
   - `POST /prompts/:name` — takes arguments, calls `mcp_client.get_prompt(name, args)`, returns the rendered messages
   - Both JWT-protected

6. Tests:
   - `test_team_briefing.py` — in-process prompt render test, verify the message structure contains 4 embedded resource blocks
   - `test_transfer_debate.py` — same pattern
   - Component test for the slash menu

7. Manual verification:
   - In the chat UI, type `/team_briefing Arsenal`
   - UI shows a modal or inline form for the `name_or_id` argument (already filled)
   - On submit, a rendered user message with embedded data appears in the chat
   - Claude responds with a structured briefing matching the enforced format

**Definition of done:**
- Both prompts registered and visible via `GET /prompts`
- Typing `/team_briefing Arsenal` produces a complete team briefing response
- Typing `/transfer_debate Salah Saka` produces a complete transfer verdict
- Response format matches the enforced format in each prompt's system text

---

## M8 — Observability, deployment, production smoke test

**Goal:** everything you need to operate this in production. Deploy to Railway. Verify with real FPL questions.

**Tasks:**

1. Observability endpoints on the Python agent server:
   - `GET /health` — already exists from M1 (liveness)
   - `GET /ready` — checks Redis connectivity, Supabase connectivity, APScheduler running, FastMCP registry loaded. 200 if all good; 503 if any fails.
   - `GET /metrics` — prometheus_client `generate_latest()` output:
     - `agent_requests_total{status}`
     - `agent_request_duration_seconds` (histogram)
     - `tool_calls_total{tool_name, outcome}`
     - `tool_call_duration_seconds{tool_name}` (histogram)
     - `fpl_api_requests_total{endpoint, status}`
     - `redis_cache_operations_total{operation, outcome}`
     - `anthropic_cache_read_tokens_total`
     - `anthropic_cache_write_tokens_total`
     - `anthropic_base_input_tokens_total`
     - `anthropic_output_tokens_total`

2. Shared log schema enforcement:
   - Python: structlog processor that asserts `timestamp`, `service`, `level`, `event` fields present
   - Next.js: pino base config with same field list
   - Document the schema in `docs/observability.md`

3. Request ID propagation verification:
   - Browser generates UUID, attaches as `X-Request-Id` header to fetch
   - Next.js middleware reads it, forwards to Python backend
   - Python FastAPI dependency reads it, binds to structlog context for the request's entire lifetime
   - Every log line in the request includes the `request_id` field
   - Manual test: trigger a request, grep logs in both services for the same ID, confirm full call graph visible

4. Railway deployment:
   - Agent server: new Railway service, Dockerfile build, env vars set (Anthropic API key, Supabase URL/JWKS, Redis URL, log level)
   - Next.js: existing Railway service updated to point at the new backend URL via `NEXT_PUBLIC_AGENT_SERVER_URL`
   - Redis: existing Railway add-on (or new one if needed)
   - Supabase: already managed
   - Both services configured with health checks pointing at `/health`

5. Environment variable audit:
   - Every env var referenced in `config.py` (Python) and `.env.example` (Next.js) documented with purpose and default
   - Secrets rotation plan noted in README

6. `README.md` rewrite at the repo root:
   - New architecture diagram (ASCII or Mermaid, sourced from design doc)
   - Setup instructions for local dev (both services)
   - Deployment instructions for Railway
   - Brief "what this is" section
   - Link to design doc
   - Link to Phase 1 plan
   - Known limitations (no Resources yet, no historical data, no Claude Desktop install yet — all coming in 2a/2b)

7. Production smoke test — 10 real FPL questions run against the deployed system:
   - "Who is the top scorer this season?"
   - "How is Arsenal doing?"
   - "Compare Salah and Saka"
   - "What are Liverpool's next 5 fixtures?"
   - "Show me the top 10 midfielders by form"
   - "Tell me about Palmer"
   - "Which Chelsea defenders are in form?"
   - "What's the fixture difficulty for Man City's next 3 games?"
   - "/team_briefing Tottenham"
   - "/transfer_debate Haaland Isak"
   - Document results in `docs/plans/2026-04-08-phase-1-smoke-results.md`: what worked, what didn't, anything surprising

8. Monitoring check after 24 hours of deployment:
   - Cache hit rate on Anthropic metrics > 50% (target is 80%; 50% is pass for Phase 1)
   - No unhandled exceptions in logs
   - Memory + CPU usage reasonable on Railway dashboard

**Definition of done:**
- Python agent server deployed and reachable
- Next.js deployed and pointing at the new backend
- Smoke test results documented — all 10 questions answered correctly (or issues documented)
- Metrics show real traffic and real cache hits
- README updated with current architecture
- Phase 1 marked complete in the design doc

---

## Phase 1 completion criteria

Phase 1 is done when all of the following are true:

1. `main` branch contains `apps/web/` + `apps/agent-server/` + empty `packages/` (single Python package in Phase 1)
2. Python agent server deployed to Railway with 1 replica, `uvicorn --workers 1`, reachable via public URL
3. Next.js frontend deployed and consuming AG-UI events from the agent server
4. Three tools (`get_players`, `get_teams`, `get_fixtures`) implemented, tested, and callable by the model in production
5. Two prompts (`/team_briefing`, `/transfer_debate`) implemented and usable from the chat UI
6. Anthropic prompt caching verified in production logs: `cache_read_input_tokens > 0` on the second turn of any conversation
7. Tool-layer evals running locally (CI optional) with > 80% coverage on the three tools
8. `chat_runs` table populated with pending/streaming/completed rows; `messages` rows linked via `run_id`; retry with same `run_id` is idempotent (verified manually)
9. Structured logging with request IDs propagating from browser to Python
10. `/health`, `/ready`, `/metrics` endpoints returning sensible output
11. 10-question smoke test documented with results
12. All legacy code (TypeScript MCP server, queue service, cron microservices) removed from the repo (done in M0)
13. README updated to reflect current architecture

When all 13 are checked, open a new plan doc for Phase 2a.

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **[Codex]** Scheduler singleton violated by multi-replica deploy or rolling-deploy overlap | Medium | High | Railway service pinned to 1 replica; `uvicorn --workers 1` documented explicitly in config AND README; every scheduled write uses UPSERT so double-firing is safe; leader election added before any horizontal scaling |
| **[Codex]** Chat persistence loses or duplicates turns under disconnect/retry/restart | High | High | `chat_runs` table with `run_id` as idempotency key; pending row written BEFORE Anthropic call; `ON CONFLICT DO NOTHING` prevents duplicates; retries return stored result without new LLM calls |
| Stale `streaming` runs after backend crash (no auto-sweeper in Phase 1) | Medium | Low | Frontend shows "run interrupted" for streaming rows older than 5 minutes; add automatic sweeper in Phase 2b |
| Anthropic caching silently misses due to <2048 token system prompt | Medium | High | Log cache creation/read tokens on first production request; fail loudly if zero |
| FastMCP in-process `Client(transport=mcp)` has an edge case with async lifespan | Low | Medium | Test early in M4; fallback is HTTP loopback via `mcp.http_app()` |
| AG-UI spec drift breaks the adapter mid-project | Medium | Medium | Adapter isolated to one file; pin `ag-ui-protocol` version; revisit at each phase boundary |
| Supabase RLS blocks Python backend's writes to `chat_runs`/`messages` | Medium | High | Test in M4 with a real RLS-enabled table; forward user JWT via Supabase Python client; verify user A cannot read/write user B's rows |
| Railway deployment has surprise resource limits on Python workloads | Low | Medium | Deploy in M8 with headroom; fall back to Fly.io if blocked |
| FPL API rate limits (undocumented) | Low | Medium | Cache-aside with 1h TTL limits real API calls to ~2/hour total; add logging to detect 429s |

---

## What's NOT in this plan

Explicitly deferred to later phases and listed here so they don't sneak into Phase 1:

- MCP Resources (no `fpl://` URIs exposed in Phase 1)
- Postgres historical tables (only Redis cache)
- Claude Desktop integration / public `/mcp` exposure
- Server-side compaction
- Context editing
- Memory tool
- Agent smoke evals (Layer 2)
- Quality evals (Layer 3)
- ADRs, blog post, PyPI package publishing
- Match-day accelerated refresh cadence
- Live gameweek data tools
- Set piece takers tool
- All the remaining prompts (`/captain_analysis`, `/find_differentials`, `/analyze_team`, `/plan_gameweek`, `/gameweek_review`)
- Load testing
- Grafana / external dashboards

If a task or feature above starts looking tempting during Phase 1 implementation, **stop and move it to the Phase 2a or later plan**. Scope discipline is load-bearing for the phased rollout to actually work.
