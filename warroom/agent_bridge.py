"""Agent bridge — forwards utterances to the Node.js server via WebSocket."""

import asyncio
import json
import logging
from typing import Optional

try:
    import websockets
    from websockets.asyncio.client import connect as ws_connect
except ImportError:
    websockets = None  # type: ignore

logger = logging.getLogger("warroom.bridge")


class AgentBridge:
    """WebSocket bridge to the Node.js agent-voice-bridge server."""

    def __init__(self, node_bridge_url: str = "ws://localhost:7861"):
        self.url = node_bridge_url
        self._ws: Optional[object] = None
        self._lock = asyncio.Lock()

    async def _ensure_connection(self):
        """Ensure we have a live WebSocket connection."""
        if websockets is None:
            raise RuntimeError("websockets package not installed")

        if self._ws is None:
            async with self._lock:
                if self._ws is None:
                    self._ws = await ws_connect(self.url)
                    logger.info(f"Bridge connected to {self.url}")

    async def send_utterance(
        self,
        agent_id: str,
        text: str,
        session_id: str,
    ) -> Optional[str]:
        """
        Send an utterance to the Node.js server for processing.

        Args:
            agent_id: Target agent ID
            text: User's spoken text
            session_id: War Room session ID

        Returns:
            Agent's text response, or None on failure
        """
        try:
            await self._ensure_connection()

            payload = json.dumps({
                "type": "utterance",
                "agent_id": agent_id,
                "text": text,
                "session_id": session_id,
                "ts": asyncio.get_event_loop().time(),
            })

            await self._ws.send(payload)  # type: ignore
            response = await asyncio.wait_for(
                self._ws.recv(),  # type: ignore
                timeout=30.0,
            )

            data = json.loads(response)
            return data.get("text", "")

        except Exception as e:
            logger.error(f"Bridge error: {e}")
            self._ws = None
            return None

    async def log_to_hive_mind(
        self,
        agent_id: str,
        action: str,
        payload: dict,
        session_id: str,
    ) -> None:
        """Log an event to the hive mind via the Node bridge."""
        try:
            await self._ensure_connection()
            msg = json.dumps({
                "type": "hive_mind",
                "agent_id": agent_id,
                "action": action,
                "payload": payload,
                "session_id": session_id,
            })
            await self._ws.send(msg)  # type: ignore
        except Exception as e:
            logger.warning(f"Hive mind log failed: {e}")

    async def close(self):
        """Close the WebSocket connection."""
        if self._ws:
            await self._ws.close()  # type: ignore
            self._ws = None
