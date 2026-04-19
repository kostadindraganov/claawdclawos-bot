# PikaStream Video Meeting Skill

## Overview

This skill enables CLAUDECLAW OS to join video meetings via a Pika avatar,
providing real-time AI participation with voice, video, and screen sharing
analysis.

## Prerequisites

- `PIKA_API_KEY` — PikaStream API key for avatar generation
- `RECALL_API_KEY` — Recall.ai API key for meeting bot injection
- `GOOGLE_API_KEY` — Gemini for real-time visual analysis
- A running War Room server (for voice pipeline)

## Architecture

```
Calendar Event → Pre-flight Briefing → Pika Avatar Join →
  ┌─ Audio In  → STT → Orchestrator → Agent Response
  ├─ Audio Out → TTS → Meeting Audio
  └─ Screen    → Gemini Vision → Context Enrichment
```

## Pre-flight Pipeline

When `npm run meet join <event_id>` is executed:

1. **Calendar Pull** (t-75s): Fetch event details, attendee list, agenda
2. **Email Scan** (t-60s): Search Gmail for recent threads with attendees
3. **Memory Recall** (t-45s): Query memory for attendee preferences and history
4. **Briefing Assembly** (t-30s): Compile context into a structured briefing
5. **Avatar Ready** (t-0s): Pika avatar generated, Recall bot joins meeting

## Meeting Flow

### Joining
```bash
npm run meet join abc123-event-id --provider google
```

The bot will:
1. Run the pre-flight pipeline
2. Generate a Pika avatar with the configured persona
3. Use Recall.ai to inject the bot into the meeting
4. Start real-time audio transcription

### During Meeting
- 🎙️ **Listening**: All audio is transcribed via STT cascade
- 💬 **Responding**: Agent responses are spoken via TTS cascade
- 👁️ **Watching**: Screen shares analyzed via Gemini Vision
- 📝 **Notes**: Full transcript logged to `warroom_transcript` table
- 🧠 **Memory**: Key takeaways ingested into memory

### Leaving
```bash
npm run meet leave <session_id>
```

## Configuration

| Env Variable | Description | Required |
|-------------|-------------|----------|
| `PIKA_API_KEY` | PikaStream avatar generation | Yes |
| `RECALL_API_KEY` | Recall.ai meeting bot | Yes |
| `MEET_PREFLIGHT_SECONDS` | Pre-flight window (default: 75) | No |
| `WARROOM_MODE` | `live` or `legacy` voice mode | No |

## File Structure

```
skills/pikastream-video-meeting/
├── SKILL.md          # This file
├── preflight.ts      # Pre-flight briefing pipeline
├── avatar.ts         # Pika avatar generation
├── meeting-bot.ts    # Recall.ai meeting bot control
└── screen-reader.ts  # Gemini Vision screen analysis
```

## Status

- [x] SKILL.md specification
- [x] `meet-cli.ts` CLI interface (in `src/`)
- [x] `meet_sessions` DB table
- [ ] `preflight.ts` — Calendar + Gmail + Memory pipeline
- [ ] `avatar.ts` — Pika API integration
- [ ] `meeting-bot.ts` — Recall.ai bot injection
- [ ] `screen-reader.ts` — Real-time screen analysis

> **Note:** The Pika and Recall.ai integrations require active API keys and
> are designed to be implemented once those services are provisioned. The
> CLI and DB infrastructure is fully functional.
