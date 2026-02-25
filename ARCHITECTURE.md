# Nearu Sense v0.2 — Architecture & Specification

> **Nearu Sense helps users think and communicate better by adapting response tone and pacing to real-time emotional signals.**

---

## 1. Overview

Nearu Sense is a desktop application that listens (push-to-talk), runs **Speech Emotion Recognition (SER)** and **Visual Emotion Recognition (VER)** in real time, fuses them into an **emotion state**, and uses that to steer:

- **What** the assistant says (Google Gemini 3 Flash)
- **How** it says it (OpenAI TTS voice style and speed)

**Inputs:** Microphone + Webcam  
**Outputs:** Transcript + Emotion timeline + Spoken reply + Chat log

### Key v0.2 Changes from v0.1

- **Security**: STT proxied through orchestrator — no client-side API keys
- **Protocol**: Versioned WebSocket envelopes with timestamps
- **Fusion Architecture**: Split into Sensor Fusion (realtime) vs LLM Interpretation (turn-level)
- **Failure Flows**: Structured fallbacks for every pipeline stage
- **Privacy Controls**: Memory toggle, clear session/all, data handling transparency
- **Device Memory**: Cross-session persistence via device ID
- **Client Refactoring**: Audio queue moved out of Zustand, ref-based streaming
- **Emotion Pipeline**: Confidence thresholds, face-lost cooldown, canonical labels
- **LLM Hardening**: JSON validation + retry, prompt refinements, TTS speed clamping

---

## 2. Architecture

```
┌──────────────────────────────────┐      WebSocket (v1)      ┌───────────────────────────────────┐
│         Electron Client          │◄────────────────────────►│        Python Orchestrator         │
│                                  │     localhost:8765/ws     │                                   │
│  React + Zustand + Tailwind      │                           │  FastAPI + Uvicorn                 │
│  Web Audio (ScriptProcessorNode) │                           │                                   │
│  MediaRecorder (WebM for STT)    │                           │  ┌─────────┐  ┌─────────┐         │
│  MediaSource Extensions (TTS)    │     PCM float32 chunks ──►│  │   SER   │  │   VER   │         │
│  Canvas (JPEG for VER)           │     JPEG frames ─────────►│  └────┬────┘  └────┬────┘         │
│                                  │     WebM blobs ──────────►│       │             │              │
│                                  │                           │  ┌────▼─────────────▼────┐        │
│                                  │                           │  │   Fusion Service       │        │
│                                  │                           │  │ (Sensor: realtime EMA) │        │
│                                  │                           │  └───────────┬───────────┘        │
│                                  │                           │              │                     │
│                                  │                           │  ┌───────────▼──────────┐         │
│                                  │  ◄── stt.final ──────────│  │    STT Service        │         │
│                                  │  ◄── emotion.* ──────────│  │  (OpenAI Whisper)     │         │
│                                  │  ◄── assistant.text ─────│  └───────────┬──────────┘         │
│                                  │  ◄── assistant.audio_* ──│              │                     │
│                                  │  ◄── debug.metrics ──────│  ┌───────────▼──────────┐         │
│                                  │                           │  │   Gemini Service      │         │
│                                  │                           │  │  (LLM + Interpretation)│        │
│                                  │                           │  └───────────┬──────────┘         │
│                                  │                           │  ┌───────────▼──────────┐         │
│                                  │                           │  │    TTS Service        │         │
│                                  │                           │  │   (OpenAI tts-1)      │         │
│                                  │                           │  └──────────────────────┘         │
│                                  │                           │  ┌──────────────────────┐         │
│                                  │                           │  │   Memory Service      │         │
│                                  │                           │  │  (SQLite + device ID) │         │
│                                  │                           │  └──────────────────────┘         │
└──────────────────────────────────┘                           └───────────────────────────────────┘
```

### STT Ownership Strategy

| Mode | STT Owner | SER | LLM | When to Use |
|------|-----------|-----|-----|-------------|
| **A — Default (v0.2)** | Orchestrator (OpenAI via WS proxy) | Local/Hybrid | Gemini text | Safest, no client keys |
| **B — Gemini Unified** | Gemini (audio-in) | Gemini | Gemini unified | Lowest cost, single call |

**v0.2 uses Mode A as primary** — client sends WebM audio blob to orchestrator, orchestrator calls OpenAI STT and returns `stt.final`.

### Latency Budget (Target)

