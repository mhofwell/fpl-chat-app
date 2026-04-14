# Phase 1 Smoke Test Results

Run this after the first Railway deploy. Record verdicts + anything
surprising. One table row per question.

**Date deployed:** _TBD_
**Agent server URL:** _TBD_
**Next.js URL:** _TBD_
**Anthropic model:** `claude-sonnet-4-5`

---

## Question matrix

| # | Question                                                                 | Expected tool(s)                        | Verdict | Notes |
|---|--------------------------------------------------------------------------|------------------------------------------|---------|-------|
| 1 | Who is the top scorer in the Premier League this season?                 | `get_players(sort_by="goals_scored")`    |         |       |
| 2 | How is Arsenal doing?                                                    | `get_teams(name="Arsenal")` + `get_fixtures(team_id=X, scope="past")` |         |       |
| 3 | Compare Salah and Saka                                                   | `get_players(ids=[...])`                 |         |       |
| 4 | What are Liverpool's next 5 fixtures?                                    | `get_teams` + `get_fixtures(scope="upcoming")` |         |       |
| 5 | Show me the top 10 midfielders by form                                   | `get_players(position="MID", sort_by="form")` |         |       |
| 6 | Tell me about Palmer                                                     | `get_players(name="Palmer")`             |         |       |
| 7 | Which Chelsea defenders are in form?                                     | `get_players(team_id=X, position="DEF", sort_by="form")` |     |       |
| 8 | What's the fixture difficulty for Man City's next 3 games?               | `get_fixtures(team_id=X, scope="upcoming", limit=3)` |        |       |
| 9 | `/team_briefing Tottenham` (via MCP prompt invocation from Claude Desktop) | `team_briefing` prompt                 |         |       |
| 10 | `/transfer_debate Haaland Isak` (via MCP prompt invocation)             | `transfer_debate` prompt                 |         |       |

**Verdict legend:** ✅ correct, grounded · ⚠️ off but recoverable · ❌ wrong or failed

---

## Cache verification (the single most important check)

Hit `https://<agent-server>/metrics` twice: once after question 1, once after
question 2.

| Metric                                  | After request 1 | After request 2 |
|-----------------------------------------|-----------------|-----------------|
| `anthropic_cache_write_tokens_total`    |                 |                 |
| `anthropic_cache_read_tokens_total`     |                 |                 |
| `anthropic_input_tokens_total`          |                 |                 |
| `anthropic_output_tokens_total`         |                 |                 |

**Pass criteria:**
- After request 1: `cache_write_tokens_total > 2048` (minimum cacheable size on
  Sonnet 4.5) and `cache_read_tokens_total == 0`
- After request 2 (within 5 minutes): `cache_read_tokens_total > 0` and
  `cache_write_tokens_total` unchanged

If `cache_read_tokens_total` stays at 0 on the second request, **stop and
debug** before declaring Phase 1 complete. This is the single load-bearing
validation that the caching strategy is real, not theoretical.

---

## Durability + idempotency check

- [ ] Send a question, confirm `agent_runs` row appears in Supabase with
      `status='completed'`
- [ ] Replay the exact same `run_id` (grab it from the browser, re-POST via
      curl with same payload) → response streams back a text replay without a
      new Anthropic call
- [ ] Open the app in two tabs, send the same message simultaneously on both →
      second request returns HTTP 409

## RLS check

- [ ] Create a second Supabase user
- [ ] From user A's browser session, try to read user B's `agent_runs` rows
      via direct Supabase client query → returns empty result (RLS blocks it)

---

## Issues discovered

_(Fill in after running the matrix.)_
