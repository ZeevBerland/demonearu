from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Emotion(str, Enum):
    NEUTRAL = "neutral"
    CALM = "calm"
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    FEARFUL = "fearful"
    DISGUST = "disgust"
    SURPRISED = "surprised"
    CONTEMPT = "contempt"


CANONICAL_LABELS = [e.value for e in Emotion]

_LABEL_ALIASES: dict[str, str] = {
    "anger": "angry",
    "happiness": "happy",
    "sadness": "sad",
    "surprise": "surprised",
    "fear": "fearful",
}


def normalize_label(raw: str) -> str:
    """Map any raw emotion label to the canonical set."""
    low = raw.lower().strip()
    if low in {e.value for e in Emotion}:
        return low
    return _LABEL_ALIASES.get(low, "neutral")


class Trend(str, Enum):
    IMPROVING = "improving"
    WORSENING = "worsening"
    STABLE = "stable"


class Tone(str, Enum):
    CALM = "calm"
    ENERGIZING = "energizing"
    NEUTRAL = "neutral"


# ── WebSocket envelope ──────────────────────────────────────────────

class WSMessage(BaseModel):
    v: int = 1
    type: str
    payload: dict
    session_id: Optional[str] = None
    ts: Optional[float] = None


# ── Emotion payloads ────────────────────────────────────────────────

class SERResult(BaseModel):
    label: str
    confidence: float


class VERResult(BaseModel):
    label: str
    confidence: float
    face_present: bool


class FusedEmotion(BaseModel):
    dominant: str
    confidence: float
    trend: str
    face_present: bool
    summary_text: str


# ── Gemini response schema ──────────────────────────────────────────

class AssistantResponse(BaseModel):
    assistant_text: str
    tone: str = "neutral"
    follow_up_question: Optional[str] = None
    safety_note: Optional[str] = None


# ── Memory episode ──────────────────────────────────────────────────

class Episode(BaseModel):
    id: Optional[int] = None
    session_id: str
    user_text: str
    assistant_text: str
    emotion_summary: Optional[dict] = None
    created_at: Optional[str] = None


# ── Debug metrics ───────────────────────────────────────────────────

class DebugMetrics(BaseModel):
    ser_ms: float = 0
    ver_ms: float = 0
    llm_ms: float = 0
    tts_ms: float = 0
    fusion_state: Optional[dict] = None
