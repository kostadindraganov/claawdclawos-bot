# CLAUDECLAW OS — Task Breakdown

> Companion to `docs/PLAN.md` and `docs/TECHNICAL_SPEC.md`.
> Every task is scoped to a single deliverable with an explicit acceptance
> command. Phases gate on a green checkpoint
> (`npm run build && npm run typecheck && npm test`).

Legend: `[ ]` open · `[x]` done · `→` verification command.

---

## Phase 0 — Documentation & Scaffold

- [x] Create folder layout under `app/`
- [x] Write `docs/PLAN.md`
- [x] Write `docs/PRD.md`
- [x] Write `docs/TECHNICAL_SPEC.md`
- [x] Write `docs/TASK_BREAKDOWN.md`
- [x] Write `.gitignore`, `.env.example`, `package.json`, `tsconfig.json`,
      `README.md`
- [x] Create empty `src/`, `agents/_template/workspace/`, `warroom/`,
      `skills/`, `scripts/` directories

→ `find app -maxdepth 2 -type d` returns the layout in PLAN §Phase 0

---

## Phase 1 — Core Engine

### 1.1 Project bootstrap
- [x] `package.json` with pinned deps from TECHNICAL_SPEC §14
- [x] `tsconfig.json` ESM + strict + NodeNext
- [x] `npm install` succeeds

→ `npm install && npm run typecheck`

### 1.2 Foundational modules (no external deps)
- [x] `src/env.ts` — `readEnvFile()` returns typed map
- [x] `src/logger.ts`
- [x] `src/errors.ts`
- [x] `src/config.ts`
- [x] `src/state.ts`

→ Vitest: `env.ts` parses sample `.env`, ignores `#` comments, never touches
  `process.env`

### 1.3 Persistence
- [x] `src/db.ts` opens `store/db.sqlite` in WAL, applies inline migrations
      for `sessions` table

→ Vitest: fresh tmpdir → table exists with expected columns

### 1.4 Agent SDK wrapper
- [x] `src/agent.ts` exports `runAgent({chatId, agentId, prompt})` and
      `runAgentWithRetry()` (max 3 attempts, exponential backoff)
- [x] Composite-key session lookup in `sessions`

→ Integration test: stubbed SDK echoes prompt; second call resumes session

### 1.5 Message pipeline
- [x] `src/message-classifier.ts` per TECHNICAL_SPEC §6
- [x] `src/cost-footer.ts` — 5 modes from TECHNICAL_SPEC §8
- [x] `src/message-queue.ts` — FIFO per chat_id
- [x] `src/hooks.ts` — `before(msg)` / `after(reply)` hook registry
- [x] `src/rate-tracker.ts` — token bucket per (chat_id, agent_id)

→ Vitest: classifier returns `simple` for ≤ 80-char no-`?`; `complex` otherwise

### 1.6 Telegram surface
- [x] `src/telegram.ts` grammy bot; refresh typing every 4 s
- [x] `src/index.ts` boots DB, queue, telegram; SIGINT graceful drain

→ Manual: `/start` from Telegram → reply within 8 s; restart → next reply
  resumes the same session ID

### Phase 1 checkpoint
→ `npm run build && npm run typecheck && npm test` all green ✅

---

## Phase 2 — Memory v2 + Security

### 2.1 Gemini integration
- [x] `src/gemini.ts` — chat completion + structured JSON extraction
- [x] `src/embeddings.ts` — Gemini Embedding 001, 768-dim, LRU cache 1k

→ Vitest: mock Gemini → embed deterministic shape, cache hit on repeat

### 2.2 Memory pipeline
- [x] DB migrations: `memories`, `memories_fts` (FTS5 + sync triggers),
      `audit_log`
- [x] `src/memory-ingest.ts` — extract facts, salience, pinned
- [x] `src/memory-consolidate.ts` — every `MEMORY_CONSOLIDATE_INTERVAL_MIN`,
      dedup, summarize, decay per TECHNICAL_SPEC §7
- [x] `src/memory.ts` — 5-layer retrieval

→ Manual: tell bot "I prefer short emails" ×3 → run `/consolidate` →
  `SELECT * FROM memories WHERE kind='insight'` returns ≥ 1 row

### 2.3 Security
- [x] `src/exfiltration-guard.ts` — all 15 patterns from TECHNICAL_SPEC §9
- [x] `src/security.ts` — PIN (SHA-256 salted), idle auto-lock, kill phrase,
      audit writes
- [x] `src/crypto.ts` — AES-256-GCM field-level encryption

→ Vitest fixtures: every pattern in §9 redacts at least one fixture string
→ Manual: paste fake `sk-…` → reply contains `[REDACTED]`
→ Manual: send `EMERGENCY_KILL_PHRASE` → process exits, audit row written

### Phase 2 checkpoint
→ `npm run build && npm run typecheck && npm test` all green ✅

---

## Phase 3 — Multi-Agent + Mission Control

### 3.1 Agent loading
- [x] `agents/_template/{CLAUDE.md, agent.yaml, workspace/}`
- [x] Populate `agents/{main,comms,content,ops,research}/` from template
      with personas + MCP allowlists from TECHNICAL_SPEC §5
