"""War Room configuration — loads env vars and voices.json."""

import json
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Literal

WARROOM_DIR = Path(__file__).parent


@dataclass
class WarRoomConfig:
    """Runtime configuration for the War Room server."""

    mode: Literal["live", "legacy"] = "live"
    port: int = 7860

    # API keys (from environment)
    google_api_key: str = ""
    deepgram_api_key: str = ""
    cartesia_api_key: str = ""
    anthropic_api_key: str = ""
    elevenlabs_api_key: str = ""

    # Node bridge URL for hive-mind writes
    node_bridge_url: str = "ws://localhost:7861"

    # Voices map
    voices: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "WarRoomConfig":
        """Load config from environment variables."""
        # Load .env from parent dir if python-dotenv is available
        try:
            from dotenv import load_dotenv
            env_path = WARROOM_DIR.parent / ".env"
            if env_path.exists():
                load_dotenv(env_path)
        except ImportError:
            pass

        voices_path = WARROOM_DIR / "voices.json"
        voices = {}
        if voices_path.exists():
            with open(voices_path) as f:
                voices = json.load(f)

        return cls(
            mode=os.getenv("WARROOM_MODE", "live"),  # type: ignore
            port=int(os.getenv("WARROOM_PORT", "7860")),
            google_api_key=os.getenv("GOOGLE_API_KEY", ""),
            deepgram_api_key=os.getenv("DEEPGRAM_API_KEY", ""),
            cartesia_api_key=os.getenv("CARTESIA_API_KEY", ""),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY", ""),
            node_bridge_url=os.getenv("NODE_BRIDGE_URL", "ws://localhost:7861"),
            voices=voices,
        )