| Stage | Target | Notes |
|-------|--------|-------|
| VER update | 150–300 ms | Per frame at 3 FPS |
| SER update | 250–700 ms | Per 0.5s chunk |
| STT (after PTT release) | 0.8–2 s | Post-utterance, not realtime partials |
| Gemini LLM | 1–4 s | Structured JSON response |
| TTS first audio byte | 0.5–1.5 s | Streaming MP3 chunks |
| Total PTT-release → first audio | 2–6 s | End-to-end target |

---

## 3. Tech Stack

### Client (Electron + React)

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 + electron-vite 5 |
| UI | React 18 + TypeScript 5.7 |
| Styling | Tailwind CSS 3.4 |
| State | Zustand 5 |
| Charts | Recharts 2.15 |
| Audio Capture | Web Audio API (ScriptProcessorNode) |
| Audio Playback | MediaSource Extensions |
| Video Capture | Canvas → JPEG → base64 |

> **Migration Path:** `ScriptProcessorNode` is deprecated. v0.3 will migrate to `AudioWorkletNode`.

### Orchestrator (Python)

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI + Uvicorn |
| SER Model | `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` (8 classes) |
| VER Model | `hsemotion-onnx` (enet_b0_8_va_mtl) |
| Face Detection | OpenCV Haar Cascade |
| LLM | Google Gemini 3 Flash Preview |
| STT | OpenAI `gpt-4o-transcribe` (server-side) |
| TTS | OpenAI `tts-1` (streaming MP3) |
| Memory | aiosqlite (SQLite) |

### Cloud Services

| Service | Provider | Model |
|---------|----------|-------|
| Speech-to-Text | OpenAI | `gpt-4o-transcribe` / `whisper-1` |
| Text-to-Speech | OpenAI | `tts-1` |
| LLM | Google | `gemini-3-flash-preview` |

---

## 4. Project Structure

```
demo/
├── orchestrator/
│   ├── main.py                    # FastAPI app, lifespan, env validation
│   ├── requirements.txt
│   ├── .env / .env.example
│   ├── api/
│   │   └── ws_handler.py          # WebSocket session handler
│   ├── services/
│   │   ├── ser_service.py          # Local SER (wav2vec2)
│   │   ├── ver_service.py          # VER (hsemotion-onnx)
│   │   ├── fusion_service.py       # Sensor fusion (EMA + sticky dominant)
│   │   ├── gemini_service.py       # Gemini LLM (text + unified audio)
│   │   ├── gemini_ser_service.py   # Gemini-based SER (audio analysis)
│   │   ├── stt_service.py          # Server-side STT (OpenAI proxy)
│   │   ├── tts_service.py          # TTS (streaming MP3)
│   │   └── memory_service.py       # Episodic memory (SQLite)
│   ├── models/
│   │   └── schemas.py              # Pydantic models, canonical labels
│   └── utils/
│       └── audio_utils.py          # PCM decode, RMS compute
├── client/
│   ├── package.json
│   ├── electron.vite.config.ts
│   ├── tailwind.config.js
│   ├── .env.example                # Only VITE_WS_URL (no API keys)
│   └── src/
│       ├── main/index.ts           # Electron main process
│       ├── preload/index.ts
│       └── renderer/src/
│           ├── App.tsx
│           ├── index.css
│           ├── types/index.ts      # TypeScript types (WSMessage v1)
│           ├── store/
│           │   └── sessionStore.ts # Zustand (no audio queue)
│           ├── hooks/
│           │   ├── useWebSocket.ts # WS connection + audio callback ref
│           │   ├── useAudioCapture.ts
│           │   ├── useVideoCapture.ts
│           │   ├── usePushToTalk.ts
│           │   └── useSTT.ts       # Audio blob → base64 for WS proxy
│           ├── components/
│           │   ├── StatusBadge.tsx  # "Ready / Listening… / Reading your tone… / Speaking…"
│           │   ├── PushToTalkButton.tsx
│           │   ├── WaveformMeter.tsx
│           │   ├── TranscriptView.tsx
│           │   ├── EmotionPanel.tsx # Turn Interpretation + Live Affect + Voice/Face Signal
│           │   ├── EmotionTimeline.tsx
│           │   └── ChatLog.tsx     # With "Why this response?" debug chip
│           └── pages/
│               ├── SessionPage.tsx  # Main page, camera privacy badge
│               ├── SettingsPage.tsx # Fusion presets, privacy controls, demo toggles
│               └── DebugPage.tsx    # TTS first-byte latency
└── ARCHITECTURE.md                 # This file
```

---

