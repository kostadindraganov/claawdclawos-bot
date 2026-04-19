# CLAUDECLAW OS — Complete Development Plan

> Mirror of the approved plan stored at
> `~/.claude/plans/i-wont-to-create-cryptic-pine.md`. Kept in-repo so the team
> can read it without leaving the project.

## Context

The user has assembled the full v2 source documentation for **ClaudeClaw OS**
in `/Users/cyberkoko/Desktop/PROJECTS/ClaudeClaw OS/` (assessment prompt, 115 KB
rebuild prompt, two Power Packs guides, and a 12 MB visual guide PDF). They now
want a complete, executable development plan that consolidates those documents
into a buildable spec and lays out, phase by phase, how to deliver the **full
system — all 8 Power Packs** as a polyglot Node.js + Python codebase.

Working directory: `./` (this folder is `ClaudeClaw OS/app/`). It will hold the
application source plus three PRD-style artifacts (PRD, Technical Spec, Task
Breakdown). Channels in scope: **Telegram, WhatsApp, Slack** (Discord deferred).
Estimated final size: **~10,000+ LOC** across ~55 TypeScript files,
~7 Python files, embedded HTML, agent templates, and tests.

The intended outcome: a self-hostable multi-agent Claude orchestrator with
persistent memory, voice I/O, real-time war-room voice rooms, security gating,
mission scheduling, observability dashboard, and meeting-bot capabilities —
matching `REBUILD_PROMPT_V2.md` STEP 1–15 with all optional features enabled.

---

## Recommended Approach

Build in **5 sequential phases** mirroring the dependency order in
`POWER_PACKS_GUIDE.md` ("Install Order") and `REBUILD_PROMPT_V2.md` STEP 12.
Each phase ends in a verifiable green-state checkpoint
(`npm run build && npm run typecheck && npm test`) before the next begins.

Phase 0 (Documentation & Scaffold) is front-loaded so PRD, Tech Spec, and Task
Breakdown live in the repo before any code is written and act as the contract
for later phases.

---

## Phase 0 — Documentation & Scaffold (this commit)

**Goal:** Create the new project folder, write the three artifacts, and lay
down empty scaffolding so subsequent phases have a target.

```
app/
├── docs/
│   ├── PLAN.md                      # this file
│   ├── PRD.md                       # Product Requirements Doc
│   ├── TECHNICAL_SPEC.md            # Architecture + DB + API contracts
│   └── TASK_BREAKDOWN.md            # Phase checklist with verification
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── src/                             # empty for Phase 1
├── agents/_template/                # filled in Phase 3
├── warroom/                         # filled in Phase 5
├── skills/                          # filled in Phase 5
├── scripts/                         # filled in Phase 5
├── store/                           # auto at runtime
└── workspace/uploads/               # auto at runtime
```

---

## Phase 1 — Core Engine (Node.js / TypeScript)

Standalone single-agent bot on Telegram with SQLite session persistence.

Files (in dep order — `REBUILD_PROMPT_V2.md` STEP 12):

1. `package.json` — pin `@anthropic-ai/claude-agent-sdk@^0.2.34`,
   `better-sqlite3`, `hono`, `@hono/node-server`, `grammy`, `typescript@5.3+`,
   `tsx`, `vitest`
2. `tsconfig.json` — ESM, strict, NodeNext
3. `.gitignore` — node_modules, dist, store, .env, workspace/uploads
4. `src/env.ts` — `readEnvFile()` (NEVER mutates `process.env`)
5. `src/logger.ts` · `src/errors.ts` · `src/config.ts` · `src/state.ts`
6. `src/db.ts` — SQLite WAL + inline `PRAGMA table_info()` migrations
7. `src/agent.ts` — SDK wrapper + composite-key (`chat_id+agent_id`) sessions
8. `src/message-classifier.ts` · `src/cost-footer.ts` · `src/message-queue.ts`
9. `src/hooks.ts` · `src/rate-tracker.ts`
10. `src/telegram.ts` — grammy adapter; refresh typing every 4 s
11. `src/index.ts` — entry point, lifecycle, graceful shutdown

Verification: `npm install && npm run build && npm run typecheck && npm test`.
Manual: Telegram DM round-trip, restart, verify session resumes.

Critical gotchas:
- `fileURLToPath(import.meta.url)` for `__dirname` (folder name has a space)
- Wrap `bot.start()` in try/catch
- Refresh Telegram typing indicator every 4 s (5 s expiry)

---

## Phase 2 — Memory v2 + Security

- `src/gemini.ts` · `src/embeddings.ts` (Gemini Embedding 001, 768-dim)
- `src/memory-ingest.ts` · `src/memory-consolidate.ts` (every 30 min)
- `src/memory.ts` — 5-layer retrieval
- `src/exfiltration-guard.ts` — 15+ regex patterns
- `src/security.ts` — PIN (SHA-256 salted), idle lock, kill phrase, audit log
- DB migrations: `memories`, `memories_fts` (FTS5 + triggers), `audit_log`

Decay formula:
- pinned 0 %/day · high (≥4) 1 %/day · mid (2–3) 2 %/day · low (0–1) 5 %/day
- exponential, applied during consolidation pass

Verification: tests for `embeddings.ts`, `exfiltration-guard.ts`. Manual:
"remember I prefer short emails" ×3 → `/consolidate` → insight row appears.
Paste fake `sk-…` token → reply contains `[REDACTED]`.

---

## Phase 3 — Multi-Agent + Mission Control