- [x] `src/agent-config.ts` loads `agent.yaml`

→ Vitest: load each agent.yaml; assert allowlist matches §5 ✅

### 3.2 Orchestrator + hive mind
- [x] DB migration: `hive_mind`
- [x] `src/orchestrator.ts` — `@<agent_id>:` routing, broadcast on `@all:`,
      hive-mind write per response

→ Manual: `@research: ping` → only research replies; hive_mind row written
→ Manual: `@all: ping` → 5 replies; 5 hive_mind rows

### 3.3 Scheduler + mission queue
- [x] DB migrations: `scheduled_tasks`, `mission_tasks`
- [x] `src/scheduler.ts` — 60 s tick, fires due tasks
- [x] `src/schedule-cli.ts` — `npm run schedule [create|list|delete]`
- [x] `src/mission-cli.ts` — `npm run mission [add|list|run|cancel]`

→ Manual: `npm run schedule create "* * * * *" "@main: ping"` → row appears,
  fires within 60 s, `last_run_ts` populated
→ Manual: `npm run mission add "draft a tweet" --priority 7` → ordered
  ahead of priority-5 row

### Phase 3 checkpoint
→ `npm run build && npm run typecheck && npm test` all green ✅

---

## Phase 4 — Channels Expansion + Voice + Media

### 4.1 WhatsApp
- [x] `src/whatsapp.ts` — first-run QR pair, persistent session in
      `WHATSAPP_SESSION_DIR`

→ Manual: QR pair completes; round-trip a message

### 4.2 Slack
- [x] `src/slack.ts` — Events API receiver, slash command `/claudeclaw`

→ Manual: `/claudeclaw ping` → reply in channel

### 4.3 Voice cascade
- [x] `src/voice.ts` — STT and TTS cascades from TECHNICAL_SPEC §11
- [x] `src/media.ts` — image/video forwarding to Gemini

→ Manual: 5 s voice note round-trips text + audio reply
→ Manual: unset `GROQ_API_KEY` → falls back to whisper-cpp without crash;
  audit row written

### Phase 4 checkpoint
→ `npm run build && npm run typecheck && npm test` all green ✅

---

## Phase 5 — War Room + Meeting Bot + Dashboard

### 5.1 Dashboard
- [x] DB migration: `warroom_transcript`, `meet_sessions`
- [x] `src/dashboard.ts` — Hono `:3141`, SSE per TECHNICAL_SPEC §12.1
- [x] `src/dashboard-html.ts` — embedded SPA (~3,200 LOC, no build step)

→ Manual: `npm run dashboard` → open `http://localhost:3141?token=…` → all
  panels render; SSE updates within 2 s of an inbound Telegram message

### 5.2 War Room (Python)
- [x] `warroom/requirements.txt` — `pipecat-ai==0.0.75` + extras
- [x] `warroom/server.py` (`:7860`) · `router.py` · `personas.py` ·
      `agent_bridge.py` · `config.py` · `voices.json`
- [x] `warroom/warroom-html.ts` — cinematic UI + static `warroom.html`
- [x] `src/agent-voice-bridge.ts` — Node ↔ Python WebSocket bridge

→ Manual: `npm run warroom` → browser → speak → Gemini Live transcription
  appears in dashboard SSE within 1 s

### 5.3 Meeting Bot
- [x] `src/meet-cli.ts` — `npm run meet [join|leave]`
- [x] `skills/pikastream-video-meeting/SKILL.md` + spec

→ Manual: `npm run meet join <calendar_event_id>` runs 75 s pre-flight
  pulling Calendar + Gmail + Memory; Pika avatar joins meeting

### 5.4 Setup wizard + status
- [x] `scripts/setup.ts` — collects API keys, generates PIN hash, creates .env
- [x] `scripts/status.ts` — DB ping, table checks, queue depth, scheduler state,
      voice provider health

→ Manual: `npm run setup` end-to-end on a clean machine completes in
  ≤ 15 min including service install

### Phase 5 checkpoint (release candidate)
→ Full smoke matrix from `docs/PLAN.md` §End-to-end Verification ✅

---

## Cross-cutting backlog (any phase)

- [x] CI workflow (GitHub Actions) running `npm ci && npm run typecheck && npm test`
- [x] README badges (license, node version, coverage)
- [x] CONTRIBUTING.md (only if the project is opened up)
- [x] Migration test: rebuild DB from empty → all 9 tables present
- [ ] Long-soak test: run for 7 days under synthetic traffic; observe
      memory size, CPU, and audit log integrity

---

## Open questions (deferred)

1. Final tuning constants for salience-decay exponential
2. Per-agent MCP allowlist exact composition (current placeholders in §5)
3. Dashboard SSE event cadence under heavy traffic (per-msg vs per-token)
4. `MEET_PREFLIGHT_SECONDS` exposure for tuning around documented 75 s
5. Hive-mind cross-agent activity exact field set (current proposal in §3.4)
