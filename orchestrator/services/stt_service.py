from __future__ import annotations

import io
import os

from openai import AsyncOpenAI

MIN_AUDIO_BYTES = 4_000
MIN_TRANSCRIPT_LEN = 2


class STTService:
    """Server-side Speech-to-Text via OpenAI Whisper API."""

    def __init__(self, api_key: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = os.getenv("STT_MODEL", "gpt-4o-transcribe")
        print(f"[stt] model={self._model}")

    async def transcribe(self, audio_bytes: bytes) -> str | None:
        """Transcribe a WebM audio blob. Returns transcript text or None on failure."""
        if len(audio_bytes) < MIN_AUDIO_BYTES:
            print(f"[stt] Audio too short ({len(audio_bytes)} bytes), skipping")
            return None

        try:
            file = ("recording.webm", io.BytesIO(audio_bytes), "audio/webm")
            result = await self._client.audio.transcriptions.create(
                file=file,
                model=self._model,
                language="en",
                prompt="The user is speaking in English in a conversational tone.",
            )
            text = result.text.strip()
            if len(text) < MIN_TRANSCRIPT_LEN:
                print(f"[stt] Transcript too short: {text!r}")
                return None
            return text
        except Exception as exc:
            print(f"[stt] Transcription failed: {exc}")
            return None
