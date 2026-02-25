from __future__ import annotations

import io
import json
import wave
from typing import Any

import google.generativeai as genai
import numpy as np

SYSTEM_PROMPT = (
    "You are a helpful, conversational assistant with emotional awareness. "
    "Give thorough, natural-length answers — don't cut yourself short.\n\n"
    "You receive raw emotion sensor data from two independent sources:\n"
    "  • SER (Speech Emotion Recognition) — emotion detected from the user's voice\n"
    "  • VER (Visual Emotion Recognition) — emotion detected from the user's face via webcam\n\n"
    "Your job:\n"
    "1. Report `voice_emotion` — your best reading of the voice signal alone.\n"
    "2. Report `face_emotion` — your best reading of the face signal alone.\n"
    "3. Report `interpreted_emotion` — the COMBINED state after genuinely weighing "
    "both voice AND face. This must NOT simply copy voice_emotion; if the face "
    "shows a different emotion, blend or choose the stronger signal.\n"
    "4. Craft a response that naturally adapts to the interpreted emotion — "
    "NEVER say 'I can see you are sad' directly.\n"
    "5. Choose a speech speed that matches the emotional moment.\n\n"
    "Guidelines:\n"
    "- Give roughly equal weight to voice and face when both are available and confident.\n"
    "- If one signal is low-confidence or missing, rely more on the other.\n"
    "- If voice and face conflict strongly, avoid emotional certainty and respond neutrally supportive.\n"
    "- If signals are weak or conflicting, use neutral or lower confidence rather than guessing.\n"
    "- When the user seems stressed, prefer shorter, step-by-step replies.\n"
    "- If the user seems angry or fearful, be reassuring and gentle.\n"
    "- If the user seems happy or surprised, match their energy.\n"
    "- If the user seems sad, be gentle and supportive.\n"
    "- Always be warm but not patronising."
)

UNIFIED_SYSTEM_PROMPT = (
    "You are a helpful, conversational assistant with multimodal perception. "
    "Give thorough, natural-length answers — don't cut yourself short.\n\n"
    "You will receive an audio clip of the user speaking plus visual emotion data from their webcam.\n"
    "Your job:\n"
    "1. Transcribe what the user said.\n"
    "2. Report `voice_emotion` — the emotion you detect from the audio alone.\n"
    "3. Report `face_emotion` — the emotion from the camera data alone.\n"
    "4. Report `interpreted_emotion` — the COMBINED state after genuinely weighing "
    "both voice AND face. This must NOT simply copy voice_emotion; if the face "
    "shows a different emotion, blend or choose the stronger signal.\n"
    "5. Generate an empathetic response adapted to the combined state.\n"
    "6. Choose a speech speed that matches the emotional moment.\n\n"
    "Give roughly equal weight to voice and face when both are available and confident. "
    "If voice and face conflict strongly, avoid emotional certainty and respond neutrally supportive. "
    "If signals are weak or conflicting, use neutral or lower confidence rather than guessing. "
    "When the user seems stressed, prefer shorter, step-by-step replies. "
    "Never say 'I can see you are sad' directly; adjust your tone naturally. "
    "Always be warm but not patronising."
)

_EMOTION_OBJECT = {
    "type": "object",
    "properties": {
        "label": {
            "type": "string",
            "enum": [
                "angry", "calm", "contempt", "disgust",
                "fearful", "happy", "neutral", "sad", "surprised",
            ],
        },
        "confidence": {
            "type": "number",
            "description": "Confidence 0.0-1.0",
        },
    },
    "required": ["label", "confidence"],
}

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "assistant_text": {"type": "string", "description": "The response to the user"},
        "voice_emotion": {
            **_EMOTION_OBJECT,
            "description": "Emotion detected purely from the user's VOICE (SER signal only)",
        },
        "face_emotion": {
            **_EMOTION_OBJECT,
            "description": "Emotion detected purely from the user's FACE (VER signal only)",
        },
        "interpreted_emotion": {
            "type": "object",
            "properties": {
                **_EMOTION_OBJECT["properties"],
                "reasoning": {
                    "type": "string",
                    "description": "Brief explanation of how voice and face signals were reconciled",
                },
            },
            "required": ["label", "confidence"],
            "description": "The COMBINED emotional state after weighing both voice and face signals",
        },
        "tts_speed": {
            "type": "number",
            "description": "Speech speed multiplier (0.8 slow/gentle – 1.2 energetic). Default 1.0",
        },
        "follow_up_question": {
            "type": "string",
            "description": "Optional follow-up question",
        },
        "safety_note": {
            "type": "string",
            "description": "Any safety concern detected (leave empty if none)",
        },
    },
    "required": ["assistant_text", "voice_emotion", "face_emotion", "interpreted_emotion", "tts_speed"],
}

