from __future__ import annotations

import os
import sys

# Fix SSL certificates in PyInstaller bundles (macOS bundles lack system certs)
if getattr(sys, 'frozen', False):
    try:
        import certifi
        os.environ.setdefault('SSL_CERT_FILE', certifi.where())
    except ImportError:
        pass

from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from api.ws_handler import SessionHandler  # noqa: E402
from services.ver_service import VERService  # noqa: E402
from services.gemini_service import GeminiService  # noqa: E402
from services.tts_service import TTSService  # noqa: E402
from services.memory_service import MemoryService  # noqa: E402


def _require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise SystemExit(f"[boot] FATAL: environment variable {name} is not set. "
                         f"Copy .env.example to .env and fill in your keys.")
    return val


@asynccontextmanager
async def lifespan(app: FastAPI):
    openai_key = _require_env("OPENAI_API_KEY")
    gemini_key = _require_env("GEMINI_API_KEY")

    ver = VERService()
    gemini = GeminiService(api_key=gemini_key)
    tts = TTSService(api_key=openai_key)
    memory = MemoryService()

    print("[boot] Loading VER model …")
    await ver.load()
    print("[boot] Warming up VER model …")
    await ver.warmup()
    print("[boot] Initializing memory DB …")
    await memory.init()
    print("[boot] All services ready.")

    app.state.ver = ver
    app.state.gemini = gemini
    app.state.tts = tts
    app.state.memory = memory

    yield

    await memory.close()


app = FastAPI(title="Nearu Sense Orchestrator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    handler = SessionHandler(
        websocket=websocket,
        ver=app.state.ver,
        gemini=app.state.gemini,
        tts=app.state.tts,
        memory=app.state.memory,
    )
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            await handler.handle_message(raw)
    except WebSocketDisconnect:
        await handler.cleanup()


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    frozen = getattr(sys, 'frozen', False)
    uvicorn.run(
        app if frozen else "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8765")),
        reload=not frozen,
    )
