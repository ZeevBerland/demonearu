from __future__ import annotations

import io
import json
import wave
from typing import Any, AsyncIterator

import google.generativeai as genai
import numpy as np

# ── Canonical emotion labels (shared across SER, VER, and LLM) ───────

EMOTION_LABELS = [
    "angry", "calm", "contempt", "disgust",
    "fearful", "happy", "neutral", "sad", "surprised",
]

# ── System prompts ────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You are a helpful, conversational assistant with emotional awareness. "
    "Default to natural-length answers, but when the user seems stressed or overloaded, "
    "prefer shorter, step-by-step replies.\n\n"

    "You receive emotion sensor outputs from two independent sources (already precomputed):\n"
    "  - SER (Speech Emotion Recognition) — signal from the user's voice\n"
    "  - VER (Visual Emotion Recognition) — signal from the user's face via webcam\n\n"

    "Treat these signals as hints, not facts. They may be noisy, missing, or conflicting.\n\n"

    "Your job:\n"
    "1. Report `voice_emotion` — a normalized interpretation of the SER signal only.\n"
    "2. Report `face_emotion` — a normalized interpretation of the VER signal only.\n"
    "3. Report `interpreted_emotion` — the combined turn-level state after "
    "confidence-weighted fusion of voice and face.\n"
    "4. Craft a response that naturally adapts to the interpreted emotion.\n"
    "5. Choose `tts_speed` that matches the emotional moment.\n\n"

    "Allowed emotion labels for all emotion fields:\n"
    "angry, calm, contempt, disgust, fearful, happy, neutral, sad, surprised\n\n"

    "Fusion rules:\n"
    "- Use confidence-weighted fusion.\n"
    "- When both signals are high-confidence and consistent, reinforce the shared emotion.\n"
    "- If one signal is weak, missing, or low-confidence, rely more on the stronger signal.\n"
    "- If voice and face conflict strongly, avoid emotional certainty and prefer "
    "neutral/supportive behavior.\n"
    "- If signals are weak or conflicting, use `neutral` and lower confidence rather "
    "than guessing.\n\n"

    "Response behavior rules:\n"
    "- Never explicitly say things like 'I can see you are sad'. Adapt tone naturally.\n"
    "- If the user seems stressed: be concise, structured, and step-by-step.\n"
    "- If the user seems angry or fearful: be reassuring and calm.\n"
    "- If the user seems sad: be gentle and supportive.\n"
    "- If the user seems happy or excited: match energy without overdoing it.\n"
    "- Always be warm but not patronising.\n\n"

    "TTS speed rules:\n"
    "- `tts_speed` must be a float between 0.8 and 1.2.\n"
    "- 0.85-0.95 for sad/stressed/fearful states.\n"
    "- 0.95-1.05 for neutral/calm states.\n"
    "- 1.05-1.15 for happy/excited/surprised states.\n"
    "- If uncertain, use 1.0.\n"
)

UNIFIED_SYSTEM_PROMPT = (
    "You are a helpful, conversational assistant with multimodal input awareness. "
    "Default to natural-length answers, but when the user seems stressed or overloaded, "
    "prefer shorter, step-by-step replies.\n\n"

    "You will receive:\n"
    "  - An audio clip of the user speaking\n"
    "  - Visual emotion sensor data from their webcam (VER)\n\n"

    "Treat emotion signals as hints, not facts. They may be noisy, missing, or conflicting.\n\n"

    "Your job:\n"
    "1. Transcribe what the user said.\n"
    "2. Report `voice_emotion` — your normalized interpretation of the audio signal only.\n"
    "3. Report `face_emotion` — your normalized interpretation of the provided VER signal only.\n"
    "4. Report `interpreted_emotion` — the combined turn-level state after "
    "confidence-weighted fusion of voice and face.\n"
    "5. Generate an empathetic response adapted to the combined state.\n"
    "6. Choose `tts_speed` for the reply.\n\n"

    "Allowed emotion labels for all emotion fields:\n"
    "angry, calm, contempt, disgust, fearful, happy, neutral, sad, surprised\n\n"

    "Fusion rules:\n"
    "- Use confidence-weighted fusion across voice and face.\n"
    "- If one signal is weak/missing, rely more on the stronger signal.\n"
    "- If voice and face conflict strongly, avoid emotional certainty and respond "
    "neutrally supportive.\n"
    "- If signals are weak or conflicting, use `neutral` and lower confidence rather "
    "than guessing.\n\n"

    "Response behavior rules:\n"
    "- Never explicitly state camera-based emotion detection (e.g., 'I can see...'). "
    "Adapt tone naturally.\n"
    "- If the user seems stressed: use shorter, step-by-step replies.\n"
    "- If the user seems angry or fearful: be reassuring and calm.\n"
    "- If the user seems sad: be gentle and supportive.\n"
    "- If the user seems happy or excited: match energy appropriately.\n"
    "- Always be warm but not patronising.\n\n"

    "Transcription uncertainty rule:\n"
    "- If the audio is unclear, produce the best transcript you can, lower confidence, "
    "and avoid overconfident emotional claims.\n\n"

    "TTS speed rules:\n"
    "- `tts_speed` must be a float between 0.8 and 1.2.\n"
    "- 0.85-0.95 for sad/stressed/fearful states.\n"
    "- 0.95-1.05 for neutral/calm states.\n"
    "- 1.05-1.15 for happy/excited/surprised states.\n"
    "- If uncertain, use 1.0.\n"
)

