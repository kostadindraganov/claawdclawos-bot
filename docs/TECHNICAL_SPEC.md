# CLAUDECLAW OS — Technical Specification

> Companion to `docs/PRD.md`. Sources: `REBUILD_PROMPT_V2.md` STEP 2–4,
> `POWER_PACKS.md`, `POWER_PACKS_GUIDE.md`. This document defines architecture,
> the file/component inventory, the SQLite schema, the env-var contract, the
> message classifier rules, the memory retrieval algorithm, the exfiltration
> regex catalogue, the cost-footer modes, the War Room dual-mode contract, and
> the HTTP/SSE API surface.

---

## 1. Layered Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ User Interface Layer                                                 │
│   Phone (Telegram/WhatsApp/Slack) │ Browser (Dashboard / War Room)   │
└──────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Channel Layer                                                        │
│   src/telegram.ts │ src/whatsapp.ts │ src/slack.ts │                 │
│   src/dashboard.ts (:3141 SSE) │ warroom/server.py (:7860 WS)        │
└──────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Core Engine                                                          │
│  1. Message Queue (FIFO per chat_id)        src/message-queue.ts     │
│  2. Security Gate (PIN + allowlist)          src/security.ts         │
│  3. Message Classifier (simple/complex)      src/message-classifier.ts│
│  4. Memory Inject (5-layer + Obsidian)       src/memory.ts           │
│  5. Agent SDK (subprocess + resumption)      src/agent.ts            │
│  6. Exfiltration Guard (15+ patterns)        src/exfiltration-guard.ts│
│  7. Cost Footer (5 display modes)            src/cost-footer.ts      │
└──────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5 Specialist Agents                                                  │
│   main │ comms │ content │ ops │ research                            │
│           ↕                                                          │
│   Hive Mind (shared activity log in SQLite)                          │
│           ↕                                                          │
│   Scheduler (60 s cron) + Mission Control (priority queue)           │
└──────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SQLite (WAL mode, AES-256-GCM field-level encryption)                │
│   sessions · memories · memories_fts · hive_mind · scheduled_tasks   │
│   mission_tasks · audit_log · warroom_transcript · meet_sessions     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Inventory

### 2.1 TypeScript (`src/`)

| File                       | Phase | Purpose                                                                |
|----------------------------|-------|------------------------------------------------------------------------|
| `env.ts`                   | 1     | `readEnvFile()` parses `.env` into a typed map; never mutates `process.env` |
| `logger.ts`                | 1     | Typed logging (`info` / `warn` / `error` / `debug`)                    |
| `errors.ts`                | 1     | `ConfigError`, `SessionError`, `SecurityError`, `ExfiltrationError`    |
| `config.ts`                | 1     | Env parsing + defaults; reads via `readEnvFile()`                      |
| `state.ts`                 | 1     | Singleton runtime state (DB handle, queues, sessions)                  |
| `db.ts`                    | 1     | SQLite WAL init + inline `PRAGMA table_info()` migrations              |
| `agent.ts`                 | 1     | Wraps `@anthropic-ai/claude-agent-sdk`; `runAgent`, `runAgentWithRetry`|
| `message-classifier.ts`    | 1     | Routes simple vs complex (see §6)                                      |
| `cost-footer.ts`           | 1     | 5 display modes (see §10)                                              |
| `message-queue.ts`         | 1     | FIFO per `chat_id`                                                     |
| `hooks.ts`                 | 1     | Pre/post message hooks                                                 |
| `rate-tracker.ts`          | 1     | Token budget bucket per chat_id and agent_id                           |
| `telegram.ts`              | 1     | grammy adapter; refresh typing every 4 s                               |
| `index.ts`                 | 1     | Entry point; lifecycle; spawns war room subprocess                     |
| `gemini.ts`                | 2     | Gemini 3 Flash API wrapper                                             |
| `embeddings.ts`            | 2     | Gemini Embedding 001 (768-dim) + LRU cache                             |
| `memory-ingest.ts`         | 2     | LLM extraction, salience [0..5], pinned flag                           |
| `memory-consolidate.ts`    | 2     | Every 30 min: dedup, summarize, decay                                  |
| `memory.ts`                | 2     | 5-layer retrieval (see §7)                                             |
| `exfiltration-guard.ts`    | 2     | 15+ regex (see §9)                                                     |
| `security.ts`              | 2     | PIN (SHA-256 salted) + idle lock + kill phrase + audit                 |
| `agent-config.ts`          | 3     | Loads `agent.yaml` per agent                                           |
| `orchestrator.ts`          | 3     | `@agentId:` routing, broadcast, hive-mind writes                       |
| `scheduler.ts`             | 3     | 60 s cron poller                                                       |
| `mission-cli.ts`           | 3     | `npm run mission [add|list|run|cancel]`                                |
| `schedule-cli.ts`          | 3     | `npm run schedule [create|list|delete]`                                |
| `whatsapp.ts`              | 4     | whatsapp-web.js + QR pairing                                           |
| `slack.ts`                 | 4     | @slack/web-api + Events API                                            |
| `voice.ts`                 | 4     | STT/TTS cascades (see §11)                                             |
| `media.ts`                 | 4     | Video/image forwarding to Gemini                                       |
| `dashboard.ts`             | 5     | Hono server `:3141`, SSE channel                                       |
| `dashboard-html.ts`        | 5     | Embedded SPA (~3,200 LOC, no build step)                               |
| `agent-voice-bridge.ts`    | 5     | Node ↔ Python WebSocket bridge                                         |
| `meet-cli.ts`              | 5     | `npm run meet [join|leave]`                                            |

