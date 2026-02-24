from __future__ import annotations

import asyncio
import io
import struct
import time

import google.generativeai as genai
import numpy as np


SER_PROMPT = (
    "Analyze the speaker's emotional state from this audio clip. "
    "Return ONLY a JSON object with exactly two keys:\n"
    '  "label": one of [angry, calm, disgust, fearful, happy, neutral, sad, surprised, contempt]\n'
    '  "confidence": a float between 0.0 and 1.0\n'
    "Do not include any other text or explanation."
)


def _pcm_f32_to_wav(pcm: np.ndarray, sample_rate: int = 16_000) -> bytes:
    """Convert float32 PCM samples to a 16-bit WAV file in memory."""
    pcm_16 = np.clip(pcm, -1.0, 1.0)
    pcm_16 = (pcm_16 * 32767).astype(np.int16)

    buf = io.BytesIO()
    import wave

    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_16.tobytes())

    return buf.getvalue()


class GeminiSERService:
    """Speech Emotion Recognition via Gemini 3 Flash audio input."""

    def __init__(self, api_key: str) -> None:
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel("gemini-3-flash-preview")

    async def infer(self, pcm_buffer: np.ndarray) -> dict | None:
        """Classify emotion from accumulated PCM float32 samples.

        Returns ``{label, confidence, source}`` or ``None``.
        """
        if pcm_buffer is None or len(pcm_buffer) < 8_000:
            return None

        wav_bytes = _pcm_f32_to_wav(pcm_buffer)

        audio_part = {
            "inline_data": {
                "mime_type": "audio/wav",
                "data": wav_bytes,
            }
        }

        try:
            t0 = time.perf_counter()
            response = await self._model.generate_content_async(
                [SER_PROMPT, audio_part]
            )
            elapsed = (time.perf_counter() - t0) * 1000
            print(f"[gemini-ser] Response in {elapsed:.0f}ms: {response.text[:120]}")

            import json

            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            result = json.loads(text)
            label = str(result.get("label", "neutral")).lower()
            confidence = float(result.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))

            return {
                "label": label,
                "confidence": round(confidence, 3),
                "source": "gemini",
            }
        except Exception as exc:
            print(f"[gemini-ser] Error: {exc}")
            return None