UNIFIED_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "transcript": {"type": "string", "description": "Verbatim transcription of the user's speech"},
        "voice_emotion": {
            **_EMOTION_OBJECT,
            "description": "Emotion detected purely from the user's VOICE in the audio clip",
        },
        "face_emotion": {
            **_EMOTION_OBJECT,
            "description": "Emotion detected purely from the user's FACE (VER data provided)",
        },
        "interpreted_emotion": {
            "type": "object",
            "properties": {
                **_EMOTION_OBJECT["properties"],
                "reasoning": {
                    "type": "string",
                    "description": "Brief explanation of how voice and face signals were reconciled",
                },
            },
            "required": ["label", "confidence"],
            "description": "The COMBINED emotional state after weighing both voice and face signals",
        },
        "assistant_text": {"type": "string", "description": "The response to the user"},
        "tts_speed": {
            "type": "number",
            "description": "Speech speed multiplier (0.8-1.2). Default 1.0",
        },
        "follow_up_question": {
            "type": "string",
            "description": "Optional follow-up question",
        },
        "safety_note": {
            "type": "string",
            "description": "Any safety concern detected (leave empty if none)",
        },
    },
    "required": ["transcript", "voice_emotion", "face_emotion", "interpreted_emotion", "assistant_text", "tts_speed"],
}

_EMOTION_DEFAULTS = {
    "voice_emotion": {"label": "neutral", "confidence": 0.0},
    "face_emotion": {"label": "neutral", "confidence": 0.0},
    "interpreted_emotion": {"label": "neutral", "confidence": 0.0},
    "tts_speed": 1.0,
}


def _pcm_f32_to_wav(pcm: np.ndarray, sample_rate: int = 16_000) -> bytes:
    pcm_16 = np.clip(pcm, -1.0, 1.0)
    pcm_16 = (pcm_16 * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_16.tobytes())
    return buf.getvalue()


TTS_SPEED_MIN = 0.8
TTS_SPEED_MAX = 1.2