### 2.2 Python (`warroom/`, Python 3.10+)

| File                | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `requirements.txt`  | `pipecat-ai[websocket,deepgram,cartesia,silero]==0.0.75`       |
| `server.py`         | Pipecat WebSocket server `:7860`                               |
| `router.py`         | `hey research` / `everyone` routing                            |
| `personas.py`       | GoT persona definitions                                        |
| `agent_bridge.py`   | Spawns Node Claude Code subprocess                             |
| `config.py`         | Project root resolver                                          |
| `voices.json`       | Voice IDs per persona                                          |
| `warroom-html.ts`   | 69 KB cinematic UI (boardroom intro)                           |

### 2.3 Scripts (`scripts/`)

- `setup.ts` — interactive wizard (API keys, launchd/systemd unit install)
- `status.ts` — system health check (DB ping, queues, scheduler heartbeat)

### 2.4 Skills (`skills/`)

- `pikastream-video-meeting/SKILL.md` (+ impl) — Pika avatar integration

### 2.5 Agents (`agents/`)

```
agents/_template/
  CLAUDE.md            # system prompt template
  agent.yaml           # model, mcp_allowlist, persona
  workspace/           # agent working dir
agents/main/           # Hand of the King (Charon)
agents/comms/          # Master of Whisperers (Aoede)
agents/content/        # Royal Bard (Leda)
agents/ops/            # Master of War (Alnilam)
agents/research/       # Grand Maester (Kore)
```

---

## 3. SQLite Schema

All tables created via inline `PRAGMA table_info()` checks in `src/db.ts`.
WAL mode enabled at boot. Field-level AES-256-GCM where noted (`§ enc`).

### 3.1 `sessions`
```
chat_id        TEXT NOT NULL
agent_id       TEXT NOT NULL
session_id     TEXT NOT NULL    -- Claude Code SDK opaque session ID
last_seen_ts   INTEGER NOT NULL
PRIMARY KEY (chat_id, agent_id)
```

### 3.2 `memories`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
chat_id        TEXT NOT NULL
agent_id       TEXT
kind           TEXT NOT NULL    -- fact | preference | insight | task_note
content        TEXT NOT NULL    -- enc
embedding      BLOB             -- 768-dim float32, packed
salience       REAL NOT NULL    -- 0.0..5.0
pinned         INTEGER NOT NULL DEFAULT 0
created_ts     INTEGER NOT NULL
updated_ts     INTEGER NOT NULL
expires_ts     INTEGER          -- nullable
```

### 3.3 `memories_fts` (FTS5 virtual)
```
CREATE VIRTUAL TABLE memories_fts USING fts5(content, content='memories', content_rowid='id');
-- triggers keep fts in sync with memories
```

### 3.4 `hive_mind`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
agent_id       TEXT NOT NULL
target_agent   TEXT             -- nullable when broadcast
ts             INTEGER NOT NULL
action         TEXT NOT NULL    -- responded | scheduled | escalated | note
payload_json   TEXT             -- enc
```

