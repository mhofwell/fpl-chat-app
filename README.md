# FPL Chat — Fantasy Premier League AI Assistant

![Version](https://img.shields.io/badge/phase-1-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Python](https://img.shields.io/badge/python-3.11-blue?logo=python) ![Next.js](https://img.shields.io/badge/next.js-16-black?logo=nextdotjs) ![Railway](https://img.shields.io/badge/deploy-Railway-blueviolet?logo=railway) ![Claude](https://img.shields.io/badge/model-claude--sonnet--4--5-red?logo=anthropic)

FPL Chat is a portfolio-grade Fantasy Premier League assistant. It answers deadline-pressure questions — transfers, captaincy, fixture difficulty, team form — by grounding every response in live FPL data through a [FastMCP](https://gofastmcp.com) tool server, streaming over [AG-UI](https://ag-ui.dev) SSE into a Next.js UI, with Anthropic prompt caching, durable idempotent runs, and Supabase row-level security on user data.

This isn't a one-click template. It's a walkthrough of the architecture decisions that make an LLM chat app actually ship.

## About Running FPL Chat

Running FPL Chat requires three long-lived services and two managed dependencies. The backend holds a warm Redis cache of the FPL API (`bootstrap-static`, `fixtures`), runs APScheduler inside the FastAPI lifespan to refresh those caches hourly, and owns the Anthropic agent loop. The frontend is a thin Next.js consumer — it authenticates with Supabase, attaches the user's JWT to every request, and consumes AG-UI events from the backend's `POST /agent/run`.

Railway handles the container lifecycle for both services and the Redis add-on. Supabase handles user auth and the `agent_runs` table that makes retries and reconnects safe. Configuration is per-service environment variables; the only manual step is applying a single SQL migration via the Supabase dashboard before the first deploy.

## What It Can Answer

| Question | Tool chain | What the model does |
|----------|------------|--------------------|
| **"How's Arsenal doing this season?"** | `get_teams` + `get_fixtures(scope="past")` | Narrates league position, recent W/D/L form, notable results |
| **"Compare Salah and Saka."** | `get_players(ids=[...])` | Quotes the relevant section of each sectioned profile (scoring, form, ownership) side by side |
| **"What are Liverpool's next 5 fixtures?"** | `get_fixtures(team_id, scope="upcoming", limit=5)` | Returns the fixtures from Liverpool's POV with FDR per opponent |
| **"Top 10 midfielders by form."** | `get_players(position="MID", sort_by="form", limit=10)` | One-line-per-player ranked list with key stats |
| **"Cheapest defenders with clean sheet upside."** | `get_players(position="DEF", sort_by="now_cost")` | Filters on position + price, reads clean sheet counts from the profile |
| **"Is Haaland worth his £15m price tag?"** | `get_players(name="Haaland")` + `get_fixtures(team_id=..., scope="upcoming")` | Blends scoring section (goals, xG, xA) with upcoming FDR |
| **"/team_briefing Tottenham"** (MCP prompt) | `get_teams` + `get_fixtures` ×2 + `get_players` | Renders a pre-fetched, format-enforced briefing (Position/Record/Form/Fixtures/Players/Bottom Line) |
| **"/transfer_debate Haaland Isak"** (MCP prompt) | `get_players` ×2 + `get_fixtures` ×2 | Recommendation/Confidence/Reasoning/Risks/Alternatives with server-side data assembly |

Response format is enforced by the prompt text, not trusted to the model's judgement. Prompts fetch their own data (up to 4 parallel tool calls) so the model only does analysis.

## Dependencies for Hosting

### Required — Agent Server

- `CLAUDE_API_KEY` — Anthropic API key with Claude Sonnet access. Powers the agent loop.
- `REDIS_URL` — `redis://default:<pass>@<host>:<port>`. Railway's Redis add-on provides this directly.
- `SUPABASE_URL` — Your Supabase project URL (no trailing slash).
- `SUPABASE_ANON_KEY` — Supabase anon key. The backend forwards the user's JWT on top of this so RLS enforces per-user access.
- `CORS_ALLOWED_ORIGINS` — JSON array string (not comma-separated). Example: `'["https://your-web.railway.app"]'`.

### Required — Web

- `NEXT_PUBLIC_SUPABASE_URL` — same as `SUPABASE_URL` above.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same as `SUPABASE_ANON_KEY` above.
- `NEXT_PUBLIC_AGENT_SERVER_URL` — the deployed agent-server URL. The browser POSTs `/agent/run` here with the Supabase access token.

### Optional

- `LOG_LEVEL` — default `INFO`. Controls structlog output level.
- `ANTHROPIC_MODEL` — default `claude-sonnet-4-5`.
- `SUPABASE_JWT_ALGORITHM` — default `ES256` (post-April-2024 Supabase projects). Legacy projects sign with HS256 using a symmetric secret and are not supported by the default JWTVerifier wiring.
- `FPL_API_BASE` — default `https://fantasy.premierleague.com/api`.

### External Services

- [Anthropic](https://console.anthropic.com) — Claude API access.
- [Supabase](https://supabase.com) — auth + Postgres. Free tier is sufficient for Phase 1. Apply `apps/agent-server/migrations/001_agent_runs.sql` once via the SQL Editor.
- [Railway](https://railway.app) — hosts the agent-server (Dockerfile), web (Nixpacks), and Redis add-on.

## Implementation Details

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (Next.js / React 19 / Tailwind)                          │
│  ├─ @ag-ui/client HttpAgent + custom AgentSubscriber             │
│  └─ @supabase/ssr for auth                                       │
└─────────┬───────────────────────────────────┬────────────────────┘
          │ auth pages                         │ POST /agent/run (SSE)
          │                                    │ Authorization: Bearer <supabase JWT>
          ▼                                    ▼
┌──────────────────┐                 ┌────────────────────────────────┐
│ Next.js (Railway)│                 │ Python Agent Server (Railway)  │
│  Nixpacks        │                 │  Python 3.11 / FastAPI         │
│  /protected      │                 │                                │
│  /sign-in        │                 │  GET  /health /ready /metrics  │
│  Supabase SSR    │                 │  POST /agent/run               │
└────────┬─────────┘                 │                                │
         │                           │  In-process:                   │
         │ auth only                 │   FastMCP(3 tools, 2 prompts)  │
         ▼                           │   Anthropic agent loop         │
┌──────────────────┐                 │   + prompt caching             │
│ Supabase         │◄────────────────┤   AG-UI encoder                │
│ (managed)        │  user JWT →     │   FPL data layer               │
│  auth.users      │  agent_runs     │   APScheduler (hourly refresh) │
│  agent_runs (RLS)│  RLS per user   └──────┬─────────────────────────┘
└──────────────────┘                        │
                                            ▼
                                   ┌──────────────────┐
                                   │ Redis (Railway)  │
                                   │  fpl:v1:bootstrap│
                                   │  fpl:v1:fixtures │
                                   └──────────────────┘
```

### Agent Loop + Prompt Caching

Every turn sends `system`, `tools`, and `messages` to Anthropic with `cache_control: {"type": "ephemeral"}` on two breakpoints: the last static system-prompt block (~2,700 tokens) and the last tool in the `tools` array. On iteration 1 of a fresh cache, these are _written_ and reported via `cache_creation_input_tokens`. On iteration 2+ and subsequent requests within the 1-hour TTL, they're _read_ and reported via `cache_read_input_tokens`.

The cache counters are exported at `/metrics` as `anthropic_cache_write_tokens_total` and `anthropic_cache_read_tokens_total`. The load-bearing post-deploy check is that `cache_read_tokens_total` starts incrementing on the second request — otherwise the caching strategy isn't live, only theoretical.

The agent loop calls FastMCP tools through an in-process `Client(transport=mcp)` bridge. Zero network overhead for tool execution; the backend's own tool calls go through exactly the same path as a hypothetical external MCP client would.

### Durable Runs + Idempotency

Every `POST /agent/run` begins with `INSERT INTO agent_runs (run_id, user_id, status, ...) ON CONFLICT (run_id) DO NOTHING RETURNING *`. The returned row dispatches the endpoint behavior:

- **New row, `status='pending'`** → claim via a guarded `UPDATE ... WHERE status='pending'`, check rows-affected (to close the race window between insert and claim), run the agent loop, finalize on completion.
- **Existing row, `status='streaming'`** → HTTP 409. No wait-and-tail in Phase 1; the frontend surfaces "run was interrupted".
- **Existing row, `status='completed'`** → stream back the stored `assistant_message_content` as a `RunStarted → TextMessage → RunFinished` replay. No new Anthropic call.
- **Existing row, `status='failed'`** → stream `RunStarted → RunError` with the stored error.

The browser generates the `run_id` (UUID v4) before POSTing, so a double-click or retry hits the same row. A mid-stream disconnect leaves the row in `streaming` until a sweeper (Phase 2) runs; the frontend shows "run was interrupted" and the user can start a fresh turn.

### Row-Level Security

The `agent_runs` table has an RLS policy restricting `FOR ALL` operations to `user_id = auth.uid()`. The Python backend calls `client.postgrest.auth(token)` with each request's JWT, so Supabase applies the same `auth.uid()` check the frontend would. A per-request Supabase client (not a shared singleton) prevents concurrent requests from mutating each other's Authorization header.

### Local Development

```bash
# One-time setup
uv python install 3.11

# Backend
cd apps/agent-server
uv sync
cat > .env <<EOF
CLAUDE_API_KEY=<your key>
REDIS_URL=redis://localhost:6379
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your anon key>
CORS_ALLOWED_ORIGINS=["http://localhost:3000"]
EOF
uv run uvicorn fpl_agent.main:app --port 8000

# Frontend (separate terminal)
cd apps/web
bun install
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:8000
EOF
bun run dev
```

Before the first request: apply `apps/agent-server/migrations/001_agent_runs.sql` via the Supabase SQL Editor, and have Redis running on `localhost:6379`.

### Testing

```bash
cd apps/agent-server && uv run pytest    # 90 tests
cd apps/web && bun run build             # TypeScript strict + production build
```

### First-Deploy Checklist

1. Apply `apps/agent-server/migrations/001_agent_runs.sql` in Supabase SQL Editor.
2. Create Railway services: agent-server (Dockerfile), web (Nixpacks), Redis add-on.
3. Set env vars per service from the tables above.
4. Deploy agent-server first, note its URL, set `NEXT_PUBLIC_AGENT_SERVER_URL` on web, deploy web.
5. Update `CORS_ALLOWED_ORIGINS` on agent-server to the web's Railway URL.
6. Walk the smoke-test matrix in [`docs/plans/2026-04-08-phase-1-smoke-results.md`](docs/plans/2026-04-08-phase-1-smoke-results.md) and fill in verdicts.

## Phase 1 Scope

Phase 1 ships the decision-engine primitives: three tools, two prompts, streaming chat, durable runs. Explicitly out of scope for Phase 1, shipped in later phases:

- **No public `/mcp` HTTP endpoint** — the FastMCP server is used in-process only. Phase 2 mounts it at `/mcp` so Claude Desktop can install it.
- **No MCP Resources** — pinned context (current gameweek, user team) comes via the dynamic system-prompt prelude, not resource subscriptions.
- **No Postgres historical tier** — bootstrap and fixtures live in Redis only. Gameweek-by-gameweek history ("who had the biggest xG overperform last 5 GWs") isn't answerable until Phase 2b.
- **No multi-chat persistence** — each browser session is one thread; refresh starts fresh. `agent_runs` exists solely for idempotency and mid-stream durability.
- **No live match tracking** — resource subscriptions for in-play updates land in Phase 2b.

## Why Deploy FPL Chat on Railway?

Railway runs the three-service architecture (agent-server, web, Redis) as a coherent stack. A single dashboard shows logs from both services, the Redis add-on is a checkbox rather than a connection string you manage, and environment variables flow through the template without file juggling. The single-replica scheduler constraint (APScheduler in the FastAPI lifespan — every replica would double-refresh) maps directly onto Railway's `numReplicas = 1` setting in `railway.toml`, so the invariant the design doc calls load-bearing is enforced at the infrastructure level.

## Links

- [Design doc](docs/design/2026-04-08-fpl-chat-rebuild.md) — architecture bets, trade-offs, risks
- [Phase 1 plan](docs/plans/2026-04-08-phase-1-implementation.md) — milestone breakdown (M0–M8)
- [Smoke test results](docs/plans/2026-04-08-phase-1-smoke-results.md) — post-deploy verification log
- [FastMCP](https://gofastmcp.com) · [AG-UI](https://ag-ui.dev) · [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
