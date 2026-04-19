# CLAUDECLAW OS — Product Requirements Document

> Source documents synthesized: `CLAUDECLAW_ASSESSMENT_PROMPT.md`,
> `REBUILD_PROMPT_V2.md` (STEP 1–2), `POWER_PACKS.md`, `POWER_PACKS_GUIDE.md`,
> `ClaudeClaw_v2_Visual_Guide.pdf`. Cross-reference:
> `docs/TECHNICAL_SPEC.md` for architecture, `docs/TASK_BREAKDOWN.md` for
> milestones.

---

## 1. Vision

CLAUDECLAW OS is a self-hostable, multi-agent AI orchestrator built on the
Anthropic Claude Code SDK. It turns Claude into a persistent "operating system
for personal AI" with a hive-mind activity log, importance-weighted memory,
real-time voice rooms, security gating, mission scheduling, and an
observability dashboard — all running on the user's own machine, reachable
from Telegram, WhatsApp, and Slack.

The product takeaway: a single user (or a small team) gets the experience of
having a five-specialist AI team on retainer that remembers context, runs
scheduled work, joins meetings, and coordinates across messaging channels and
a browser-based war room.

---

## 2. Personas

| Persona               | Profile                                                  | Primary need                                |
|-----------------------|----------------------------------------------------------|---------------------------------------------|
| Power user / dev      | Self-host on Mac/Linux, comfortable with `npm`/`pip`     | A persistent Claude that survives restarts  |
| Founder / solopreneur | Wants automation across email, content, ops, research    | A specialist team without hiring people     |
| Privacy-first user    | Refuses cloud-only assistants                            | Local SQLite, encrypted at rest, PIN-gated  |
| Voice-first user      | Talks to assistants more than they type                  | War Room with native speech-to-speech       |
| Meeting-heavy user    | Calendar dominated by Zoom/Meet calls                    | Pre-flight briefings + meeting joiner       |

---

## 3. Problem

Existing chatbots are stateless and siloed. The user re-explains context every
session, can't compose work across channels, and gets no proactive automation.
Cloud assistants also raise privacy concerns when the workload includes
emails, calendars, and meeting transcripts.

CLAUDECLAW solves this by:

- Persisting context in a local SQLite database with field-level AES-256-GCM
- Sharing that context across 5 specialist agents via a hive-mind activity log
- Reaching the user wherever they already are (Telegram, WhatsApp, Slack,
  browser dashboard, voice room)
- Running cron-scheduled missions in the background, not only when asked

---

## 4. Success Metrics

| Metric                               | Target                                  |
|--------------------------------------|-----------------------------------------|
| Cold-start install (first reply)     | < 15 minutes including setup wizard     |
| Telegram message → reply latency     | p50 < 3 s, p95 < 8 s                    |
| Memory recall precision (hand-eval)  | ≥ 80 % on 25 manual probe queries       |
| War Room speech-to-speech latency    | < 1.5 s round-trip on Gemini Live mode  |
| Meeting pre-flight completeness      | Calendar + Gmail + Memory in 75 s window|
| Test coverage on `src/*.ts`          | ≥ 80 % (Vitest)                         |
| Process uptime (single user, daily)  | ≥ 99 % over 7 days                      |

---

## 5. Feature List

### 5.1 Core (always installed)

- Message queue (FIFO per `chat_id`)
- Security gate (PIN lock + chat-ID allowlist)
- Message classifier (simple vs complex routing)
- Memory inject (5-layer retrieval + Obsidian context import)
- Agent SDK wrapper with session resumption
- Exfiltration guard (15+ regex patterns)
- Cost footer with 5 display modes
- SQLite persistence in WAL mode

### 5.2 Power Packs (all 8 in scope for this build)

| # | Pack            | Adds                                                                             |
|---|-----------------|----------------------------------------------------------------------------------|
| 1 | Memory v2       | LLM-extracted facts, 768-dim embeddings, 5-layer retrieval, decay, consolidation |
| 2 | Multi-Agent     | 5 GoT-themed specialists (main/comms/content/ops/research) + hive mind           |
| 3 | War Room        | Browser voice room (`:7860`), Gemini Live or Deepgram+Cartesia legacy            |
| 4 | Mission Control | 60 s cron polling + priority mission queue + Gemini auto-assignment              |
| 5 | Security        | PIN, idle auto-lock, emergency kill phrase, exfiltration guard, audit log        |
| 6 | Voice Upgrade   | STT cascade (Groq → whisper-cpp), TTS cascade (ElevenLabs → Gradium → Kokoro → say) |
| 7 | Dashboard       | Hono web UI on `:3141` with memory timeline, agent cards, mission queue, SSE     |
| 8 | Meeting Bot     | Google Meet/Zoom join with Pika avatar + 75 s pre-flight briefing                |

### 5.3 Channels in scope

