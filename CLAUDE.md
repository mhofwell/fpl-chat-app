# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project overview

FPL Chat App — a portfolio-grade Fantasy Premier League assistant. Users sign
in, chat with Claude Sonnet, and get answers grounded in live FPL data through
a FastMCP tool server. Phase 1 ships three services:

- **`apps/agent-server/`** — Python 3.11 + FastAPI. Hosts the FastMCP server
  (3 tools, 2 prompts), the Anthropic agent loop with prompt caching, the FPL
  data layer (httpx client + Redis cache), APScheduler for hourly refresh, and
  the `POST /agent/run` SSE endpoint for AG-UI streaming.
- **`apps/web/`** — Next.js 16 + React 19 + Tailwind. AG-UI client
  (`@ag-ui/client` HttpAgent) consumes the SSE stream. Supabase SSR for auth.
- **Redis + Supabase** — managed dependencies. Redis holds the FPL API cache;
  Supabase handles auth + the `agent_runs` durability table with RLS.

## Repository layout

```
.
├── apps/
│   ├── agent-server/          # Python FastAPI + FastMCP backend
│   │   ├── src/fpl_agent/
│   │   │   ├── main.py        # FastAPI app, lifespan, middleware, router mounts
│   │   │   ├── config.py      # pydantic-settings
│   │   │   ├── auth.py        # Supabase JWT dep, per-request Supabase client
│   │   │   ├── deps.py        # runtime singletons (cache, client, agent_loop, jwt_verifier)
│   │   │   ├── metrics.py     # 6 Prometheus counters
│   │   │   ├── middleware.py  # X-Request-Id middleware
│   │   │   ├── log_config.py  # structlog JSON setup
│   │   │   ├── scheduler.py   # APScheduler (hourly bootstrap + fixtures refresh)
│   │   │   ├── agent/
│   │   │   │   ├── loop.py           # AgentLoop.run() + run_stream()
│   │   │   │   └── mcp_bridge.py     # FastMCP Client(transport=mcp) wrapper
│   │   │   ├── adapters/
│   │   │   │   └── anthropic_to_agui.py  # Anthropic stream → AG-UI events
│   │   │   ├── api/
│   │   │   │   ├── agent.py   # POST /agent/run (AG-UI SSE, JWT-auth'd)
│   │   │   │   └── health.py  # /health, /ready, /metrics
│   │   │   ├── mcp/
│   │   │   │   ├── server.py           # FastMCP('fpl') instance
│   │   │   │   ├── system_prompt.py    # cached static + dynamic prelude builder
│   │   │   │   ├── system_prompt_static.md  # the ~2,700-token cached prompt
│   │   │   │   ├── models.py           # PlayerProfile, TeamProfile, Fixture, etc.
│   │   │   │   ├── tools/              # get_players, get_teams, get_fixtures
│   │   │   │   ├── prompts/            # team_briefing, transfer_debate
│   │   │   │   └── data/               # fpl_client.py, cache.py, bootstrap.py, fixtures.py
│   │   │   └── persistence/
│   │   │       └── runs.py    # agent_runs CRUD + idempotency protocol
│   │   ├── migrations/
│   │   │   └── 001_agent_runs.sql  # apply manually via Supabase SQL Editor
│   │   ├── tests/             # pytest, 90 tests
│   │   ├── Dockerfile         # multi-stage, uv --frozen, single worker
│   │   ├── railway.toml       # Dockerfile build, /health check, 1 replica
│   │   └── pyproject.toml
│   └── web/
│       ├── app/
│       │   ├── page.tsx              # landing (redirects auth'd → /protected)
│       │   ├── protected/page.tsx    # chat host (server reads session, client consumes SSE)
│       │   └── (auth-pages)/         # sign-in, sign-up, forgot-password
│       ├── components/chat/
│       │   ├── chat-transition-container.tsx  # HttpAgent + subscriber orchestration
│       │   ├── conversation-view.tsx          # smart auto-scroll, message bubbles
│       │   ├── composing-view.tsx             # initial textarea view
│       │   ├── new-messages-pill.tsx          # appears when scrolled up mid-stream
│       │   └── ...
│       ├── lib/
│       │   ├── agent-client.ts       # HttpAgent factory + setAgentAuth helper
│       │   └── agent-subscriber.ts   # AG-UI event → React callback bridge
│       ├── utils/supabase/           # server / client / middleware
│       ├── railway.toml              # Nixpacks build
│       └── package.json
├── docs/
│   ├── design/2026-04-08-fpl-chat-rebuild.md    # the design doc
│   ├── plans/2026-04-08-phase-1-implementation.md  # milestone plan (M0–M8)
│   ├── plans/2026-04-08-phase-1-smoke-results.md   # post-deploy checklist
│   ├── standards/                    # coding-standards, naming-conventions, agent-ops
│   ├── reference/                    # fpl-api-schema, railway-deployment, product-overview
│   └── vision/differentiators.md
├── README.md
└── CLAUDE.md
```

## Common commands

### Backend (`apps/agent-server/`)

