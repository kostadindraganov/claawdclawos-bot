# CLAUDECLAW OS

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D20.0-brightgreen.svg)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)

Self-hostable multi-agent Claude orchestrator. Persistent memory, voice I/O,
war room, security gating, mission scheduling, and a dashboard.

## Repository layout

```
docs/
  PLAN.md             # 5-phase development plan
  PRD.md              # Product Requirements Document
  TECHNICAL_SPEC.md   # Architecture, DB schema, env contract, API surface
  TASK_BREAKDOWN.md   # Phase checklist with verification commands
src/                  # TypeScript source (Phase 1+)
agents/_template/     # Agent template (Phase 3)
warroom/              # Pipecat Python war room (Phase 5)
skills/               # Skill packages (Phase 5)
scripts/              # setup.ts, status.ts (Phase 5)
.env.example          # Authoritative env-var contract
package.json          # Node dependencies pinned in TECHNICAL_SPEC §14
tsconfig.json         # ESM + strict + NodeNext
```

## Quick start

```bash
npm run setup         # interactive wizard (creates .env & installs keys)
npm install           # install node dependencies
npm run build         # compile typescript
npm run dev           # start in dev mode
```

## Status

- [x] Phase 0 — documentation & scaffold
- [x] Phase 1 — core engine (Telegram + SQLite sessions)
- [x] Phase 2 — Memory v2 + Security
- [x] Phase 3 — Multi-Agent + Mission Control
- [x] Phase 4 — WhatsApp + Slack + Voice
- [x] Phase 5 — War Room + Meeting Bot + Dashboard

See `docs/TASK_BREAKDOWN.md` for per-phase acceptance commands.

## 🔑 Where to get API Keys

CLAUDECLAW OS relies on several external APIs for intelligence, voice, and integrations. Run `npm run setup` to configure them interactively, or add them to your `.env` file manually.

| Environment Variable | Required | Platform / Link | Description |
|----------------------|----------|-----------------|-------------|
| **ANTHROPIC_API_KEY** | Yes | [Anthropic Console](https://console.anthropic.com/) | Powers the core Claude 3.5 Sonnet agent logic. |
| **TELEGRAM_BOT_TOKEN** | Yes | [BotFather on Telegram](https://t.me/BotFather) | The primary messaging interface. |
| **GOOGLE_API_KEY** | Yes* | [Google AI Studio](https://aistudio.google.com/) | 768-D embeddings for Vector Memory, Multimodal Vision, and Gemini Live (`live` War Room mode). |
| **GROQ_API_KEY** | Optional | [Groq Cloud](https://console.groq.com/) | Primary super-fast Speech-to-Text inference using Whisper Large V3. |
| **ELEVENLABS_API_KEY** | Optional | [ElevenLabs](https://elevenlabs.io/) | Premium TTS voices for agent responses. |
| **DEEPGRAM_API_KEY** | Optional | [Deepgram](https://console.deepgram.com/) | Used for `legacy` War Room Speech-to-Text transcription. |
| **CARTESIA_API_KEY** | Optional | [Cartesia](https://cartesia.ai/) | Used for `legacy` War Room Text-to-Speech voices. |
| **PIKA_API_KEY** | Optional | [PikaStream](https://pika.art) | Generating avatar sequences for the Meeting Bot. |
| **RECALL_API_KEY** | Optional | [Recall.ai](https://recall.ai/) | WebRTC meeting hooks (Zoom / Google Meet) for the Meeting Bot. |
| **SLACK_BOT_TOKEN** | Optional | [Slack API](https://api.slack.com/) | For Slack workspace integration. |

*\* Google API Key is required for long-term memory embeddings to function properly.*

---

## 🚀 How to Use

CLAUDECLAW OS is designed with multiple surfaces. Depending on what you want to achieve, you can start the components independently.

### 1. The Core Agent (Telegram / Background)
Start the primary system orchestrator, Telegram bot listener, and automated background schedulers:
```bash
npm run dev
```
* **Interact:** Open Telegram and message your registered bot. Send code snippets, ask questions, or upload media.
* **Security:** First message will prompt for your configured Security PIN to unlock the agent.
* **Commands:** Type `/help` in Telegram for a list of power commands.

### 2. The Dashboard
View your agent's memory, live mission statuses, and system audit logs via a standalone Web Dashboard:
```bash
# Handled alongside 'npm run dev' automatically.
# Available at: http://localhost:3141?token=<YOUR_DASHBOARD_TOKEN>
```

### 3. The War Room (Voice Council)
Interact with your 5-agent council live over voice (like a virtual boardroom):
```bash
npm run warroom
```
* Note: The War Room requires Python 3.10+ installed. The Node `src/agent-voice-bridge.ts` will attempt to automatically run the underlying Python Pipecat backend.
* First time setup: `cd warroom && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
* Open `http://localhost:7860` in your browser, press the microphone, and speak to "Hand of the King", "Master of Whisperers", etc.

### 4. CLI Commands
The platform includes built-in CLI apps to queue long-running missions, schedule cron jobs, or dispatch meeting bots without touching chat interfaces.

**Mission Queue (Run massive tasks in the background):**
```bash
npm run mission -- add "Research all competitors in the AI code editor space" --priority 9
npm run mission -- list
```

**Scheduled Tasks (Cron polling):**
```bash
npm run schedule -- create "0 9 * * *" "Trigger daily standup briefing to comms agent"
npm run schedule -- list
```

**Meeting Bot:**
```bash
npm run meet -- join <calendar_event_id>
npm run meet -- leave <session_id>
```

**Health Status:**
```bash
npm run status
```

## Source documents
The build is derived from documents in the `docs/` folder, including a full Technical Spec (`docs/TECHNICAL_SPEC.md`).

## Out of scope
Discord adapter, mobile native clients, hosted multi-tenant SaaS.