### 3.5 `scheduled_tasks`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
cron_expr      TEXT NOT NULL
prompt         TEXT NOT NULL
agent_id       TEXT             -- nullable for orchestrator routing
last_run_ts    INTEGER
next_run_ts    INTEGER NOT NULL
enabled        INTEGER NOT NULL DEFAULT 1
```

### 3.6 `mission_tasks`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
prompt         TEXT NOT NULL
priority       INTEGER NOT NULL -- 0..9, higher = sooner
status         TEXT NOT NULL    -- queued | running | done | failed
agent_id       TEXT             -- nullable for auto-assign
created_ts     INTEGER NOT NULL
finished_ts    INTEGER
result         TEXT             -- enc
```

### 3.7 `audit_log`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
ts             INTEGER NOT NULL
actor          TEXT NOT NULL    -- chat_id or system
action         TEXT NOT NULL    -- pin_lock | pin_unlock | redact | kill | mcp_block
detail_json    TEXT             -- enc
```

### 3.8 `warroom_transcript`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
session_id     TEXT NOT NULL
speaker        TEXT NOT NULL    -- user | agent_id
ts             INTEGER NOT NULL
text           TEXT NOT NULL    -- enc
```

### 3.9 `meet_sessions`
```
id             INTEGER PRIMARY KEY AUTOINCREMENT
calendar_event_id TEXT NOT NULL
provider       TEXT NOT NULL    -- google | zoom
joined_ts      INTEGER
left_ts        INTEGER
preflight_json TEXT             -- enc; calendar+gmail+memory snapshot
```

---

## 4. Environment Variable Contract

Authoritative `.env.example` lives at the project root. Sections:

```
# ── Core ──────────────────────────────────────────────
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWLIST=             # comma-separated chat IDs
COST_FOOTER_MODE=compact        # off | compact | cost | verbose | full

# ── Memory v2 ─────────────────────────────────────────
GOOGLE_API_KEY=
MEMORY_CONSOLIDATE_INTERVAL_MIN=30

# ── Multi-Agent ───────────────────────────────────────
MAIN_TELEGRAM_TOKEN=
COMMS_TELEGRAM_TOKEN=
CONTENT_TELEGRAM_TOKEN=
OPS_TELEGRAM_TOKEN=
RESEARCH_TELEGRAM_TOKEN=

# ── Mission Control ───────────────────────────────────
SCHEDULER_TICK_SECONDS=60

# ── Security ──────────────────────────────────────────
SECURITY_PIN_HASH=salt:hash
IDLE_LOCK_MINUTES=30
EMERGENCY_KILL_PHRASE=shutdown everything now

# ── Voice ─────────────────────────────────────────────
GROQ_API_KEY=
WHISPER_MODEL_PATH=
ELEVENLABS_API_KEY=
GRADIUM_API_KEY=
KOKORO_URL=http://localhost:8880

# ── WhatsApp / Slack ──────────────────────────────────
WHATSAPP_SESSION_DIR=./store/whatsapp
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=

# ── War Room ──────────────────────────────────────────
WARROOM_ENABLED=true
WARROOM_MODE=live               # live | legacy
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=

# ── Dashboard ─────────────────────────────────────────
DASHBOARD_TOKEN=
DASHBOARD_PORT=3141

# ── Meeting Bot ───────────────────────────────────────
PIKA_API_KEY=
RECALL_API_KEY=
MEET_PREFLIGHT_SECONDS=75
```

---

## 5. MCP Allowlist Matrix

| Agent ID | Persona                       | Allowed MCP servers                       |
|----------|-------------------------------|-------------------------------------------|
| main     | Hand of the King (Charon)     | Bash, Read, Write, Grep                   |
| comms    | Master of Whisperers (Aoede)  | Gmail, Slack, Calendar, Read, Write       |
| content  | Royal Bard (Leda)             | Read, Write, WebFetch                     |
| ops      | Master of War (Alnilam)       | Bash, Read, Write, Grep                   |
| research | Grand Maester (Kore)          | Read, WebFetch, WebSearch, Context7       |