## 5. Setup & Configuration

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (on Windows: `py -3.11 -m venv .venv`)
- API keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`

### Orchestrator Setup

```bash
cd orchestrator
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env          # Fill in API keys
python main.py
```

The orchestrator validates required environment variables at startup and will exit with a clear error if keys are missing.

### Client Setup

```bash
cd client
npm install
cp .env.example .env          # Set VITE_WS_URL if needed
npm run dev
```

> **Security Note:** The client no longer requires any API keys. All external API calls (STT, TTS, LLM) are proxied through the orchestrator.

### Windows-Specific Notes

- Use `py -3.11 -m venv .venv` for Python virtual environment
- Webcam permissions: Electron requires explicit camera permission on Windows
- Microphone exclusive mode: Some setups may require disabling exclusive mode in Windows Sound settings
- If SER model loading is slow, ensure you're on Python 3.11 (not 3.13) for best `transformers` compatibility

### Model Warmup

On startup, the orchestrator:
1. Loads the SER model (wav2vec2)
2. Runs a warmup inference on SER
3. Loads the VER model (hsemotion-onnx)
4. Runs a warmup inference on VER
5. Initializes the memory database (with schema migration)
6. Prints `[boot] All services ready.`

The `session.ready` message is sent to the client after `session.started`, indicating models are hot and ready for real-time inference.

### Environment Variables

**Orchestrator (`.env`):**

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *required* | OpenAI API key (STT + TTS) |
| `GEMINI_API_KEY` | *required* | Google Gemini API key |
| `STT_MODEL` | `gpt-4o-transcribe` | OpenAI STT model |
| `TTS_MODEL` | `tts-1` | OpenAI TTS model |
| `TTS_VOICE` | `nova` | TTS voice (fixed, not LLM-chosen) |
| `TTS_CHUNK_SIZE` | `12288` | Streaming TTS chunk size in bytes |
| `HOST` | `0.0.0.0` | Server bind host |
| `PORT` | `8765` | Server bind port |

**Client (`.env`):**

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_WS_URL` | `ws://localhost:8765/ws` | WebSocket endpoint |

---

## 6. Conversation Flow

### v0.2 Primary Flow (Mode A — STT Proxied)

```
User holds PTT key
  ├── Client starts audio capture (ScriptProcessorNode → PCM float32)
  ├── Client starts video capture (Canvas → JPEG at 3fps)
  ├── PCM chunks sent as audio.chunk → Orchestrator
  │   └── SER inference (local mode) → emotion.ser + emotion.sensor_fused
  ├── JPEG frames sent as ver.frame → Orchestrator
  │   └── VER inference → emotion.ver + emotion.sensor_fused
  │
User releases PTT key
  ├── Client stops capture
  ├── WebM audio blob → base64 → stt.request
  │
Orchestrator receives stt.request
  ├── STTService.transcribe(webm_bytes)
  │   ├── Min duration check (< 4KB → reject)
  │   ├── Min transcript length (< 2 chars → reject)
  │   └── On failure → stt.error
  ├── stt.final { text } → Client
  │
  ├── assistant.response_start
  │
  ├── GeminiService.generate(transcript, raw_signals, memory)
  │   ├── JSON validation + retry on parse failure
  │   ├── TTS speed clamped to [0.8, 1.2]
  │   └── On failure → fallback neutral response
  │
  ├── assistant.text { text, interpreted_emotion }
  ├── emotion.ser { voice_emotion from LLM }
  ├── emotion.ver { face_emotion from LLM }
  ├── emotion.fused { interpreted_emotion from LLM }
  │
  ├── TTSService.synthesize_stream(text, speed)
  │   ├── assistant.audio_chunk { audio_b64, format: "mp3" }
  │   ├── ...more chunks...
  │   └── assistant.audio_done
  │       └── On TTS failure → audio_done with tts_failed: true
  │
  ├── MemoryService.save_episode (if memory enabled)
  ├── debug.metrics { llm_ms, tts_ms, tts_first_chunk_ms }
  └── assistant.response_end
```

### Gemini Unified Flow (Mode B)

When `ser_mode === 'gemini'`, the client sends `turn.complete` instead of `stt.request`. The orchestrator passes the accumulated PCM audio directly to Gemini in a single call that does STT + SER + LLM response.

### Failure Branches

| Stage | Failure | Behavior |
|-------|---------|----------|
| STT | API error or empty result | Send `stt.error` → Client shows "I didn't catch that" |
| Gemini | API error or timeout | Fallback neutral response: "I'm having a little trouble…" |
| TTS | API error | Send `assistant.audio_done` with `tts_failed: true` (text-only) |
| VER | Camera unavailable | Continue without VER, `face_present: false` in all messages |
| VER | No face detected | After 3 consecutive no-face frames, set `face_present: false` |

