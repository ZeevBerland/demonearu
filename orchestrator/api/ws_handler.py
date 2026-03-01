from __future__ import annotations

import asyncio
import base64
import json
import time
import traceback
from uuid import uuid4

import numpy as np
from fastapi import WebSocket

from services.fusion_service import FusionService
from services.ver_service import VERService
from services.gemini_service import GeminiService
from services.tts_service import TTSService
from services.memory_service import MemoryService
from utils.audio_utils import decode_pcm_f32
from utils.json_streamer import AssistantTextStreamer


class SessionHandler:
    """Manages one WebSocket session: dispatches messages to services and streams results back."""

    def __init__(
        self,
        websocket: WebSocket,
        ver: VERService,
        gemini: GeminiService,
        tts: TTSService,
        memory: MemoryService,
    ) -> None:
        self.ws = websocket
        self.ver = ver
        self.gemini = gemini
        self.tts = tts
        self.memory = memory
        self.fusion = FusionService()
        self.session_id: str | None = None
        self._memory_enabled: bool = True
        self._device_id: str | None = None
        self._tts_voice: str | None = None
        self._active_role: str | None = None
        self._audio_accumulator: list[np.ndarray] = []
        self._cached_turns: list[dict] = []

    # ── dispatch ─────────────────────────────────────────────────────

    async def handle_message(self, raw: str) -> None:
        msg = json.loads(raw)
        msg_type: str = msg.get("type", "")
        payload: dict = msg.get("payload", {})
        self.session_id = msg.get("session_id", self.session_id)

        handler = {
            "session.start": self._on_session_start,
            "audio.chunk": self._on_audio_chunk,
            "ver.frame": self._on_ver_frame,
            "turn.complete": self._on_turn_complete,
            "settings.update": self._on_settings_update,
            "memory.clear": self._on_memory_clear,
        }.get(msg_type)

        if handler:
            try:
                await handler(payload)
            except Exception as exc:
                tb = traceback.format_exc()
                print(f"[ws] Error handling {msg_type}: {exc}\n{tb}")
                try:
                    await self._send("error", {"message": str(exc), "type": msg_type})
                except Exception:
                    pass

    async def cleanup(self) -> None:
        pass

    # ── handlers ─────────────────────────────────────────────────────

    async def _on_session_start(self, payload: dict) -> None:
        self.session_id = payload.get("session_id") or str(uuid4())
        self._memory_enabled = payload.get("memory_enabled", True)
        self._device_id = payload.get("device_id")
        self._tts_voice = payload.get("tts_voice") or None

        fp = payload.get("fusion", {}) or {}
        voice_w = float(fp.get("voiceWeight", 0.4))
        self.fusion = FusionService(
            ema_alpha=float(fp.get("emaAlpha", 0.50)),
            trend_window_sec=float(fp.get("trendWindowSec", 2.0)),
            buffer_max=int(fp.get("bufferMax", 40)),
            ser_weight=voice_w,
            ver_weight=1.0 - voice_w,
        )
        self._audio_accumulator = []
        self._cached_turns = await self.memory.get_last_n(self.session_id, n=6)
        print(
            f"[session] started {self.session_id}, "
            f"memory={self._memory_enabled}, device={self._device_id}, "
            f"tts_voice={self._tts_voice or 'default'}, "
            f"fusion(α={self.fusion.ema_alpha}, voice={voice_w:.0%})"
        )
        await self._send("session.started", {"session_id": self.session_id})
        await self._send("session.ready", {"models": ["ver", "gemini", "tts"]})

    async def _on_settings_update(self, payload: dict) -> None:
        if "tts_voice" in payload:
            self._tts_voice = payload["tts_voice"] or None
            print(f"[settings] tts_voice → {self._tts_voice or 'default'}")
        if "role" in payload:
            self._active_role = payload["role"] or None
            print(f"[settings] role → {self._active_role or 'none'}")

    async def _on_audio_chunk(self, payload: dict) -> None:
        audio_bytes = base64.b64decode(payload["data"])
        pcm = decode_pcm_f32(audio_bytes)
        if pcm is not None:
            self._audio_accumulator.append(pcm)

    async def _on_ver_frame(self, payload: dict) -> None:
        frame_bytes = base64.b64decode(payload["data"])

        t0 = time.perf_counter()
        result = await self.ver.infer(frame_bytes)
        ver_ms = (time.perf_counter() - t0) * 1000

        if result:
            print(f"[VER] {result['label']} ({result['confidence']}) face={result['face_present']} in {ver_ms:.0f}ms")
            self.fusion.add_ver_result(result["label"], result["confidence"], result["face_present"])
            await self._send("emotion.ver", {
                **result,
                "weak": self.fusion._last_ver_weak,
            })
            fused = self.fusion.get_summary()
            await self._send("emotion.sensor_fused", fused)
            await self._send("debug.metrics", {"ver_ms": round(ver_ms, 1)})

    async def _on_memory_clear(self, payload: dict) -> None:
        scope = payload.get("scope", "session")
        if scope == "all" and self._device_id:
            await self.memory.clear_all(self._device_id)
        elif self.session_id:
            await self.memory.clear_session(self.session_id)
        await self._send("memory.cleared", {"scope": scope})

    async def _on_turn_complete(self, payload: dict) -> None:
        """Gemini-only mode: one streaming call does STT + SER + response."""
        if not self._audio_accumulator:
            await self._send("error", {"message": "No audio received", "type": "turn.complete"})
            return

        full_pcm = np.concatenate(self._audio_accumulator)
        self._audio_accumulator = []

        if len(full_pcm) < 8_000:
            return

        ver_signals = self.fusion.get_raw_signals()
        recent_turns = self._cached_turns

        await self._send("assistant.response_start", {"turn_id": self.session_id})

        t0 = time.perf_counter()
        streamer = AssistantTextStreamer()
        result: dict | None = None
        first_sentence: str | None = None
        first_tts_task: asyncio.Task | None = None

        try:
            async for event_type, data in self.gemini.generate_unified_streaming(
                pcm=full_pcm,
                ver_signals=ver_signals,
                recent_turns=recent_turns,
                role=self._active_role,
            ):
                if event_type == "delta":
                    sentences = streamer.feed(data)
                    if sentences and first_sentence is None:
                        first_sentence = sentences[0]
                        print(f"[gemini-unified-stream] first sentence ready ({len(first_sentence)} chars), starting TTS")
                        first_tts_task = asyncio.create_task(
                            self._stream_tts_chunks(first_sentence, self._tts_voice, 1.0)
                        )
                elif event_type == "complete":
                    result = data
        except Exception as exc:
            print(f"[gemini-unified] Streaming failed: {exc}")

        total_ms = (time.perf_counter() - t0) * 1000

        if result is None:
            result = {
                "transcript": "",
                "assistant_text": "I'm having a little trouble right now. Could you try again?",
                "voice_emotion": {"label": "neutral", "confidence": 0.0},
                "face_emotion": {"label": "neutral", "confidence": 0.0},
                "interpreted_emotion": {"label": "neutral", "confidence": 0.0},
                "tts_speed": 1.0,
            }

        transcript = result.get("transcript", "")
        voice_emo = result.get("voice_emotion", {})
        face_emo = result.get("face_emotion", {})
        interp = result.get("interpreted_emotion", {})
        assistant_text = result.get("assistant_text", "")
        tts_speed = float(result.get("tts_speed", 1.0))
        emo_label = interp.get("label", "neutral")
        emo_conf = float(interp.get("confidence", 0.5))

        print(
            f"[gemini-unified] {total_ms:.0f}ms transcript={transcript[:60]!r} "
            f"voice={voice_emo.get('label', '?')}({voice_emo.get('confidence', 0):.0%}) "
            f"face={face_emo.get('label', '?')}({face_emo.get('confidence', 0):.0%}) "
            f"combined={emo_label}({emo_conf:.0%}) trend={interp.get('trend', 'stable')} "
            f"speed={tts_speed} evidence={interp.get('evidence_summary', '')[:80]}"
        )

        if transcript.strip():
            await self._send("stt.final", {"text": transcript})

        tts_failed = False
        tts_ms = 0.0
        first_chunk_ms = 0.0

        if assistant_text:
            await self._send("assistant.text", {
                "text": assistant_text,
                "interpreted_emotion": interp,
                "follow_up_question": result.get("follow_up_question"),
            })
            await self._send_emotion_data(voice_emo, face_emo, interp)

            tts_t0 = time.perf_counter()

            if first_tts_task is not None:
                try:
                    first_chunk_ms = await first_tts_task
                except Exception as exc:
                    print(f"[tts] First-sentence TTS failed: {exc}")
                    tts_failed = True

                remaining = assistant_text[len(first_sentence):].strip() if first_sentence else ""
                if remaining and not tts_failed:
                    try:
                        await self._stream_tts_chunks(remaining, self._tts_voice, tts_speed)
                    except Exception as exc:
                        print(f"[tts] Remaining TTS failed: {exc}")
                        tts_failed = True
            else:
                try:
                    first_chunk_ms = await self._stream_tts_chunks(assistant_text, self._tts_voice, tts_speed)
                except Exception as exc:
                    print(f"[tts] Synthesis failed: {exc}")
                    tts_failed = True

            tts_ms = (time.perf_counter() - tts_t0) * 1000
            await self._send("assistant.audio_done", {"format": "mp3", "tts_failed": tts_failed})

            pipelined = "pipelined" if first_sentence else "sequential"
            print(f"[tts] {pipelined} voice={self._tts_voice or 'default'} speed={tts_speed:.1f} "
                  f"streamed in {tts_ms:.0f}ms (first: {first_chunk_ms:.0f}ms)")

            if self._memory_enabled:
                await self.memory.save_episode(
                    session_id=self.session_id or "",
                    user_text=transcript,
                    assistant_text=assistant_text,
                    emotion_summary=self.fusion.get_summary(),
                    device_id=self._device_id,
                )
                self._cached_turns = await self.memory.get_last_n(self.session_id or "", n=6)

            await self._send("debug.metrics", {
                "llm_ms": round(total_ms, 1),
                "tts_ms": round(tts_ms, 1),
                "tts_first_chunk_ms": round(first_chunk_ms, 1),
            })
        else:
            await self._send_emotion_data(voice_emo, face_emo, interp)

        await self._send("assistant.response_end", {"tts_failed": tts_failed})

    # ── helpers ──────────────────────────────────────────────────────

    async def _stream_tts_chunks(self, text: str, voice: str | None, speed: float) -> float:
        """Stream TTS audio chunks to the client. Returns time-to-first-chunk in ms."""
        first_chunk_ms = 0.0
        t0 = time.perf_counter()
        async for chunk_b64 in self.tts.synthesize_stream(text=text, voice=voice, speed=speed):
            if not first_chunk_ms:
                first_chunk_ms = (time.perf_counter() - t0) * 1000
            await self._send("assistant.audio_chunk", {"audio_b64": chunk_b64, "format": "mp3"})
        return first_chunk_ms

    async def _send_emotion_data(self, voice_emo: dict, face_emo: dict, interp: dict) -> None:
        if voice_emo:
            await self._send("emotion.ser", {
                "label": voice_emo.get("label", "neutral"),
                "confidence": voice_emo.get("confidence", 0.5),
                "source": "llm",
            })
        if face_emo:
            await self._send("emotion.ver", {
                "label": face_emo.get("label", "neutral"),
                "confidence": face_emo.get("confidence", 0.5),
                "face_present": self.fusion._last_face_present,
                "source": "llm",
            })
        if interp:
            emo_label = interp.get("label", "neutral")
            emo_conf = interp.get("confidence", 0.5)
            await self._send("emotion.fused", {
                "dominant": emo_label,
                "confidence": emo_conf,
                "trend": interp.get("trend", "stable"),
                "face_present": self.fusion._last_face_present,
                "evidence_summary": interp.get("evidence_summary", ""),
                "summary_text": f"User appears {emo_label} ({int(emo_conf * 100)}%)",
            })

    async def _send(self, msg_type: str, payload: dict) -> None:
        await self.ws.send_json({
            "v": 1,
            "type": msg_type,
            "payload": payload,
            "session_id": self.session_id,
            "ts": time.time(),
        })
