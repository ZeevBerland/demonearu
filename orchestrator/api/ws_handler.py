from __future__ import annotations

import base64
import json
import time
import traceback
from uuid import uuid4

import numpy as np
from fastapi import WebSocket

from services.fusion_service import FusionService
from services.ser_service import SERService
from services.ver_service import VERService
from services.gemini_service import GeminiService
from services.gemini_ser_service import GeminiSERService
from services.stt_service import STTService
from services.tts_service import TTSService
from services.memory_service import MemoryService
from utils.audio_utils import decode_pcm_f32


class SessionHandler:
    """Manages one WebSocket session: dispatches messages to services and streams results back."""

    def __init__(
        self,
        websocket: WebSocket,
        ser: SERService,
        ver: VERService,
        gemini: GeminiService,
        gemini_ser: GeminiSERService,
        stt: STTService,
        tts: TTSService,
        memory: MemoryService,
    ) -> None:
        self.ws = websocket
        self.ser = ser
        self.ver = ver
        self.gemini = gemini
        self.gemini_ser = gemini_ser
        self.stt = stt
        self.tts = tts
        self.memory = memory
        self.fusion = FusionService()
        self.session_id: str | None = None
        self.ser_mode: str = "local"
        self._memory_enabled: bool = True
        self._device_id: str | None = None
        self._audio_accumulator: list[np.ndarray] = []

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
            "stt.partial": self._on_stt_partial,
            "stt.request": self._on_stt_request,
            "stt.final": self._on_stt_final,
            "turn.complete": self._on_turn_complete,
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
        self.ser_mode = payload.get("ser_mode", "local")
        self._memory_enabled = payload.get("memory_enabled", True)
        self._device_id = payload.get("device_id")

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
        print(
            f"[session] started {self.session_id}, ser_mode={self.ser_mode}, "
            f"memory={self._memory_enabled}, device={self._device_id}, "
            f"fusion(α={self.fusion.ema_alpha}, voice={voice_w:.0%})"
        )
        await self._send("session.started", {"session_id": self.session_id})
        await self._send("session.ready", {"models": ["ser", "ver", "gemini", "tts"]})

    async def _on_audio_chunk(self, payload: dict) -> None:
        audio_bytes = base64.b64decode(payload["data"])

        if self.ser_mode in ("gemini", "hybrid"):
            pcm = decode_pcm_f32(audio_bytes)
            if pcm is not None:
                self._audio_accumulator.append(pcm)

        if self.ser_mode in ("local", "hybrid"):
            t0 = time.perf_counter()
            result = await self.ser.infer(audio_bytes)
            ser_ms = (time.perf_counter() - t0) * 1000

            if result:
                print(f"[SER] {result['label']} ({result['confidence']}) rms={result.get('rms', 0):.4f} in {ser_ms:.0f}ms")
                rms = result.get("rms", 0.0)
                self.fusion.add_ser_result(result["label"], result["confidence"], rms)
                await self._send("emotion.ser", {
                    "label": result["label"],
                    "confidence": result["confidence"],
                    "weak": self.fusion._last_ser_weak,
                })
                fused = self.fusion.get_summary()
                await self._send("emotion.sensor_fused", fused)
                await self._send("debug.metrics", {"ser_ms": round(ser_ms, 1)})

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

    async def _on_stt_partial(self, payload: dict) -> None:
        pass

    async def _on_stt_request(self, payload: dict) -> None:
        """Server-side STT: client sends audio blob, we transcribe and return."""
        audio_bytes = base64.b64decode(payload["data"])
        transcript = await self.stt.transcribe(audio_bytes)
        if transcript:
            await self._send("stt.final", {"text": transcript})
            await self._on_stt_final({"text": transcript})
        else:
            await self._send("stt.error", {"message": "Could not transcribe audio"})

    async def _on_memory_clear(self, payload: dict) -> None:
        scope = payload.get("scope", "session")
        if scope == "all" and self._device_id:
            await self.memory.clear_all(self._device_id)
        elif self.session_id:
            await self.memory.clear_session(self.session_id)
        await self._send("memory.cleared", {"scope": scope})

    async def _on_stt_final(self, payload: dict) -> None:
        transcript: str = payload.get("text", "")
        if not transcript.strip():
            return

        self._audio_accumulator = []

        raw_signals = self.fusion.get_raw_signals()
        recent_turns = await self.memory.get_last_n(self.session_id or "", n=6)

        t0 = time.perf_counter()
        try:
            response = await self.gemini.generate(
                transcript=transcript,
                raw_signals=raw_signals,
                recent_turns=recent_turns,
            )
        except Exception as exc:
            print(f"[llm] Gemini failed: {exc}")
            response = {
                "assistant_text": "I'm having a little trouble right now. Could you try again?",
                "voice_emotion": {"label": "neutral", "confidence": 0.0},
                "face_emotion": {"label": "neutral", "confidence": 0.0},
                "interpreted_emotion": {"label": "neutral", "confidence": 0.0},
                "tts_speed": 1.0,
            }
        llm_ms = (time.perf_counter() - t0) * 1000

        voice_emo = response.get("voice_emotion", {})
        face_emo = response.get("face_emotion", {})
        interp = response.get("interpreted_emotion", {})
        print(
            f"[llm] voice={voice_emo.get('label', '?')}({voice_emo.get('confidence', 0):.0%}) "
            f"face={face_emo.get('label', '?')}({face_emo.get('confidence', 0):.0%}) "
            f"combined={interp.get('label', '?')}({interp.get('confidence', 0):.0%}) "
            f"speed={response.get('tts_speed', 1.0)} reason={interp.get('reasoning', '')[:80]}"
        )

        await self._send("assistant.response_start", {"turn_id": self.session_id})

        await self._send("assistant.text", {
            "text": response["assistant_text"],
            "interpreted_emotion": interp,
            "follow_up_question": response.get("follow_up_question"),
        })

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
                "trend": "stable",
                "face_present": self.fusion._last_face_present,
                "summary_text": f"User appears {emo_label} ({int(emo_conf * 100)}%)",
            })

        tts_speed = float(response.get("tts_speed", 1.0))
        tts_ms = 0
        first_chunk_ms = 0.0
        tts_failed = False
        try:
            t0 = time.perf_counter()
            async for chunk_b64 in self.tts.synthesize_stream(
                text=response["assistant_text"],
                speed=tts_speed,
            ):
                if not first_chunk_ms:
                    first_chunk_ms = (time.perf_counter() - t0) * 1000
                await self._send("assistant.audio_chunk", {"audio_b64": chunk_b64, "format": "mp3"})
            tts_ms = (time.perf_counter() - t0) * 1000
            await self._send("assistant.audio_done", {"format": "mp3"})
            print(f"[tts] speed={tts_speed:.1f} streamed in {tts_ms:.0f}ms (first: {first_chunk_ms:.0f}ms)")
        except Exception as exc:
            tts_failed = True
            print(f"[tts] Synthesis failed: {exc}")
            await self._send("assistant.audio_done", {"format": "mp3", "tts_failed": True})

        if self._memory_enabled:
            await self.memory.save_episode(
                session_id=self.session_id or "",
                user_text=transcript,
                assistant_text=response["assistant_text"],
                emotion_summary=self.fusion.get_summary(),
                device_id=self._device_id,
            )

        await self._send("debug.metrics", {
            "llm_ms": round(llm_ms, 1),
            "tts_ms": round(tts_ms, 1),
            "tts_first_chunk_ms": round(first_chunk_ms, 1),
        })
        await self._send("assistant.response_end", {"tts_failed": tts_failed})

    async def _on_turn_complete(self, payload: dict) -> None:
        """Gemini-only mode: one call does STT + SER + response."""
        if not self._audio_accumulator:
            await self._send("error", {"message": "No audio received", "type": "turn.complete"})
            return

        full_pcm = np.concatenate(self._audio_accumulator)
        self._audio_accumulator = []

        if len(full_pcm) < 8_000:
            return

        ver_signals = self.fusion.get_raw_signals()
        recent_turns = await self.memory.get_last_n(self.session_id or "", n=6)

        t0 = time.perf_counter()
        try:
            result = await self.gemini.generate_unified(
                pcm=full_pcm,
                ver_signals=ver_signals,
                recent_turns=recent_turns,
            )
        except Exception as exc:
            print(f"[gemini-unified] Failed: {exc}")
            result = {
                "transcript": "",
                "assistant_text": "I'm having a little trouble right now. Could you try again?",
                "voice_emotion": {"label": "neutral", "confidence": 0.0},
                "face_emotion": {"label": "neutral", "confidence": 0.0},
                "interpreted_emotion": {"label": "neutral", "confidence": 0.0},
                "tts_speed": 1.0,
            }
        total_ms = (time.perf_counter() - t0) * 1000

        transcript = result.get("transcript", "")
        voice_emo = result.get("voice_emotion", {})
        face_emo = result.get("face_emotion", {})
        interp = result.get("interpreted_emotion", {})
        emo_label = interp.get("label", "neutral")
        emo_conf = float(interp.get("confidence", 0.5))

        print(
            f"[gemini-unified] transcript={transcript[:60]!r} "
            f"voice={voice_emo.get('label', '?')}({voice_emo.get('confidence', 0):.0%}) "
            f"face={face_emo.get('label', '?')}({face_emo.get('confidence', 0):.0%}) "
            f"combined={emo_label}({emo_conf:.0%}) speed={result.get('tts_speed', 1.0)} "
            f"reason={interp.get('reasoning', '')[:80]} in {total_ms:.0f}ms"
        )

        if transcript.strip():
            await self._send("stt.final", {"text": transcript})

        await self._send("assistant.response_start", {"turn_id": self.session_id})

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
        await self._send("emotion.fused", {
            "dominant": emo_label,
            "confidence": emo_conf,
            "trend": "stable",
            "face_present": self.fusion._last_face_present,
            "summary_text": f"User appears {emo_label} ({int(emo_conf * 100)}%)",
        })

        assistant_text = result.get("assistant_text", "")
        tts_failed = False

        if assistant_text:
            await self._send("assistant.text", {
                "text": assistant_text,
                "interpreted_emotion": interp,
                "follow_up_question": result.get("follow_up_question"),
            })

            tts_speed = float(result.get("tts_speed", 1.0))
            tts_ms = 0.0
            first_chunk_ms = 0.0
            try:
                t0 = time.perf_counter()
                async for chunk_b64 in self.tts.synthesize_stream(
                    text=assistant_text,
                    speed=tts_speed,
                ):
                    if not first_chunk_ms:
                        first_chunk_ms = (time.perf_counter() - t0) * 1000
                    await self._send("assistant.audio_chunk", {"audio_b64": chunk_b64, "format": "mp3"})
                tts_ms = (time.perf_counter() - t0) * 1000
                await self._send("assistant.audio_done", {"format": "mp3"})
                print(f"[tts] speed={tts_speed:.1f} streamed in {tts_ms:.0f}ms (first: {first_chunk_ms:.0f}ms)")
            except Exception as exc:
                tts_failed = True
                print(f"[tts] Synthesis failed: {exc}")
                await self._send("assistant.audio_done", {"format": "mp3", "tts_failed": True})

            if self._memory_enabled:
                await self.memory.save_episode(
                    session_id=self.session_id or "",
                    user_text=transcript,
                    assistant_text=assistant_text,
                    emotion_summary=self.fusion.get_summary(),
                    device_id=self._device_id,
                )

            await self._send("debug.metrics", {
                "llm_ms": round(total_ms, 1),
                "tts_ms": round(tts_ms, 1),
                "tts_first_chunk_ms": round(first_chunk_ms, 1),
            })

        await self._send("assistant.response_end", {"tts_failed": tts_failed})

    # ── helpers ──────────────────────────────────────────────────────

    async def _send(self, msg_type: str, payload: dict) -> None:
        await self.ws.send_json({
            "v": 1,
            "type": msg_type,
            "payload": payload,
            "session_id": self.session_id,
            "ts": time.time(),
        })
