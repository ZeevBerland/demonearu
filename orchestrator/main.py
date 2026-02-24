from __future__ import annotations

import os
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from api.ws_handler import SessionHandler  # noqa: E402
from services.ser_service import SERService  # noqa: E402
from services.ver_service import VERService  # noqa: E402
from services.gemini_service import GeminiService  # noqa: E402
from services.gemini_ser_service import GeminiSERService  # noqa: E402
from services.tts_service import TTSService  # noqa: E402
from services.memory_service import MemoryService  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    ser = SERService()
    ver = VERService()
    gemini = GeminiService(api_key=os.environ["GEMINI_API_KEY"])
    gemini_ser = GeminiSERService(api_key=os.environ["GEMINI_API_KEY"])
    tts = TTSService(api_key=os.environ["OPENAI_API_KEY"])
    memory = MemoryService()

    print("[boot] Loading SER model …")
    await ser.load()
    print("[boot] Loading VER model …")
    await ver.load()
    print("[boot] Initializing memory DB …")
    await memory.init()
    print("[boot] All services ready.")

    app.state.ser = ser
    app.state.ver = ver
    app.state.gemini = gemini
    app.state.gemini_ser = gemini_ser
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
        ser=app.state.ser,
        ver=app.state.ver,
        gemini=app.state.gemini,
        gemini_ser=app.state.gemini_ser,
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
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8765")),
        reload=True,
    )