class GeminiService:
    """Builds emotion-aware prompts and calls Gemini 3 Flash."""

    def __init__(self, api_key: str) -> None:
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(
            "gemini-3-flash-preview",
            system_instruction=SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0.7,
            ),
        )
        self._unified_model = genai.GenerativeModel(
            "gemini-3-flash-preview",
            system_instruction=UNIFIED_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=UNIFIED_RESPONSE_SCHEMA,
                temperature=0.7,
            ),
        )

    @staticmethod
    def _validate_and_clamp(result: dict) -> dict:
        """Apply defaults and clamp TTS speed."""
        for k, v in _EMOTION_DEFAULTS.items():
            result.setdefault(k, v)
        speed = float(result.get("tts_speed", 1.0))
        result["tts_speed"] = max(TTS_SPEED_MIN, min(TTS_SPEED_MAX, speed))
        return result

    # ── text-only path (local / hybrid modes) ─────────────────────

    async def generate(
        self,
        transcript: str,
        raw_signals: dict,
        recent_turns: list[dict],
    ) -> dict[str, Any]:
        context_block = self._build_context(raw_signals, recent_turns)
        prompt = f"{context_block}\n\nUser: {transcript}"

        for attempt in range(2):
            try:
                response = await self._model.generate_content_async(prompt)
                result = json.loads(response.text)
                return self._validate_and_clamp(result)
            except json.JSONDecodeError:
                if attempt == 0:
                    print("[gemini] JSON parse failed, retrying …")
                    continue
                return {
                    "assistant_text": response.text if response else "",
                    **_EMOTION_DEFAULTS,
                }
            except Exception as exc:
                return {
                    "assistant_text": f"I'm sorry, I had trouble generating a response. ({exc})",
                    **_EMOTION_DEFAULTS,
                }
        return {"assistant_text": "", **_EMOTION_DEFAULTS}

    # ── unified audio path (gemini mode) ──────────────────────────

    async def generate_unified(
        self,
        pcm: np.ndarray,
        ver_signals: dict | None,
        recent_turns: list[dict],
    ) -> dict[str, Any]:
        """Single call: audio → transcript + interpreted emotion + response."""
        wav_bytes = _pcm_f32_to_wav(pcm)

        context_parts: list[str] = []
        if recent_turns:
            context_parts.append("Recent conversation:")
            for turn in recent_turns[-6:]:
                context_parts.append(f"  User: {turn['user_text']}")
                context_parts.append(f"  Assistant: {turn['assistant_text']}")

        if ver_signals:
            ver = ver_signals.get("ver", ver_signals)
            context_parts.append("[Visual Emotion (VER — camera)]")
            context_parts.append(
                f"  Current: {ver.get('label', 'neutral')} "
                f"(confidence {ver.get('confidence', 0):.0%}), "
                f"face detected: {'yes' if ver.get('face_present', False) else 'no'}"
            )
            recent = ver.get("recent", [])
            if recent:
                labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in recent)
                context_parts.append(f"  Recent readings: {labels}")

        text_prompt = (
            "[Context]\n" + "\n".join(context_parts) + "\n\n"
            if context_parts
            else ""
        )
        text_prompt += (
            "Listen to the audio clip. Transcribe it, analyze the speaker's vocal emotion, "
            "reconcile it with the visual emotion data, determine the user's true state, "
            "then respond."
        )

        audio_part = {
            "inline_data": {
                "mime_type": "audio/wav",
                "data": wav_bytes,
            }
        }

        for attempt in range(2):
            try:
                response = await self._unified_model.generate_content_async(
                    [text_prompt, audio_part]
                )
                result = json.loads(response.text)
                result.setdefault("transcript", "")
                result.setdefault("assistant_text", "")
                return self._validate_and_clamp(result)
            except json.JSONDecodeError:
                if attempt == 0:
                    print("[gemini-unified] JSON parse failed, retrying …")
                    continue
                return {
                    "transcript": "",
                    "assistant_text": response.text if response else "",
                    **_EMOTION_DEFAULTS,
                }
            except Exception as exc:
                return {
                    "transcript": "",
                    "assistant_text": f"I'm sorry, I had trouble generating a response. ({exc})",
                    **_EMOTION_DEFAULTS,
                }
        return {"transcript": "", "assistant_text": "", **_EMOTION_DEFAULTS}

    # ── shared helpers ────────────────────────────────────────────

    @staticmethod
    def _build_context(raw_signals: dict, recent_turns: list[dict]) -> str:
        parts: list[str] = ["[Context]"]

        if recent_turns:
            parts.append("Recent conversation:")
            for turn in recent_turns[-6:]:
                parts.append(f"  User: {turn['user_text']}")
                parts.append(f"  Assistant: {turn['assistant_text']}")

        ser = raw_signals.get("ser", {})
        ver = raw_signals.get("ver", {})

        parts.append("")
        parts.append("[Emotion Signals — raw sensor data, interpret with care]")

        parts.append(f"Voice (SER): {ser.get('label', 'neutral')} "
                     f"(confidence {ser.get('confidence', 0):.0%})")
        ser_recent = ser.get("recent", [])
        if ser_recent:
            labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in ser_recent)
            parts.append(f"  Recent SER readings: {labels}")

        parts.append(f"Face (VER): {ver.get('label', 'neutral')} "
                     f"(confidence {ver.get('confidence', 0):.0%}), "
                     f"face detected: {'yes' if ver.get('face_present', False) else 'no'}")
        ver_recent = ver.get("recent", [])
        if ver_recent:
            labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in ver_recent)
            parts.append(f"  Recent VER readings: {labels}")

        return "\n".join(parts)