```bash
# Install (creates .venv, installs from uv.lock)
uv sync

# Run locally (port 8000)
uv run uvicorn fpl_agent.main:app --port 8000 --reload

# Tests (90 expected)
uv run pytest
uv run pytest -v                           # verbose
uv run pytest tests/persistence/           # one suite
uv run pytest -k test_cache                # match by name

# List registered MCP tools + prompts
uv run python -c "
import asyncio
import fpl_agent.mcp.tools
import fpl_agent.mcp.prompts
from fpl_agent.mcp.server import mcp
async def m():
    print([t.name for t in await mcp.list_tools()])
    print([p.name for p in await mcp.list_prompts()])
asyncio.run(m())
"

# Build Docker image (uses uv.lock via --frozen)
docker build apps/agent-server/
```

### Frontend (`apps/web/`)

```bash
cd apps/web
bun install
bun run dev        # http://localhost:3000
bun run build      # type-check + production build
bun run start      # production server
```

### Running both (typical local dev loop)

```bash
# Terminal 1 — backend
cd apps/agent-server && uv run uvicorn fpl_agent.main:app --port 8000

# Terminal 2 — frontend
cd apps/web && bun run dev

# Both require: Redis running locally, Supabase project with migration applied
```

## Required local environment

Both services expect environment variables. See README for the full table.

- Python 3.11 (installed via `uv python install 3.11` or pyenv)
- `uv` ≥ 0.5
- Bun ≥ 1.2
- Redis reachable at `REDIS_URL` (default `redis://localhost:6379`)
- A Supabase project with `migrations/001_agent_runs.sql` applied via SQL
  Editor
- Anthropic API key with Claude Sonnet access

## Architectural constraints (load-bearing)

These are documented in the design doc §5 and §11 but worth repeating
because new code must respect them:

1. **Single-replica backend.** APScheduler runs inside the FastAPI lifespan —
   every process that boots runs every job. Phase 1 ships one replica
   (`numReplicas = 1`, `--workers 1`). All scheduled writes are idempotent
   (Redis `SET` overwrites; Postgres `INSERT ... ON CONFLICT DO UPDATE`).
   Horizontal scaling requires Redis-backed leader election first.

2. **Per-request Supabase client.** `get_user_supabase_client` builds a fresh
   `Client` per request and calls `postgrest.auth(token)` on it. A shared
   singleton is unsafe because concurrent streaming requests would mutate
   each other's Authorization header.

3. **Agent run idempotency via `run_id`.** Every `POST /agent/run` starts
   with `INSERT INTO agent_runs ... ON CONFLICT (run_id) DO NOTHING`. The
   status on the returned row dispatches behavior:
   - `pending` → claim via `mark_run_streaming` (guarded UPDATE, check rows
     affected), then run the agent loop.
   - `streaming` → HTTP 409 (no wait-and-tail in Phase 1).
   - `completed` → replay stored `assistant_message_content` as an AG-UI
     TextMessage sequence (no new Anthropic call).
   - `failed` → replay the stored error.

4. **Prompt cache placement.** `cache_control: {"type": "ephemeral"}` is
   applied to (a) the last tool in the tools list and (b) the last static
   system-prompt block. The static prompt must stay above Sonnet's 2,048-token
   minimum cacheable size or cache writes silently no-op. Track via the
   `anthropic_cache_read_tokens_total` / `anthropic_cache_write_tokens_total`
   Prometheus counters.

5. **AG-UI adapter is the single source of truth for event mapping.**
   `adapters/anthropic_to_agui.py` is the only place the Anthropic streaming
   shape maps to AG-UI events. Spec drift touches one file.

## Conventions

- **Python:** snake_case modules + functions, PascalCase classes. Type hints
  everywhere. Google-style docstrings on public functions. Never catch bare
  `Exception` without code-level handling or re-raise. Postgres errors from
  `postgrest.exceptions.APIError` should be code-checked (`23505` for unique
  violation) rather than blanket-caught.
- **TypeScript:** strict mode. `"use client"` directive for React
  client components only. Server components do Supabase session reads via
  `@/utils/supabase/server`; client components use `@/utils/supabase/client`.
- **Tests:** pytest on the backend. Frontend has no test setup (portfolio
  trade-off — see plan doc). Any new backend code ships with unit tests.
- **Commits:** conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
  Co-authored trailer with the Claude model id.

## Deploy notes

- Agent server deploys via Dockerfile on Railway. Start command uses
  `$PORT` (Railway injects); Dockerfile `CMD` falls back to 8000 for local.
- Web deploys via Nixpacks on Railway. `bun run start` is the start command.
- Migration SQL is applied manually via Supabase SQL Editor — there's no
  in-app migration runner.
- Smoke-test results are logged in
  `docs/plans/2026-04-08-phase-1-smoke-results.md` after the first live deploy.

## Things to know

- `app/actions.ts` at the `apps/web/` root contains Supabase auth server
  actions (sign-in, sign-up, password reset). These are unrelated to chat.
- `apps/web/lib/types/fpl-types.ts` was pared down after M6 — it now only
  holds `Message`, `ConversationViewProps`, `MessageInputBarProps`, and
  `ChatViewState`. AG-UI types come from `@ag-ui/client`.
- The `test-mcp/` route, `app/actions/claude.ts`, `app/actions/mcp.ts`, and
  `lib/claude/` were deleted in M6. Don't re-introduce them; the Anthropic
  calls now happen only inside the Python agent loop.
- `/agent/chat/test` was removed in the final pre-deploy pass — previously
  unauthenticated, would burn Anthropic credits if exposed.