- Telegram (`grammy`)
- WhatsApp (`whatsapp-web.js` + `qrcode-terminal` first-run pairing)
- Slack (`@slack/web-api` + Events API)

### 5.4 Channels deferred

- Discord — out of scope for v1; entry point in `src/discord.ts` left as TODO.

---

## 6. User Journeys

### J1 — First install
1. User clones `app/`, runs `npm run setup`.
2. Wizard collects: Anthropic key, Telegram bot token, Google API key, optional
   ElevenLabs / Groq / Pika / Slack tokens.
3. Wizard installs a launchd (macOS) or systemd (Linux) unit.
4. User sends `/start` to the Telegram bot → reply within 15 minutes of clone.

### J2 — Persistent memory
1. User says "I prefer short emails" three times across two days.
2. Consolidation pass marks an insight row with `salience >= 4`.
3. Next time the comms agent drafts an email, the insight is injected as
   layer-3 retrieval and the draft is short.

### J3 — Specialist routing
1. User types `@research: latest pricing on Anthropic API`.
2. Orchestrator routes only to the research agent.
3. Result is written to the hive mind so the comms agent can reference it
   when emailing a partner the next morning.

### J4 — War Room
1. User opens `http://localhost:7860` in a browser.
2. Boardroom intro animation plays, agent cards appear.
3. User says "everyone, what's blocking the launch?"
4. All 5 personas reply with native speech via Gemini Live.

### J5 — Meeting joiner
1. Calendar event "Sales sync" starts in 75 s.
2. Pre-flight briefing pulls last 30 days of email per attendee + memory hits.
3. Pika avatar joins the meeting, voice-only by default.

### J6 — Security incident
1. User leaves laptop unlocked; 30 min idle elapses.
2. Idle auto-lock triggers; next message is blocked until `/unlock <PIN>`.
3. If a draft contains `sk-…`, exfiltration guard replaces with `[REDACTED]`
   and writes an audit row.

---

## 7. Non-Goals

- **No cloud-hosted SaaS.** CLAUDECLAW is single-tenant self-host.
- **No mobile native app.** Telegram / WhatsApp / Slack are the mobile surface.
- **No replacement for Claude Code CLI.** The SDK is wrapped, not forked.
- **No marketplace UI** for third-party Power Packs (filesystem only).
- **No fine-tuned models.** Stock Anthropic + Gemini APIs only.

---

## 8. Risks & Mitigations

| Risk                                                       | Mitigation                                                                  |
|------------------------------------------------------------|-----------------------------------------------------------------------------|
| `@anthropic-ai/claude-agent-sdk` API churn                 | Pin to `^0.2.34`, isolate in `src/agent.ts`, contract-test in Phase 1       |
| Telegram typing indicator 5 s expiry                       | Refresh every 4 s in `src/telegram.ts`                                      |
| Folder name has a space → URL encoding bugs                | Use `fileURLToPath(import.meta.url)` everywhere, not `__dirname`            |
| `dotenv` mutation of `process.env` causes test pollution   | Custom `readEnvFile()` returns a typed map; never mutate global env         |
| Gemini Embedding API rate limits                           | Local LRU cache + exponential backoff in `src/embeddings.ts`                |
| Pipecat dependency churn                                   | Pin `pipecat-ai==0.0.75`, vendor `requirements.txt`                         |
| WhatsApp Web pair drops on Chrome update                   | Documented re-pair flow + alert in dashboard SSE stream                     |
| Memory bloat → SQLite grows unbounded                      | Decay + consolidation every 30 min; pruner removes rows < salience 1        |
| Secrets leaking to bots                                    | 15+ regex patterns + base64 detection in `src/exfiltration-guard.ts`        |
| Power Pack interaction bugs (e.g., Mission Control × Sec)  | Phase-end smoke matrix; phases land green before next phase begins          |

---

## 9. Visual Identity (from `ClaudeClaw_v2_Visual_Guide.pdf`)

- ASCII-art "CLAUDECLAW" header in terminal & docs
- 15-color palette for agent cards in dashboard
- Game-of-Thrones persona naming (Hand of the King, Grand Maester, etc.)
- Naming conventions: `kebab-case` agent IDs (regex
  `^[a-z][a-z0-9_-]{0,29}$`), `snake_case` DB fields, `UPPER_CASE` env vars

---

## 10. Open Questions

(Logged here so they don't block plan approval; resolved during phase
implementation.)

1. Final tuning constants for the salience-decay exponential.
2. Per-agent MCP allowlist exact composition (placeholders set in
   `TECHNICAL_SPEC.md §5`).
3. Dashboard SSE event cadence under heavy traffic — may downgrade to
   per-message rather than per-token.
4. `MEET_PREFLIGHT_SECONDS` exposed for tuning around the documented 75 s.
5. Hive-mind cross-agent activity row exact field set (proposed:
   `agent_id, ts, action, target_agent, payload_json`).
