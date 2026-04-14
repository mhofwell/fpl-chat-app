# FPL Chat App

Portfolio-grade Fantasy Premier League chat assistant. Claude Sonnet answers
deadline-pressure questions ("is Salah worth his price?", "Arsenal's next five
fixtures", "should I sell Haaland?") with live FPL data, through a
reusable FastMCP server and an AG-UI streaming frontend.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (React / Next.js 16, purple EPL theme)                   │
│  ├─ @ag-ui/client HttpAgent + custom AgentSubscriber             │
│  └─ Supabase JS SDK (auth flows only)                            │
└─────────┬───────────────────────────────────┬────────────────────┘
          │ auth, pages                        │ POST /agent/run (SSE)
          │                                    │ Authorization: Bearer <JWT>
          ▼                                    ▼
┌──────────────────┐                 ┌────────────────────────────────┐
│ Next.js (Railway)│                 │ Python Agent Server (Railway)  │
│  Nixpacks build  │                 │  Python 3.11, FastAPI + uvicorn│
│  /protected chat │                 │                                │
│  /sign-in        │                 │  POST /agent/run   — AG-UI SSE │
│  Supabase SSR    │                 │  POST /agent/chat/test         │
└────────┬─────────┘                 │  GET  /health /ready /metrics  │
         │                           │                                │
         │ user/profile reads        │  In-process modules:           │
         ▼                           │   ├─ FastMCP v3 (3 tools,      │
┌──────────────────┐                 │   │   2 prompts, in-process    │
│ Supabase         │◄────────────────┤   │   Client(transport=mcp))   │
│ (managed)        │  user JWT →     │   ├─ Anthropic agent loop      │
│  auth.users      │  agent_runs     │   │   (Claude Sonnet 4.5,      │
│  agent_runs (RLS)│  RLS per user   │   │    prompt caching verified)│
└──────────────────┘                 │   ├─ FPL data layer + Redis    │
                                     │   │   cache-aside              │
                                     │   ├─ AG-UI encoder             │
                                     │   │   (Anthropic stream ↔ SSE) │
                                     │   └─ APScheduler (hourly       │
                                     │       bootstrap + fixtures)    │
                                     └──────┬─────────────────────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ Redis (Railway)  │
                                   │  fpl:v1:bootstrap│
                                   │  fpl:v1:fixtures │
                                   └──────────────────┘
```

Three application services (Next.js web + Python agent + Redis). Supabase is a
managed dependency for auth + `agent_runs` persistence. FPL data comes from the
public Fantasy Premier League API, cached with versioned keys and refreshed
hourly by an in-process APScheduler.

---

## What's interesting

- **Reusable MCP artifact.** The FastMCP server is the tool + prompt registry:
  three tools, two prompts, all called by the agent loop via an in-process
  `Client(transport=mcp)` with zero network overhead. Phase 2 will mount the
  same FastMCP instance at a public `/mcp` Streamable HTTP endpoint so
  Claude Desktop can install it directly.

- **Anthropic prompt caching with verified cache hits.** `cache_control` is
  applied to the last tool definition and the last static system-prompt block
  (TTL 1h). `anthropic_cache_read_tokens_total` exposed at `/metrics` lets you
  confirm the cache is working in production, not just in theory.

- **Durable idempotent agent runs.** Every `POST /agent/run` inserts a pending
  row in `agent_runs` before hitting Anthropic. Retries with the same `run_id`
  return a text replay (completed) or HTTP 409 (in-flight). Surviving
  mid-stream disconnects and double-click submits is baked into the contract,
  not bolted on.

- **AG-UI streaming over SSE.** The adapter (`anthropic_to_agui.py`) is a
  single ~200-line module that owns the Anthropic → AG-UI mapping. Spec drift
  touches one file.

- **Row-Level Security on user data.** Supabase RLS policy on `agent_runs`
  scopes reads + writes to the owner via `auth.uid()`. The Python backend
  forwards the user's JWT to Supabase so its writes run under RLS, not as a
  service role.

See [docs/design/2026-04-08-fpl-chat-rebuild.md](docs/design/2026-04-08-fpl-chat-rebuild.md)
for the full design decisions.

---

## Local development

### Prerequisites

- Python 3.11 (recommended via `uv python install 3.11`)
- [uv](https://docs.astral.sh/uv/) — Python package manager
- [Bun](https://bun.sh/) 1.2+ — Next.js runtime
- Redis running locally (`redis://localhost:6379`)
- A Supabase project with the migration at
  `apps/agent-server/migrations/001_agent_runs.sql` applied (paste it into
  the Supabase SQL Editor)
- An Anthropic API key with Claude Sonnet 4.5 access

### Setup

```bash
# 1. Backend
cd apps/agent-server
uv sync

cat > .env <<EOF
CLAUDE_API_KEY=<your key>
REDIS_URL=redis://localhost:6379
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your anon key>
SUPABASE_JWT_ALGORITHM=ES256
CORS_ALLOWED_ORIGINS=["http://localhost:3000"]
EOF

# 2. Frontend
cd ../web
bun install

cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:8000
EOF
```

### Run

```bash
# Terminal 1
cd apps/agent-server
uv run uvicorn fpl_agent.main:app --port 8000

# Terminal 2
cd apps/web
bun run dev
```

Browse to http://localhost:3000, sign up / sign in, land on `/protected`,
chat.

### Tests

```bash
cd apps/agent-server && uv run pytest
cd apps/web && bun run build   # type-check + production build
```

---

## Deploy (Railway)

Three Railway services:

| Service       | Source               | Build        | Health         |
|---------------|----------------------|--------------|----------------|
| `agent-server`| `apps/agent-server/` | Dockerfile   | `/health`      |
| `web`         | `apps/web/`          | Nixpacks     | `/`            |
| `redis`       | Railway add-on       | —            | (managed)      |

Supabase is managed outside Railway.

### Env vars

**Agent server:**

| Variable              | Required | Example                                  |
|-----------------------|----------|------------------------------------------|
| `CLAUDE_API_KEY`      | yes      | `sk-ant-...`                             |
| `REDIS_URL`           | yes      | `redis://default:...@redis.railway:6379` |
| `SUPABASE_URL`        | yes      | `https://xxx.supabase.co`                |
| `SUPABASE_ANON_KEY`   | yes      | Supabase anon key                        |
| `SUPABASE_JWT_ALGORITHM` | no    | `ES256` (default) — legacy pre-2024 projects use `HS256` and require a different JWTVerifier setup (not supported out of the box) |
| `CORS_ALLOWED_ORIGINS`| yes      | `["https://<web>.railway.app"]`          |
| `LOG_LEVEL`           | no       | `INFO` (default)                         |
| `ANTHROPIC_MODEL`     | no       | `claude-sonnet-4-5` (default)            |

**Next.js:**

| Variable                        | Required | Example                                |
|---------------------------------|----------|----------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | `https://xxx.supabase.co`              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | Supabase anon key                      |
| `NEXT_PUBLIC_AGENT_SERVER_URL`  | yes      | `https://<agent-server>.railway.app`   |

### First-deploy checklist

1. Supabase: apply `apps/agent-server/migrations/001_agent_runs.sql` once via
   the SQL Editor
2. Railway: create the three services, set env vars, deploy
3. Smoke test: sign in on the web app, send "How is Arsenal doing?", confirm
   an `agent_runs` row appears with `status='completed'`
4. Cache verification: issue a second question, confirm the `/metrics`
   endpoint shows `anthropic_cache_read_tokens_total > 0`

Smoke test outcomes get recorded in
[docs/plans/2026-04-08-phase-1-smoke-results.md](docs/plans/2026-04-08-phase-1-smoke-results.md).

---

## Phase 1 scope and known limitations

Phase 1 ships the decision-engine primitives: three tools, two prompts,
streaming chat, durable runs. Things explicitly **out of scope** for
Phase 1:

- **No MCP Resources** — pinned context (current gameweek, user team) is
  injected via the dynamic system-prompt prelude, not resource subscriptions.
- **Single-replica backend.** APScheduler runs in-process; multi-replica
  would double-refresh. Horizontal scaling requires leader election
  (Redis-based lock or a dedicated scheduler service) first.
- **No multi-chat persistence.** Each browser session is one thread; refresh
  starts fresh. `agent_runs` is solely for idempotency + mid-stream durability.
- **No Postgres historical tier.** Bootstrap + fixtures live in Redis only;
  gameweek-by-gameweek history queries ("who had the biggest xG overperform
  last 5 GWs") aren't answerable until Phase 2b adds a historical table.
- **No betting / gambling responses.** Explicit refusal in the system prompt.

Phase 2a and later add Resources, Postgres historical data, live match
tracking, and the Claude Desktop install flow.

---

## Links

- [Design doc](docs/design/2026-04-08-fpl-chat-rebuild.md) — architecture
  decisions and trade-offs
- [Phase 1 plan](docs/plans/2026-04-08-phase-1-implementation.md) — milestone
  breakdown
- [Smoke test results](docs/plans/2026-04-08-phase-1-smoke-results.md) —
  post-deploy verification log