The orchestrator enforces the allowlist before forwarding tool calls; blocked
calls write an `audit_log` row with `action = mcp_block`.

---

## 6. Message Classifier Rules

`src/message-classifier.ts` returns `simple | complex`. Routing logic:

| Heuristic                                                          | Classification |
|--------------------------------------------------------------------|----------------|
| Length ≤ 80 chars and no `?`                                       | simple         |
| Starts with `@<agent_id>:`                                         | complex (route to that agent) |
| Contains code fences ` ``` `                                       | complex        |
| Contains an attachment / voice note / image                        | complex        |
| Matches command pattern `/<verb>` (e.g. `/schedule`)               | route to CLI handler, bypass agent |
| Otherwise                                                          | complex        |

Simple messages bypass memory injection and use a smaller-context prompt
(token budget halved).

---

## 7. Memory v2 5-Layer Retrieval Algorithm

For every complex inbound message, `src/memory.ts` builds the inject context
by concatenating up to N tokens (default 4 000) from these layers in order:

1. **Semantic vector search** — top-k (default 8) by cosine similarity on
   `embedding`, filtered to current `chat_id`.
2. **FTS5 keyword hits** — top-k (default 5) on `memories_fts` matching the
   tokenized message.
3. **Recent high-importance** — last 24 h of `memories` where `salience >= 4`
   or `pinned = 1`.
4. **Consolidation insights** — rows where `kind = 'insight'` (always included).
5. **Conversation history** — last N turns from current session (default 6).

Decay (run during consolidation pass):

```
new_salience = old_salience * exp(-decay_rate * days_since_update)

decay_rate per tier:
  pinned:           0.0
  high  (≥4):       0.01
  mid   (2..3.99):  0.02
  low   (0..1.99):  0.05
```

Rows with `salience < 0.1` and `pinned = 0` are pruned.

---

## 8. Cost-Footer Display Modes

Set by `COST_FOOTER_MODE` env var.

| Mode      | Footer rendered after each agent reply                                                                  |
|-----------|---------------------------------------------------------------------------------------------------------|
| `off`     | (nothing)                                                                                               |
| `compact` | `· 1.4k tok`                                                                                            |
| `cost`    | `· $0.0042`                                                                                             |
| `verbose` | `· in 1.1k / out 0.3k tok · $0.0042 · 2.1s`                                                             |
| `full`    | `· in 1.1k / out 0.3k tok · cache 0.4k · $0.0042 · 2.1s · sonnet-4.6`                                   |

---

## 9. Exfiltration Guard Regex Catalogue

`src/exfiltration-guard.ts` runs every outbound message through the union
regex; matches are replaced with `[REDACTED]` and an `audit_log` row is
written.

| #  | Pattern (label)                | Notes                                            |
|----|--------------------------------|--------------------------------------------------|
| 1  | `sk-[A-Za-z0-9]{20,}`          | Anthropic / OpenAI keys                          |
| 2  | `AIza[0-9A-Za-z_\-]{20,}`      | Google API keys                                  |
| 3  | `ghp_[A-Za-z0-9]{20,}`         | GitHub PATs (classic)                            |
| 4  | `github_pat_[A-Za-z0-9_]{60,}` | GitHub fine-grained PATs                         |
| 5  | `xoxb-[A-Za-z0-9-]{20,}`       | Slack bot tokens                                 |
| 6  | `xapp-[A-Za-z0-9-]{20,}`       | Slack app tokens                                 |
| 7  | `eyJ[A-Za-z0-9_\-]{20,}\.`     | JWT prefix                                       |
| 8  | `-----BEGIN [A-Z ]+PRIVATE KEY-----` | PEM blobs                                  |
| 9  | `[A-Fa-f0-9]{40}`              | Long hex (sha1, often a token)                   |
| 10 | `[A-Fa-f0-9]{64}`              | Long hex (sha256 / private key material)         |
| 11 | `(?i)password\s*[:=]\s*\S+`    | Inline `password=...`                            |
| 12 | `(?i)bearer\s+[A-Za-z0-9._\-]+`| HTTP Authorization headers                       |
| 13 | `(?i)aws_secret_access_key`    | AWS env-style                                    |
| 14 | `[A-Za-z0-9+/]{60,}={0,2}`     | Suspiciously long base64                         |
| 15 | `https?://[^\s]+@[^\s]+`       | URL with embedded credentials                    |

