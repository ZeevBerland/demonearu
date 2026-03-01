from __future__ import annotations

import base64
import os
from typing import AsyncIterator

from openai import AsyncOpenAI

CHUNK_SIZE = int(os.getenv("TTS_CHUNK_SIZE", "65536"))
FIRST_CHUNK_SIZE = int(os.getenv("TTS_FIRST_CHUNK_SIZE", "16384"))

MODELS_WITH_INSTRUCTIONS = {"gpt-4o-mini-tts"}


class TTSService:
    """Synthesises speech via OpenAI TTS with LLM-driven voice and delivery."""

    def __init__(self, api_key: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = os.getenv("TTS_MODEL", "tts-1")
        self._default_voice = os.getenv("TTS_VOICE", "nova")
        print(f"[tts] model={self._model} voice={self._default_voice}")

    @property
    def supports_instructions(self) -> bool:
        return self._model in MODELS_WITH_INSTRUCTIONS

    def _build_kwargs(
        self,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        instructions: str | None = None,
    ) -> dict:
        kwargs: dict = {
            "model": self._model,
            "voice": voice or self._default_voice,
            "input": text,
            "response_format": "mp3",
            "speed": max(0.25, min(4.0, speed)),
        }
        if instructions and self.supports_instructions:
            kwargs["instructions"] = instructions
        return kwargs

    async def synthesize_stream(
        self,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        instructions: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield base64-encoded MP3 chunks as they arrive from OpenAI.

        The first chunk is yielded at FIRST_CHUNK_SIZE (4KB default) to minimise
        time-to-first-audio.  Subsequent chunks use the larger CHUNK_SIZE (64KB).
        """
        kwargs = self._build_kwargs(text, voice, speed, instructions)
        first_sent = False

        async with self._client.audio.speech.with_streaming_response.create(**kwargs) as response:
            buf = bytearray()
            async for raw_chunk in response.iter_bytes(chunk_size=FIRST_CHUNK_SIZE):
                buf.extend(raw_chunk)
                threshold = FIRST_CHUNK_SIZE if not first_sent else CHUNK_SIZE
                if len(buf) >= threshold:
                    yield base64.b64encode(bytes(buf)).decode("ascii")
                    buf = bytearray()
                    first_sent = True
            if buf:
                yield base64.b64encode(bytes(buf)).decode("ascii")

    async def synthesize(
        self,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        instructions: str | None = None,
    ) -> str:
        """Return full base64-encoded MP3 audio (non-streaming fallback)."""
        kwargs = self._build_kwargs(text, voice, speed, instructions)
        response = await self._client.audio.speech.create(**kwargs)
        return base64.b64encode(response.content).decode("ascii")
