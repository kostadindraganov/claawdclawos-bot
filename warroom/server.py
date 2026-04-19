"""
CLAUDECLAW OS — War Room Server

Pipecat-based WebSocket server for real-time voice interaction
with the agent council. Supports dual-mode operation:
  - live:   Gemini Live (native speech-to-speech)
  - legacy: Deepgram STT → Claude → Cartesia TTS

Usage:
    python server.py
    # Or via Node.js bridge: npm run warroom
"""

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import uvicorn

from config import WarRoomConfig
from personas import get_persona, get_all_personas, apply_voices, Persona
from router import route_utterance
from agent_bridge import AgentBridge

# ── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("warroom")

# ── App setup ────────────────────────────────────────────────────────────

config = WarRoomConfig.from_env()
apply_voices(config.voices)

app = FastAPI(title="CLAUDECLAW War Room", version="1.0.0")
bridge = AgentBridge(config.node_bridge_url)

# ── Session tracking ────────────────────────────────────────────────────

active_sessions: dict[str, dict] = {}


# ── HTTP endpoints ──────────────────────────────────────────────────────

@app.get("/")
async def index():
    """Serve the War Room SPA shell."""
    html_path = Path(__file__).parent / "warroom.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text())
    return HTMLResponse(
        "<h1>CLAUDECLAW War Room</h1>"
        "<p>warroom.html not found. Build the UI first.</p>"
    )


@app.get("/api/personas")
async def list_personas():
    """Return all available agent personas with voice IDs."""
    personas = get_all_personas()
    return [
        {
            "agent_id": p.agent_id,
            "name": p.name,
            "title": p.title,
            "gemini_voice": p.gemini_voice,
        }
        for p in personas
    ]


@app.get("/api/sessions")
async def list_sessions():
    """Return active War Room sessions."""
    return list(active_sessions.values())


# ── WebSocket audio pipeline ────────────────────────────────────────────

@app.websocket("/ws/audio")
async def audio_stream(websocket: WebSocket):
    """
    WebSocket endpoint for bidirectional audio streaming.

    Protocol:
    - Client sends JSON control messages and binary audio frames
    - Server sends JSON transcription/response events and binary TTS audio
    """
    await websocket.accept()
    session_id = str(uuid.uuid4())[:8]
    logger.info(f"Session {session_id}: connected")

    active_sessions[session_id] = {
        "id": session_id,
        "connected_at": time.time(),
        "mode": config.mode,
        "utterance_count": 0,
    }

    try:
        while True:
            data = await websocket.receive()

            # Handle text messages (control frames)
            if "text" in data:
                msg = json.loads(data["text"])
                msg_type = msg.get("type", "")

                if msg_type == "transcription":
                    # User's speech has been transcribed
                    text = msg.get("text", "").strip()
                    if not text:
                        continue

                    logger.info(f"Session {session_id}: '{text}'")
                    active_sessions[session_id]["utterance_count"] += 1

                    # Explicit agent_id from browser UI takes precedence over text routing
                    explicit_id = msg.get("agent_id")
                    if explicit_id:
                        persona = get_persona(explicit_id)
                        targets = [persona] if persona else []
                        clean_text = text
                    else:
                        targets, clean_text = route_utterance(text)

                    for persona in targets:
                        # Send to Node.js bridge for orchestration
                        response_text = await bridge.send_utterance(
                            agent_id=persona.agent_id,
                            text=clean_text,
                            session_id=session_id,
                        )

                        if response_text:
                            # Send response back to client
                            await websocket.send_json({
                                "type": "response",
                                "agent_id": persona.agent_id,
                                "persona": persona.name,
                                "text": response_text,
                                "session_id": session_id,
                                "ts": time.time(),
                            })

                            # Log to hive mind
                            await bridge.log_to_hive_mind(
                                agent_id=persona.agent_id,
                                action="responded",
                                payload={
                                    "source": "warroom",
                                    "utterance": text[:200],
                                    "response": response_text[:200],
                                },
                                session_id=session_id,
                            )
                        else:
                            await websocket.send_json({
                                "type": "error",
                                "agent_id": persona.agent_id,
                                "message": "Agent did not respond",
                                "session_id": session_id,
                            })

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong", "ts": time.time()})

                elif msg_type == "set_mode":
                    new_mode = msg.get("mode", config.mode)
                    if new_mode in ("live", "legacy"):
                        active_sessions[session_id]["mode"] = new_mode
                        await websocket.send_json({
                            "type": "mode_changed",
                            "mode": new_mode,
                        })

            # Handle binary messages (audio frames)
            elif "bytes" in data:
                # In live mode, audio frames are forwarded to Gemini Live
                # In legacy mode, audio frames are forwarded to Deepgram
                # For now, acknowledge receipt
                pass

    except WebSocketDisconnect:
        logger.info(f"Session {session_id}: disconnected")
    except Exception as e:
        logger.error(f"Session {session_id}: error: {e}")
    finally:
        active_sessions.pop(session_id, None)
        logger.info(f"Session {session_id}: cleaned up")


# ── Entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info(f"War Room starting on :{config.port} (mode: {config.mode})")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=config.port,
        log_level="info",
    )