### v0.1 Claim vs v0.2 Reality

> v0.2 uses **post-utterance transcription** (STT happens after PTT release), not real-time token streaming. This is intentional for v0.2 to simplify the pipeline.

---

## 7. SER Modes

| Mode | SER Source | STT Source | LLM Input | Recommended For |
|------|-----------|-----------|-----------|-----------------|
| **Local** | wav2vec2 (realtime) | Orchestrator STT proxy | Text + raw signals | Privacy, local emotion |
| **Gemini** | Gemini (turn-level) | Gemini (unified audio) | Audio + VER signals | Cost efficiency |
| **Hybrid** | wav2vec2 (realtime) + Gemini (turn-level) | Orchestrator STT proxy | Text + raw signals | Best accuracy (demos) |

**Recommended for demos:** Hybrid (best balance)  
**Recommended for cost:** Gemini-only  
**Recommended for privacy:** Local

---

## 8. Emotion Recognition Pipeline

### SER — Speech Emotion Recognition

**Model:** `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition`  
**Labels:** angry, calm, disgust, fearful, happy, neutral, sad, surprised  
**Input:** PCM float32 at 16kHz (minimum 0.5s / 8000 samples)

Custom model loading is required due to classifier weight mismatch:
- `WEIGHT_REMAP` maps checkpoint keys to model architecture keys
- `config.classifier_proj_size` is overridden to 1024

**Performance note:** If avg SER latency > 400ms per chunk on your machine, consider increasing the hop size or switching to Gemini-only mode.

### VER — Visual Emotion Recognition

**Model:** `hsemotion-onnx` (enet_b0_8_va_mtl)  
**Labels:** anger→angry, happiness→happy, sadness→sad, surprise→surprised, fear→fearful, neutral, contempt, disgust  
**Input:** JPEG frames via OpenCV decode  
**Face Detection:** Haar Cascade (minSize 30×30)

**v0.2 improvements:**
- **Face-lost cooldown:** `face_present` only flips to `false` after 3+ consecutive no-face frames
- **Canonical label normalization:** All labels pass through `normalize_label()` in `schemas.py`

### Label Normalization

A single canonical label set is enforced across the entire system:

```python
CANONICAL_LABELS = ["neutral", "calm", "happy", "sad", "angry", "fearful", "disgust", "surprised", "contempt"]
```

`normalize_label(raw)` in `models/schemas.py` maps aliases (`anger` → `angry`, `happiness` → `happy`, etc.) to canonical form.

---

## 9. Multimodal Emotion Fusion

### Architecture: Two Fusion Concepts

v0.2 explicitly separates two distinct emotion assessments:

#### 1. Sensor Fusion (Realtime)

- **Source:** `FusionService` algorithmic EMA blend
- **Updates:** During PTT hold, every SER/VER result
- **WebSocket event:** `emotion.sensor_fused`
- **UI label:** "Live Affect"
- **Purpose:** Real-time dashboard feedback while user is speaking

#### 2. LLM Interpretation (Turn-Level)

- **Source:** Gemini's holistic assessment of voice + face + context
- **Updates:** Once per turn, after LLM response
- **WebSocket event:** `emotion.fused`
- **UI label:** "Turn Interpretation" (hero display)
- **Purpose:** Assistant message context and tone adaptation

### Fusion Service Details

**Algorithm:** Exponential Moving Average (EMA) with sticky dominant

| Parameter | Default | Tunable | Description |
|-----------|---------|---------|-------------|
| `ema_alpha` | 0.50 | Yes | Smoothing factor (0=smooth, 1=reactive) |
| `ser_weight` | 0.40 | Yes | Base voice weight |
| `ver_weight` | 0.60 | Yes | Base face weight (1 - voice) |
| `trend_window_sec` | 2.0 | Yes | Seconds for trend detection |
| `buffer_max` | 40 | Yes | Max readings per buffer |

**Confidence Thresholds:**
- `MIN_SER_CONF = 0.3` — below this, SER weight halved
- `MIN_VER_CONF = 0.3` — below this, VER weight halved

**Dynamic weight adjustments:**
- Low RMS (< 0.01): voice weight reduced to 0.2
- No face detected: face weight reduced to 0.2
- Weak SER confidence: voice weight × 0.5
- Weak VER confidence: face weight × 0.5

**Sticky Dominant Logic:**
- `DOMINANT_SWITCH_MARGIN = 0.08` — new emotion must lead by this margin
- `DOMINANT_HOLD_UPDATES = 3` — must lead for 3 consecutive updates