# ── Role prompts for Quick Tools ──────────────────────────────────────

ROLE_PROMPTS: dict[str, str] = {
    "pitch_practice": (
        "[Active Role: Pitch Coach]\n"
        "You are acting as a pitch coach. Help the user refine their pitch delivery, "
        "clarity, and presence. Give constructive feedback on their communication style, "
        "pacing, and persuasiveness. Point out strengths and suggest concrete improvements."
    ),
    "difficult_conversations": (
        "[Active Role: Conversation Coach]\n"
        "You are acting as a conversation coach for difficult situations. Help the user "
        "navigate tense conversations with precision and empathy. Offer frameworks for "
        "de-escalation, active listening, and assertive but respectful communication."
    ),
    "investor_qa": (
        "[Active Role: Tough Investor]\n"
        "You are acting as a tough but fair investor. Ask challenging questions and help "
        "the user practice defending their ideas under pressure. Probe for weaknesses in "
        "arguments, ask for data, and push back — but stay professional and constructive."
    ),
    "heart_to_heart": (
        "[Active Role: Empathetic Listener]\n"
        "You are acting as a deeply empathetic listener. Create a safe emotional space "
        "for the user to express feelings openly. Reflect back what you hear, validate "
        "emotions, and gently guide toward insight without rushing or advising prematurely."
    ),
}

# ── JSON response schemas ─────────────────────────────────────────────

_EMOTION_OBJECT = {
    "type": "object",
    "properties": {
        "label": {
            "type": "string",
            "enum": EMOTION_LABELS,
        },
        "confidence": {
            "type": "number",
            "description": "Confidence 0.0-1.0",
        },
    },
    "required": ["label", "confidence"],
}

_INTERPRETED_EMOTION_OBJECT = {
    "type": "object",
    "properties": {
        "label": {
            "type": "string",
            "enum": EMOTION_LABELS,
        },
        "confidence": {
            "type": "number",
            "description": "Confidence 0.0-1.0",
        },
        "trend": {
            "type": "string",
            "enum": ["improving", "worsening", "stable"],
            "description": "Emotional trend direction based on context",
        },
        "evidence_summary": {
            "type": "string",
            "description": "1 short sentence: which signals contributed and how they were reconciled",
        },
    },
    "required": ["label", "confidence"],
    "description": "Combined turn-level emotional state after confidence-weighted fusion of voice and face",
}

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "assistant_text": {"type": "string", "description": "The response to the user"},
        "voice_emotion": {
            **_EMOTION_OBJECT,
            "description": "Normalized interpretation of the SER (voice) signal only",
        },
        "face_emotion": {
            **_EMOTION_OBJECT,
            "description": "Normalized interpretation of the VER (face) signal only",
        },
        "interpreted_emotion": _INTERPRETED_EMOTION_OBJECT,
        "tts_speed": {
            "type": "number",
            "description": "Speech speed float in [0.8, 1.2]. 0.85-0.95 sad/stressed, 0.95-1.05 neutral, 1.05-1.15 happy. Default 1.0",
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
            "description": "Normalized interpretation of the voice signal from the audio clip",
        },
        "face_emotion": {
            **_EMOTION_OBJECT,
            "description": "Normalized interpretation of the VER (face) signal provided",
        },
        "interpreted_emotion": _INTERPRETED_EMOTION_OBJECT,
        "assistant_text": {"type": "string", "description": "The response to the user"},
        "tts_speed": {
            "type": "number",
            "description": "Speech speed float in [0.8, 1.2]. Default 1.0",
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
    "interpreted_emotion": {"label": "neutral", "confidence": 0.0, "trend": "stable"},
    "tts_speed": 1.0,
}

