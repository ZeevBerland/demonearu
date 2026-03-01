from __future__ import annotations

import json
from typing import Optional

import os

import aiosqlite

DB_PATH = os.path.join(os.environ.get("NEARU_DATA_DIR", "."), "nearu_memory.db")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS episodes (
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
"""

MIGRATE_COLUMNS = [
    ("device_id", "TEXT"),
    ("dominant_emotion", "TEXT"),
    ("emotion_confidence", "REAL"),
    ("trend", "TEXT"),
]


class MemoryService:
    """Async SQLite-backed episodic memory store."""

    def __init__(self, db_path: str = DB_PATH) -> None:
        self._db_path = db_path
        self._db: Optional[aiosqlite.Connection] = None

    async def init(self) -> None:
        self._db = await aiosqlite.connect(self._db_path)
        await self._db.execute(CREATE_TABLE)
        await self._db.commit()
        await self._migrate()

    async def _migrate(self) -> None:
        cursor = await self._db.execute("PRAGMA table_info(episodes)")
        existing = {row[1] for row in await cursor.fetchall()}
        for col, dtype in MIGRATE_COLUMNS:
            if col not in existing:
                await self._db.execute(f"ALTER TABLE episodes ADD COLUMN {col} {dtype}")
                print(f"[memory] Migrated: added column {col}")
        await self._db.commit()

    async def save_episode(
        self,
        session_id: str,
        user_text: str,
        assistant_text: str,
        emotion_summary: Optional[dict] = None,
        device_id: Optional[str] = None,
    ) -> None:
        dominant = emotion_summary.get("dominant") if emotion_summary else None
        confidence = emotion_summary.get("confidence") if emotion_summary else None
        trend = emotion_summary.get("trend") if emotion_summary else None
        await self._db.execute(
            "INSERT INTO episodes (session_id, device_id, user_text, assistant_text, "
            "dominant_emotion, emotion_confidence, trend, emotion_summary) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, device_id, user_text, assistant_text,
             dominant, confidence, trend,
             json.dumps(emotion_summary) if emotion_summary else None),
        )
        await self._db.commit()

    async def get_last_n(self, session_id: str, n: int = 6) -> list[dict]:
        cursor = await self._db.execute(
            "SELECT user_text, assistant_text, emotion_summary, created_at "
            "FROM episodes WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            (session_id, n),
        )
        rows = await cursor.fetchall()
        return [
            {
                "user_text": r[0],
                "assistant_text": r[1],
                "emotion_summary": json.loads(r[2]) if r[2] else None,
                "created_at": r[3],
            }
            for r in reversed(rows)
        ]

    async def get_user_context(self, device_id: str, n: int = 3) -> list[dict]:
        """Pull cross-session context for a device."""
        cursor = await self._db.execute(
            "SELECT user_text, assistant_text, emotion_summary, created_at "
            "FROM episodes WHERE device_id = ? ORDER BY created_at DESC LIMIT ?",
            (device_id, n),
        )
        rows = await cursor.fetchall()
        return [
            {
                "user_text": r[0],
                "assistant_text": r[1],
                "emotion_summary": json.loads(r[2]) if r[2] else None,
                "created_at": r[3],
            }
            for r in reversed(rows)
        ]

    async def clear_session(self, session_id: str) -> None:
        await self._db.execute("DELETE FROM episodes WHERE session_id = ?", (session_id,))
        await self._db.commit()

    async def clear_all(self, device_id: str) -> None:
        await self._db.execute("DELETE FROM episodes WHERE device_id = ?", (device_id,))
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