### Fusion Presets (UI)

| Preset | Alpha | Voice Weight | Use Case |
|--------|-------|-------------|----------|
| Balanced | 0.50 | 0.40 | Default |
| Voice-first | 0.50 | 0.70 | Phone calls, audio-only |
| Face-first | 0.50 | 0.20 | Silent/visual contexts |
| Smooth | 0.25 | 0.40 | Stable display, less flicker |
| Reactive | 0.85 | 0.40 | Quick response to changes |

---

## 10. LLM Integration (Gemini)

### Response Schema (v0.2)

The LLM returns structured JSON with three distinct emotion assessments:

```json
{
  "assistant_text": "string",
  "voice_emotion": { "label": "string", "confidence": 0.0 },
  "face_emotion": { "label": "string", "confidence": 0.0 },
  "interpreted_emotion": {
    "label": "string",
    "confidence": 0.0,
    "reasoning": "string"
  },
  "tts_speed": 1.0,
  "follow_up_question": "string",
  "safety_note": "string"
}
```

**Required fields:** `assistant_text`, `voice_emotion`, `face_emotion`, `interpreted_emotion`, `tts_speed`

### JSON Validation + Retry

1. Parse response as JSON
2. On `JSONDecodeError`, retry once
3. Apply `_validate_and_clamp()`: fill defaults, clamp `tts_speed` to [0.8, 1.2]
4. On total failure, return fallback neutral response

### `reasoning` Field

The `interpreted_emotion.reasoning` field is for debug/demo only. It explains how voice and face signals were reconciled. It's exposed via the "Why this response?" chip in ChatLog (only visible in debug/demo mode).

---

## 11. TTS

### Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| Model | `tts-1` | Set via `TTS_MODEL` env |
| Voice | `nova` | Fixed, set via `TTS_VOICE` env |
| Speed | 0.8–1.2 | LLM-chosen, clamped |
| Chunk Size | 12,288 bytes | Configurable via `TTS_CHUNK_SIZE` env |
| Format | MP3 | Streamed over WebSocket |

### Streaming Architecture

1. Orchestrator calls `TTSService.synthesize_stream(text, speed)`
2. OpenAI returns streaming MP3 bytes
3. Chunks are buffered to `CHUNK_SIZE`, base64-encoded, sent as `assistant.audio_chunk`
4. Client receives chunks via `audioChunkCbRef` callback (not Zustand)
5. Client feeds chunks into `MediaSource` → `SourceBuffer` for gapless playback
6. `assistant.audio_done` signals stream end

### Metrics

- `tts_first_chunk_ms`: time from TTS request to first chunk received
- `tts_ms`: total TTS streaming time
- Both reported in `debug.metrics` and displayed in Debug panel

---

## 12. WebSocket Protocol (v1)

### Envelope Format

Every message in both directions uses this envelope:

```json
{
  "v": 1,
  "type": "message.type",
  "payload": { ... },
  "session_id": "uuid",
  "ts": 1708300000.123
}
```

| Field | Type | Description |
|-------|------|-------------|
| `v` | number | Protocol version (always 1) |
| `type` | string | Message type identifier |
| `payload` | object | Message-specific data |
| `session_id` | string | Session UUID |
| `ts` | number | Timestamp (server: `time.time()`, client: `Date.now()`) |

### Message Types

#### Client → Orchestrator

| Type | Payload | Description |
|------|---------|-------------|
| `session.start` | `{ session_id, ser_mode, fusion, device_id, memory_enabled }` | Initialize session |
| `audio.chunk` | `{ data, format, seq }` | PCM float32 audio chunk |
| `ver.frame` | `{ data, ts }` | JPEG frame for VER |
| `stt.request` | `{ data, duration_ms }` | Audio blob for server-side STT |
| `turn.complete` | `{ duration_ms }` | Gemini unified mode trigger |
| `memory.clear` | `{ scope: "session" \| "all" }` | Clear memory |

#### Orchestrator → Client