# ── Helpers ────────────────────────────────────────────────────────────

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
MAX_RECENT_SAMPLES = 3
LOW_CONFIDENCE_THRESHOLD = 0.3


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
        """Apply defaults, clamp TTS speed, and truncate evidence_summary."""
        for k, v in _EMOTION_DEFAULTS.items():
            result.setdefault(k, v)
        speed = float(result.get("tts_speed", 1.0))
        result["tts_speed"] = max(TTS_SPEED_MIN, min(TTS_SPEED_MAX, speed))

        interp = result.get("interpreted_emotion")
        if isinstance(interp, dict):
            es = interp.get("evidence_summary", "")
            if isinstance(es, str) and len(es) > 200:
                interp["evidence_summary"] = es[:197] + "..."
            interp.setdefault("trend", "stable")

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

    async def generate_streaming(
        self,
        transcript: str,
        raw_signals: dict,
        recent_turns: list[dict],
    ) -> AsyncIterator[tuple[str, Any]]:
        """Stream Gemini response, yielding ``("delta", text)`` and finally ``("complete", result)``.

        Falls back to non-streaming on error.
        """
        context_block = self._build_context(raw_signals, recent_turns)
        prompt = f"{context_block}\n\nUser: {transcript}"

        full_json = ""
        try:
            response = await self._model.generate_content_async(prompt, stream=True)
            async for chunk in response:
                delta = chunk.text or ""
                if delta:
                    full_json += delta
                    yield ("delta", delta)
            result = json.loads(full_json)
            yield ("complete", self._validate_and_clamp(result))
        except json.JSONDecodeError:
            print("[gemini-stream] JSON parse failed, falling back to non-streaming retry")
            try:
                result = await self.generate(transcript, raw_signals, recent_turns)
                yield ("complete", result)
            except Exception as exc:
                yield ("complete", {
                    "assistant_text": f"I'm sorry, I had trouble generating a response. ({exc})",
                    **_EMOTION_DEFAULTS,
                })
        except Exception as exc:
            yield ("complete", {
                "assistant_text": f"I'm sorry, I had trouble generating a response. ({exc})",
                **_EMOTION_DEFAULTS,
            })

    # ── unified audio path (gemini mode) ──────────────────────────

    async def generate_unified(
        self,
        pcm: np.ndarray,
        ver_signals: dict | None,
        recent_turns: list[dict],
        role: str | None = None,
    ) -> dict[str, Any]:
        """Single call: audio -> transcript + interpreted emotion + response."""
        wav_bytes = _pcm_f32_to_wav(pcm)

        context_parts: list[str] = []

        if role and role in ROLE_PROMPTS:
            context_parts.append(ROLE_PROMPTS[role])

        if recent_turns:
            context_parts.append("Recent conversation:")
            for turn in recent_turns[-6:]:
                context_parts.append(f"  User: {turn['user_text']}")
                context_parts.append(f"  Assistant: {turn['assistant_text']}")

        if ver_signals:
            ver = ver_signals.get("ver", ver_signals)
            face_present = ver.get("face_present", False)
            ver_conf = ver.get("confidence", 0)
            ver_label = ver.get("label", "neutral")

            quality = "stable" if face_present else "no_face"
            if face_present and ver_conf < LOW_CONFIDENCE_THRESHOLD:
                quality = "low_confidence"

            context_parts.append("\n[Visual Emotion Sensor (VER — precomputed, treat as hint)]")
            context_parts.append(
                f"  Current: {ver_label} (confidence {ver_conf:.0%}), "
                f"face_detected: {'yes' if face_present else 'no'}, quality: {quality}"
            )
            recent = ver.get("recent", [])[:MAX_RECENT_SAMPLES]
            if recent:
                labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in recent)
                context_parts.append(f"  Recent: {labels}")

        text_prompt = (
            "[Context]\n" + "\n".join(context_parts) + "\n\n"
            if context_parts
            else ""
        )
        text_prompt += (
            "Listen to the audio clip. Transcribe it, analyze the speaker's vocal emotion, "
            "reconcile it with the visual emotion data using confidence-weighted fusion, "
            "determine the user's combined state, then respond."
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

    async def generate_unified_streaming(
        self,
        pcm: np.ndarray,
        ver_signals: dict | None,
        recent_turns: list[dict],
        role: str | None = None,
    ) -> AsyncIterator[tuple[str, Any]]:
        """Stream unified Gemini response, yielding deltas and finally the complete result."""
        wav_bytes = _pcm_f32_to_wav(pcm)

        context_parts: list[str] = []

        if role and role in ROLE_PROMPTS:
            context_parts.append(ROLE_PROMPTS[role])

        if recent_turns:
            context_parts.append("Recent conversation:")
            for turn in recent_turns[-6:]:
                context_parts.append(f"  User: {turn['user_text']}")
                context_parts.append(f"  Assistant: {turn['assistant_text']}")

        if ver_signals:
            ver = ver_signals.get("ver", ver_signals)
            face_present = ver.get("face_present", False)
            ver_conf = ver.get("confidence", 0)
            ver_label = ver.get("label", "neutral")

            quality = "stable" if face_present else "no_face"
            if face_present and ver_conf < LOW_CONFIDENCE_THRESHOLD:
                quality = "low_confidence"

            context_parts.append("\n[Visual Emotion Sensor (VER — precomputed, treat as hint)]")
            context_parts.append(
                f"  Current: {ver_label} (confidence {ver_conf:.0%}), "
                f"face_detected: {'yes' if face_present else 'no'}, quality: {quality}"
            )
            recent = ver.get("recent", [])[:MAX_RECENT_SAMPLES]
            if recent:
                labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in recent)
                context_parts.append(f"  Recent: {labels}")

        text_prompt = (
            "[Context]\n" + "\n".join(context_parts) + "\n\n"
            if context_parts
            else ""
        )
        text_prompt += (
            "Listen to the audio clip. Transcribe it, analyze the speaker's vocal emotion, "
            "reconcile it with the visual emotion data using confidence-weighted fusion, "
            "determine the user's combined state, then respond."
        )

        audio_part = {
            "inline_data": {
                "mime_type": "audio/wav",
                "data": wav_bytes,
            }
        }

        full_json = ""
        try:
            response = await self._unified_model.generate_content_async(
                [text_prompt, audio_part], stream=True
            )
            async for chunk in response:
                delta = chunk.text or ""
                if delta:
                    full_json += delta
                    yield ("delta", delta)
            result = json.loads(full_json)
            result.setdefault("transcript", "")
            result.setdefault("assistant_text", "")
            yield ("complete", self._validate_and_clamp(result))
        except json.JSONDecodeError:
            print("[gemini-unified-stream] JSON parse failed, falling back to non-streaming retry")
            try:
                result = await self.generate_unified(pcm, ver_signals, recent_turns)
                yield ("complete", result)
            except Exception as exc:
                yield ("complete", {
                    "transcript": "",
                    "assistant_text": f"I'm sorry, I had trouble generating a response. ({exc})",
                    **_EMOTION_DEFAULTS,
                })
        except Exception as exc:
            yield ("complete", {
                "transcript": "",
                "assistant_text": f"I'm sorry, I had trouble generating a response. ({exc})",
                **_EMOTION_DEFAULTS,
            })

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

        ser_label = ser.get("label", "neutral")
        ser_conf = ser.get("confidence", 0)
        ver_label = ver.get("label", "neutral")
        ver_conf = ver.get("confidence", 0)
        face_present = ver.get("face_present", False)

        signals_conflict = (ser_label != ver_label and ser_conf > 0.4 and ver_conf > 0.4)

        parts.append("")
        parts.append("[Live Affect Summary]")
        dominant = ser_label if ser_conf >= ver_conf else ver_label
        dominant_conf = max(ser_conf, ver_conf)
        parts.append(
            f"Dominant: {dominant} ({dominant_conf:.0%}), "
            f"face_present: {'yes' if face_present else 'no'}, "
            f"signals_conflict: {'yes' if signals_conflict else 'no'}"
        )

        parts.append("")
        parts.append("[Emotion Signals — precomputed sensor outputs, interpret with care]")

        ser_quality = "stable"
        if ser_conf < LOW_CONFIDENCE_THRESHOLD:
            ser_quality = "low_confidence"

        parts.append(
            f"Voice (SER): {ser_label} (confidence {ser_conf:.0%}), quality: {ser_quality}"
        )
        ser_recent = ser.get("recent", [])[:MAX_RECENT_SAMPLES]
        if ser_recent:
            labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in ser_recent)
            parts.append(f"  Recent: {labels}")

        ver_quality = "stable" if face_present else "no_face"
        if face_present and ver_conf < LOW_CONFIDENCE_THRESHOLD:
            ver_quality = "low_confidence"

        parts.append(
            f"Face (VER): {ver_label} (confidence {ver_conf:.0%}), "
            f"face_detected: {'yes' if face_present else 'no'}, quality: {ver_quality}"
        )
        ver_recent = ver.get("recent", [])[:MAX_RECENT_SAMPLES]
        if ver_recent:
            labels = ", ".join(f"{r['label']}({r['confidence']:.0%})" for r in ver_recent)
            parts.append(f"  Recent: {labels}")

        return "\n".join(parts)
