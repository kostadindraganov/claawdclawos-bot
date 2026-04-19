"""Utterance router for War Room — determines which agent(s) should respond."""

import re
from personas import get_persona, get_all_personas, Persona

# Routing patterns from TECHNICAL_SPEC §10
BROADCAST_PATTERNS = re.compile(
    r"^(?:everyone|all agents?|team)\b", re.IGNORECASE
)

PERSONA_PATTERNS: dict[str, re.Pattern] = {}


def _build_persona_patterns() -> None:
    """Build regex patterns for persona-based routing."""
    for persona in get_all_personas():
        name = persona.name.lower()
        # Match "hey <persona>" or "<persona>,"
        pattern = re.compile(
            rf"^(?:hey\s+{re.escape(name)}|{re.escape(name)}\s*,)\s*",
            re.IGNORECASE,
        )
        PERSONA_PATTERNS[persona.agent_id] = pattern


_build_persona_patterns()


def route_utterance(text: str) -> tuple[list[Persona], str]:
    """
    Route an utterance to the appropriate agent(s).

    Returns:
        Tuple of (list of target personas, cleaned text)
    """
    stripped = text.strip()

    # 1. Broadcast: "everyone", "all agents", "team"
    match = BROADCAST_PATTERNS.match(stripped)
    if match:
        clean = stripped[match.end():].strip()
        return (get_all_personas(), clean or stripped)

    # 2. Persona-specific: "hey Charon" or "Charon,"
    for agent_id, pattern in PERSONA_PATTERNS.items():
        match = pattern.match(stripped)
        if match:
            clean = stripped[match.end():].strip()
            return ([get_persona(agent_id)], clean or stripped)

    # 3. Default: route to main (Charon)
    return ([get_persona("main")], stripped)