| Type | Payload | Description |
|------|---------|-------------|
| `session.started` | `{ session_id }` | Session confirmed |
| `session.ready` | `{ models }` | Models warmed up and ready |
| `stt.final` | `{ text }` | Transcription result |
| `stt.error` | `{ message }` | STT failure |
| `emotion.ser` | `{ label, confidence, weak?, source? }` | Voice emotion |
| `emotion.ver` | `{ label, confidence, face_present, weak? }` | Face emotion |
| `emotion.sensor_fused` | `{ dominant, confidence, trend, face_present }` | Realtime sensor fusion |
| `emotion.fused` | `{ dominant, confidence, trend, face_present, summary_text }` | LLM turn interpretation |
| `assistant.response_start` | `{ turn_id }` | Turn begins |
| `assistant.text` | `{ text, interpreted_emotion, follow_up_question }` | LLM response text |
| `assistant.audio_chunk` | `{ audio_b64, format }` | Streaming TTS chunk |
| `assistant.audio_done` | `{ format, tts_failed? }` | TTS stream complete |
| `assistant.response_end` | `{ tts_failed }` | Turn complete |
| `memory.cleared` | `{ scope }` | Memory cleared confirmation |
| `debug.metrics` | `{ ser_ms, ver_ms, llm_ms, tts_ms, tts_first_chunk_ms }` | Performance metrics |
| `error` | `{ message, type }` | General error |

---

## 13. Client Architecture

### State Management (Zustand)

The store holds UI-relevant state only. Audio chunks are **not** in the store — they flow through a `useRef` callback:

| State | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Current session UUID |
| `deviceId` | string | Persistent device UUID (localStorage) |
| `status` | AppStatus | idle / listening / thinking / speaking |
| `memoryEnabled` | boolean | Save conversations toggle |
| `serEmotion` | SERResult | Latest voice emotion |
| `verEmotion` | VERResult | Latest face emotion |
| `fusedEmotion` | FusedEmotion | LLM turn interpretation (hero) |
| `sensorFused` | SensorFusedEmotion | Realtime sensor fusion (live affect) |
| `interpretedEmotion` | InterpretedEmotion | LLM interpretation details |
| `emotionHistory` | EmotionSnapshot[] | Timeline data (last 40) |
| `messages` | ChatMessage[] | Chat log |
| `audioStreaming` | boolean | TTS stream active |

### Audio Pipeline (Ref-Based)

```
WS receives assistant.audio_chunk
  → audioChunkCbRef.current(b64)    // Ref callback, no store
    → pendingRef.current.push(bytes)
    → initMediaSource() or flushPending()
      → SourceBuffer.appendBuffer()
      → <audio>.play()
```

### Hooks

| Hook | Purpose |
|------|---------|
| `useWebSocket` | WS connection, dispatch, `audioChunkCbRef` |
| `useAudioCapture` | Mic → PCM float32 + WebM blob |
| `useVideoCapture` | Camera → JPEG frames at N fps |
| `usePushToTalk` | Space key hold/release |
| `useSTT` | Audio blob → base64 (for WS proxy) |

### Hotkey Behavior

- **Space hold:** Start PTT (interrupts current TTS if playing)
- **Space release:** Stop PTT, send audio for processing
- **F12:** Toggle debug panel
- **Interrupt during speaking:** Tears down MediaSource, clears audio
- **Interrupt during thinking:** Same as above (works in any state)

---

## 14. Episodic Memory

### Schema (v0.2)

```sql
CREATE TABLE episodes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       TEXT    NOT NULL,
    device_id        TEXT,
    user_text        TEXT    NOT NULL,
    assistant_text   TEXT    NOT NULL,
    dominant_emotion TEXT,
    emotion_confidence REAL,
    trend            TEXT,
    emotion_summary  TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Features

- **Session memory:** `get_last_n(session_id, n=6)` for conversation context
- **Device memory:** `get_user_context(device_id, n=3)` for cross-session continuity
- **Memory control:** Saving can be disabled per-session via `memory_enabled` flag
- **Clear operations:** `clear_session(session_id)` and `clear_all(device_id)`
- **Schema migration:** Columns added automatically on startup if missing

### Data Handling Statement

- Webcam frames are **never stored** on disk
- Audio PCM chunks are **never persisted** — only used in-memory for SER
- WebM audio blobs are **transient** — sent to OpenAI STT then discarded
- Only **transcripts** and **emotion summaries** are stored in the local SQLite database
- The database is local to the machine — no cloud sync

---

## 15. UI Components

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Nearu Sense    [Camera badge]  [Clear Chat]  [StatusBadge]     │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │  Turn Interpretation │
│          [PTT Button]                     │  ┌───────────┐      │
│          [Waveform]                       │  │  HAPPY     │      │
│                                           │  │  ██████ 85%│      │
│  ┌─ Transcript ─────────────────────┐     │  └───────────┘      │
│  │  "What's the weather today?"     │     │                     │
│  └──────────────────────────────────┘     │  Live Affect         │
│                                           │  calm 72%            │
│  ┌─ Conversation ───────────────────┐     │                     │
│  │ User: What's the weather today?  │     │  ┌Voice┐ ┌Face ┐   │
│  │ AI: It looks like...             │     │  │happy│ │happy│   │
│  │     [Why this response?]         │     │  │ 92% │ │ 78% │   │
│  └──────────────────────────────────┘     │  └─────┘ └─────┘   │
│                                           │                     │
│                                           │  Timeline (20s)      │
│                                           │  ┌───────────┐      │
│                                           │  │ ▁▂▃▅▇▅▃▂▁ │      │
│                                           │  └───────────┘      │
└───────────────────────────────────────────┴─────────────────────┘
```

