# Nearu Sense v0.1

Desktop app that listens via push-to-talk, runs Speech Emotion Recognition (SER) and Visual Emotion Recognition (VER) in real-time, fuses them into an emotion state, and uses that state to steer an AI assistant's response content and vocal delivery.

## Architecture

- **Client** — Electron + React + TypeScript desktop app (mic, webcam, UI)
- **Orchestrator** — Python FastAPI server (SER, VER, fusion, Gemini LLM, OpenAI TTS, memory)
- **Cloud** — OpenAI STT/TTS APIs, Google Gemini 3 Flash

## Prerequisites

- Node.js 20+
- Python 3.11+
- ffmpeg installed and on PATH (required for audio decoding)

## Setup

### Orchestrator

```bash
cd orchestrator
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
cp .env.example .env         # fill in API keys
python main.py
```

### Client

```bash
cd client
npm install
cp .env.example .env         # fill in API keys
npm run dev
```

## Usage

1. Start the orchestrator (`python main.py`)
2. Start the client (`npm run dev`)
3. Hold **Space** to talk — release to send
4. Watch real-time emotion tracking and AI responses
5. Press **F12** to toggle the debug panel