- `src/agent-config.ts` — load `agent.yaml`
- `src/orchestrator.ts` — `@agentId: prompt` routing + hive-mind writes
- `src/scheduler.ts` — 60 s cron polling
- `src/mission-cli.ts` · `src/schedule-cli.ts`
- `agents/_template/{CLAUDE.md, agent.yaml, workspace/}` then `main`,
  `comms`, `content`, `ops`, `research`
- DB migrations: `hive_mind`, `scheduled_tasks`, `mission_tasks`

Roster:

| Agent ID | Persona                       | MCP allowlist            |
|----------|-------------------------------|--------------------------|
| main     | Hand of the King (Charon)     | Bash, Read, Write, Grep  |
| comms    | Master of Whisperers (Aoede)  | Gmail, Slack, Calendar   |
| content  | Royal Bard (Leda)             | Read, Write, Web         |
| ops      | Master of War (Alnilam)       | Bash, Read, Write        |
| research | Grand Maester (Kore)          | Read, Web, Context7      |

Verification: `npm run schedule create "0 9 * * 1" "@research: weekly inbox"`
fires within 60 s of next match. `@research:` routes only to research;
`@all:` broadcasts. Hive-mind row written per agent response.

---

## Phase 4 — Channels Expansion + Voice + Media

- `src/whatsapp.ts` (whatsapp-web.js + qrcode-terminal)
- `src/slack.ts` (@slack/web-api + Events API)
- `src/voice.ts` — STT cascade (Groq Whisper → whisper-cpp);
  TTS cascade (ElevenLabs eleven_turbo_v2_5 → Gradium → Kokoro → `say`)
- `src/media.ts` — image/video → Gemini analysis
- `.env.example` — GROQ_API_KEY, ELEVENLABS_API_KEY, KOKORO_URL,
  GRADIUM_API_KEY, WHISPER_MODEL_PATH, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET

Verification: WhatsApp QR pair + round-trip; Slack slash command;
voice-note round-trip; remove GROQ_API_KEY → fallback without crash.

---

## Phase 5 — War Room + Meeting Bot + Dashboard

TypeScript:
- `src/dashboard.ts` (Hono `:3141` + SSE)
- `src/dashboard-html.ts` (~3,200 LOC embedded SPA)
- `src/agent-voice-bridge.ts` (Node ↔ Python WS bridge)
- `src/meet-cli.ts`
- `skills/pikastream-video-meeting/SKILL.md`

Python (`warroom/`, Python 3.10+):
- `requirements.txt` — `pipecat-ai[websocket,deepgram,cartesia,silero]==0.0.75`
- `server.py` (`:7860`) · `router.py` · `personas.py` · `agent_bridge.py`
- `config.py` · `voices.json`
- `warroom/warroom-html.ts` (69 KB cinematic UI, boardroom intro)

Cross-cutting:
- `scripts/setup.ts` (interactive wizard, launchd/systemd unit install)
- `scripts/status.ts`

Final `.env.example` additions:

```
WARROOM_ENABLED=true
WARROOM_MODE=live           # live | legacy
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
SECURITY_PIN_HASH=salt:hash
IDLE_LOCK_MINUTES=30
EMERGENCY_KILL_PHRASE=shutdown everything now
DASHBOARD_TOKEN=
DASHBOARD_PORT=3141
PIKA_API_KEY=
RECALL_API_KEY=
```

Verification: dashboard renders all panels; war-room transcribes within 1 s;
`npm run meet join …` runs 75 s pre-flight, joins via Pika.

---

## End-to-end Verification

1. `npm install`
2. `npm run build`
3. `npm run typecheck`
4. `npm test` — Vitest, target 80 % coverage
5. `npm run setup`
6. Smoke matrix: Telegram DM · memory recall · `@research:` routing ·
   WhatsApp voice round-trip · War Room + dashboard live update
7. Security drill: PIN lock · `[REDACTED]` · kill phrase exits process

---

## Critical File Sizes (estimated)

| File                        | First touched | Final LOC |
|-----------------------------|---------------|-----------|
| `src/db.ts`                 | Phase 1       | ~600      |
| `src/agent.ts`              | Phase 1       | ~400      |
| `src/index.ts`              | Phase 1       | ~500      |
| `src/memory.ts`             | Phase 2       | ~350      |
| `src/security.ts`           | Phase 2       | ~215      |
| `src/orchestrator.ts`       | Phase 3       | ~450      |
| `src/voice.ts`              | Phase 4       | ~504      |
| `src/dashboard.ts`          | Phase 5       | ~1,370    |
| `src/dashboard-html.ts`     | Phase 5       | ~3,200    |
| `warroom/server.py`         | Phase 5       | ~600      |
| `warroom/warroom-html.ts`   | Phase 5       | ~2,500    |

---

## Reused Patterns

- `readEnvFile()` from REBUILD_PROMPT_V2 STEP 4 (do **not** use `dotenv`)
- Composite-key session storage (`chat_id+agent_id`)
- Inline `PRAGMA table_info()` migrations (POWER_PACKS Memory v2)
- 5-layer retrieval (POWER_PACKS Memory v2)
- GoT persona naming (POWER_PACKS Multi-Agent + War Room)
- Pipecat dual-mode Gemini Live / Legacy (POWER_PACKS War Room)

---

## Out of Scope

- Discord adapter
- iOS / Android native clients
- Multi-tenant hosted deployment
- Plugin marketplace beyond the 8 documented Power Packs
