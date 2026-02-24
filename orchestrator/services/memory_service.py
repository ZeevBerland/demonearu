from __future__ import annotations

import json
from typing import Optional

import aiosqlite

DB_PATH = "nearu_memory.db"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS episodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT    NOT NULL,
    user_text       TEXT    NOT NULL,
    assistant_text  TEXT    NOT NULL,
    emotion_summary TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


class MemoryService:
    """Async SQLite-backed episodic memory store."""

    def __init__(self, db_path: str = DB_PATH) -> None:
        self._db_path = db_path
        self._db: Optional[aiosqlite.Connection] = None

    async def init(self) -> None:
        self._db = await aiosqlite.connect(self._db_path)
        await self._db.execute(CREATE_TABLE)
        await self._db.commit()

    async def save_episode(
        self,
        session_id: str,
        user_text: str,
        assistant_text: str,
        emotion_summary: Optional[dict] = None,
    ) -> None:
        await self._db.execute(
            "INSERT INTO episodes (session_id, user_text, assistant_text, emotion_summary) VALUES (?, ?, ?, ?)",
            (session_id, user_text, assistant_text, json.dumps(emotion_summary) if emotion_summary else None),
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

    async def close(self) -> None:
        if self._db:
            await self._db.close()