### Emotion Panel Sections

1. **Turn Interpretation** (hero): LLM's combined emotion + confidence bar
2. **Live Affect**: Realtime sensor fusion (smaller, updates during PTT)
3. **Voice Signal**: SER result (shows spinner during listening/thinking)
4. **Face Signal**: VER result (shows "Camera off" when no face)

### Status Microcopy

| State | Display |
|-------|---------|
| `idle` | "Ready" |
| `listening` | "Listening…" |
| `thinking` | "Reading your tone…" |
| `speaking` | "Speaking…" |

### Camera Privacy Badge

When camera is enabled, a small badge reads: **"Camera processing is local"**

### "Why this response?" Debug Chip

On assistant messages in demo/debug mode, an expandable chip shows `interpreted_emotion.reasoning` — explaining how voice and face signals were reconciled.

---

## 16. Prompts Reference

### System Prompt (Text Path)

```
You are a helpful, conversational assistant with emotional awareness.
Give thorough, natural-length answers — don't cut yourself short.

You receive raw emotion sensor data from two independent sources:
  • SER (Speech Emotion Recognition) — emotion detected from the user's voice
  • VER (Visual Emotion Recognition) — emotion detected from the user's face via webcam

Your job:
1. Report voice_emotion — your best reading of the voice signal alone.
2. Report face_emotion — your best reading of the face signal alone.
3. Report interpreted_emotion — the COMBINED state after genuinely weighing
   both voice AND face. This must NOT simply copy voice_emotion.
4. Craft a response that naturally adapts to the interpreted emotion —
   NEVER say 'I can see you are sad' directly.
5. Choose a speech speed that matches the emotional moment.

Guidelines:
- Give roughly equal weight to voice and face when both are available and confident.
- If one signal is low-confidence or missing, rely more on the other.
- If voice and face conflict strongly, avoid emotional certainty and respond neutrally supportive.
- If signals are weak or conflicting, use neutral or lower confidence rather than guessing.
- When the user seems stressed, prefer shorter, step-by-step replies.
- If the user seems angry or fearful, be reassuring and gentle.
- If the user seems happy or surprised, match their energy.
- If the user seems sad, be gentle and supportive.
- Always be warm but not patronising.
```

### STT Anti-Hallucination

- Language forced to `en`
- Prompt: "The user is speaking in English in a conversational tone."
- Minimum audio size: 4KB
- Minimum transcript length: 2 characters

---

## 17. Tuning Parameters

### Orchestrator

| Parameter | Location | Default | Range | Description |
|-----------|----------|---------|-------|-------------|
| `ema_alpha` | FusionService | 0.50 | 0.01–1.0 | EMA smoothing (higher = more reactive) |
| `ser_weight` | FusionService | 0.40 | 0.0–1.0 | Base voice weight |
| `ver_weight` | FusionService | 0.60 | 0.0–1.0 | Base face weight |
| `MIN_SER_CONF` | fusion_service.py | 0.30 | 0.0–1.0 | Below this, SER considered weak |
| `MIN_VER_CONF` | fusion_service.py | 0.30 | 0.0–1.0 | Below this, VER considered weak |
| `DOMINANT_SWITCH_MARGIN` | fusion_service.py | 0.08 | 0.0–0.5 | Margin to switch dominant |
| `DOMINANT_HOLD_UPDATES` | fusion_service.py | 3 | 1–10 | Consecutive updates before switch |
| `TTS_SPEED_MIN` | gemini_service.py | 0.80 | – | Min clamped TTS speed |
| `TTS_SPEED_MAX` | gemini_service.py | 1.20 | – | Max clamped TTS speed |
| `TTS_CHUNK_SIZE` | tts_service.py | 12288 | 4096–65536 | Streaming chunk size (bytes) |
| `FACE_LOST_COOLDOWN` | ver_service.py | 3 | 1–10 | Frames before face_present=false |

### Client