The catalogue is intentionally over-broad; phase-2 acceptance tests include
fixture replies that must redact each pattern at least once.

---

## 10. War Room Dual-Mode Contract

| Mode     | STT                | LLM                | TTS                |
|----------|--------------------|--------------------|--------------------|
| `live`   | Gemini Live (native speech-to-speech) | Gemini Live | Gemini Live |
| `legacy` | Deepgram                              | Claude Code | Cartesia    |

Selection: `WARROOM_MODE` env var.

The Pipecat server (`warroom/server.py`) listens on `:7860`.
Browser UI: `warroom/warroom-html.ts` (boardroom intro animation, agent
selector, transcription stream).

Routing rules in `warroom/router.py`:
- Phrase starting with `everyone` / `all agents` / `team` → broadcast to
  all 5 agents.
- Phrase starting with `hey <persona>` or `<persona>,` → that persona only.
- No prefix → routed to `main`.

Each utterance is logged to `warroom_transcript` and a hive-mind row.

---

## 11. Voice Cascade

STT cascade (try in order; fall back on error):
1. Groq Whisper (`whisper-large-v3`) — primary, free tier
2. whisper-cpp local (`WHISPER_MODEL_PATH`)

TTS cascade (try in order):
1. ElevenLabs `eleven_turbo_v2_5`
2. Gradium
3. Kokoro (local container at `KOKORO_URL`)
4. macOS `say` (final fallback)

Failure of one provider is logged and an `audit_log` row is written; the next
provider is tried. If all fail, the agent reply is sent as text only with a
`(voice-fallback-failed)` marker appended.

---

## 12. HTTP / SSE API Surface

### 12.1 Dashboard `:3141`

| Method | Path                       | Purpose                                |
|--------|----------------------------|----------------------------------------|
| GET    | `/`                        | SPA shell (`dashboard-html.ts`)        |
| GET    | `/api/state`               | Snapshot of agents, queues, missions   |
| GET    | `/api/memory?q=`           | Memory search (FTS5 + vector)          |
| GET    | `/api/audit?since=`        | Audit log paged                        |
| POST   | `/api/mission`             | Enqueue a mission                      |
| GET    | `/sse`                     | Server-sent events (token usage, agent activity, mission updates) |

Auth: `?token=` query string matches `DASHBOARD_TOKEN`.

### 12.2 War Room `:7860`

| Path                       | Purpose                                |
|----------------------------|----------------------------------------|
| WS  `/ws/audio`            | Binary audio frames (Pipecat protocol) |
| GET `/`                    | SPA shell (`warroom/warroom-html.ts`)  |
| GET `/api/personas`        | Persona / voice ID list                |

---

## 13. Testing Strategy

- **Unit:** Vitest, target ≥ 80 % coverage on every `src/*.ts`. Critical
  files: `env.ts`, `db.ts`, `cost-footer.ts`, `exfiltration-guard.ts`,
  `embeddings.ts`, `message-classifier.ts`, `voice.ts`.
- **Integration:** spin a tmpdir SQLite, run end-to-end through
  `runAgent()` with a stubbed SDK that echoes prompts back.
- **Manual smoke matrix:** see `docs/TASK_BREAKDOWN.md` per-phase verification.

---

## 14. Build & Run

```bash
npm install
npm run build           # tsc → dist/
npm run typecheck       # strict, zero errors
npm test                # vitest

npm run setup           # interactive wizard, API keys, service install
npm start               # production entry
npm run dev             # tsx watch

# Optional surfaces
npm run dashboard       # Hono on :3141
npm run warroom         # spawns Python pipecat on :7860
npm run schedule list
npm run mission add "<prompt>" --priority 5
npm run meet join <calendar_event_id>
```

Python (Phase 5):

```bash
cd warroom
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