| Parameter | Location | Default | Description |
|-----------|----------|---------|-------------|
| VER FPS | useVideoCapture | 3 | Frames per second sent to orchestrator |
| PCM timeslice | useAudioCapture | 1000ms | Audio chunk interval |
| Reconnect delay | useWebSocket | 2000ms | WS reconnection timeout |
| History length | sessionStore | 40 | Emotion timeline points |

---

## 18. Known Constraints & Design Decisions

### Critical

1. ~~**Client-side API key exposure**~~ **RESOLVED in v0.2** — All API calls now proxied through orchestrator

### Architectural

2. **ScriptProcessorNode is deprecated** — Planned migration to AudioWorkletNode in v0.3
3. **Post-utterance STT** — Not real-time streaming; this is intentional for v0.2 simplicity
4. **SER model may be slow on CPU** — wav2vec2-large can take 300-700ms per chunk on Windows CPU

### Operational

5. **Cloud dependency** — Requires OpenAI and Google Gemini APIs; no offline LLM/STT/TTS fallback
6. **Single language** — English only (STT language forced to `en`)
7. **Local-only memory** — SQLite on local machine; no cloud sync or multi-device support
8. **Face detection limitations** — Haar Cascade may struggle with non-frontal faces, poor lighting
9. **No authentication** — Single-user desktop app; no login or multi-user support

### Cloud Outage Behavior

| Service | Behavior |
|---------|----------|
| OpenAI unavailable | STT fails → `stt.error`; TTS fails → `assistant.audio_done` with `tts_failed: true` (text-only mode) |
| Gemini unavailable | LLM fails → fallback neutral response text, emotion set to neutral |

### Trust & Safety Microcopy

- "Emotion signals are approximate and optional."
- "Nearu adapts tone, not diagnosis."
- "Camera processing is local."

---

## 19. Test Plan

### Latency Benchmarks

| Metric | Target | How to Measure |
|--------|--------|----------------|
| SER inference | < 400ms | `debug.metrics.ser_ms` |
| VER inference | < 300ms | `debug.metrics.ver_ms` |
| LLM response | < 4000ms | `debug.metrics.llm_ms` |
| TTS first byte | < 1500ms | `debug.metrics.tts_first_chunk_ms` |
| TTS total | < 8000ms | `debug.metrics.tts_ms` |

### UX Scenarios

- [ ] PTT start → status changes to "Listening…"
- [ ] PTT release → status changes to "Reading your tone…"
- [ ] Response arrives → status changes to "Speaking…"
- [ ] PTT interrupt during speaking → audio stops, new recording starts
- [ ] Camera toggle off → VER shows "Camera off", Live Affect stops updating face
- [ ] Mode switching (local/gemini/hybrid) → reconnect with new settings
- [ ] Clear Chat → all messages cleared, emotion reset, audio teardown
- [ ] Fusion preset buttons → sliders update to preset values

### Reliability

- [ ] Gemini timeout → fallback response appears, UI doesn't hang
- [ ] TTS failure → text still shows, `tts_failed` flag in audio_done
- [ ] WS disconnect → auto-reconnect after 2s
- [ ] Invalid STT audio → `stt.error` shown to user
- [ ] Empty/silent audio → STT gracefully rejected (min bytes check)

### Edge Cases

- [ ] Silence (no speech) → SER returns neutral with low confidence
- [ ] No face in frame → VER returns face_present: false after cooldown
- [ ] Very short utterance (< 1s) → Minimum size check rejects
- [ ] Very long utterance (> 30s) → Works but may have higher latency
- [ ] Rapid PTT toggling → Audio teardown handles cleanly
- [ ] Memory disabled → save_episode skipped, no DB writes

### Privacy

- [ ] Memory toggle off → no new episodes saved
- [ ] Clear session → only current session deleted
- [ ] Clear all → all device episodes deleted
- [ ] Camera badge visible when camera enabled
- [ ] No API keys in client bundle

---

## 20. Demo Mode

### Features

- Manual emotion override (select from 9 emotions)
- Simulation toggles:
  - **Simulate no face** — forces face_present: false
  - **Simulate STT failure** — triggers stt.error flow
  - **Simulate camera off** — disables VER
- "Why this response?" chip visible on assistant messages
- Debug panel (F12) with full metrics and raw emotion data

### Recommended Demo Flow

1. Start with Hybrid mode for real-time SER display
2. Show emotion panel updating while speaking
3. Demonstrate PTT interruption
4. Switch to Settings → show fusion presets
5. Toggle demo mode → force different emotions
6. Show Debug panel for latency metrics

---

*Last updated: v0.2 — February 2026*
