"""Incremental extraction of ``assistant_text`` sentences from a partial JSON stream.

Gemini with ``response_schema`` outputs structured JSON character-by-character
when ``stream=True``.  This helper accumulates the raw JSON text and extracts
complete sentences from the ``assistant_text`` field as soon as they appear,
enabling TTS to start before the full LLM response is ready.
"""

from __future__ import annotations

import re

MIN_SENTENCE_LEN = 20

_SENTENCE_RE = re.compile(
    r'([^.!?]*[.!?])'   # greedy up-to and including a sentence-ending punctuation
    r'(?=\s|"|$)'        # followed by whitespace, closing quote, or end of string
)


class AssistantTextStreamer:
    """Accumulates Gemini JSON deltas and yields sentences from *assistant_text*.

    Usage::

        streamer = AssistantTextStreamer()
        async for chunk in gemini_stream:
            for sentence in streamer.feed(chunk.text):
                await start_tts(sentence)
        remaining = streamer.flush()
        if remaining:
            await start_tts(remaining)
    """

    def __init__(self) -> None:
        self._buf = ""
        self._inside_text = False
        self._text_start: int | None = None
        self._extracted_len = 0
        self._full_text = ""
        self._escape = False

    @property
    def full_json(self) -> str:
        return self._buf

    @property
    def extracted_text(self) -> str:
        """All assistant_text content extracted so far (sentences + remainder)."""
        return self._full_text

    def feed(self, delta: str) -> list[str]:
        """Append *delta* and return any newly completed sentences."""
        self._buf += delta
        if not self._inside_text:
            self._try_enter()
        if not self._inside_text:
            return []
        return self._scan_sentences()

    def flush(self) -> str:
        """Return any remaining un-yielded text after the stream ends."""
        if not self._inside_text:
            self._try_enter()
        if not self._inside_text:
            return ""
        tail = self._current_value()
        remaining = tail[self._extracted_len:]
        self._extracted_len = len(tail)
        self._full_text = tail
        return remaining.strip()

    # ------------------------------------------------------------------

    def _try_enter(self) -> None:
        """Detect the start of the ``"assistant_text": "`` value in the buffer."""
        marker = '"assistant_text"'
        idx = self._buf.find(marker)
        if idx < 0:
            return
        colon = self._buf.find(":", idx + len(marker))
        if colon < 0:
            return
        quote = self._buf.find('"', colon + 1)
        if quote < 0:
            return
        self._text_start = quote + 1
        self._inside_text = True

    def _current_value(self) -> str:
        """Return the assistant_text value decoded so far (handles JSON escapes)."""
        if self._text_start is None:
            return ""
        raw = self._buf[self._text_start:]
        result: list[str] = []
        i = 0
        while i < len(raw):
            ch = raw[i]
            if ch == '\\' and i + 1 < len(raw):
                nxt = raw[i + 1]
                if nxt == 'n':
                    result.append('\n')
                elif nxt == 't':
                    result.append('\t')
                elif nxt == '"':
                    result.append('"')
                elif nxt == '\\':
                    result.append('\\')
                else:
                    result.append(nxt)
                i += 2
                continue
            if ch == '"':
                break
            result.append(ch)
            i += 1
        return "".join(result)

    def _scan_sentences(self) -> list[str]:
        full = self._current_value()
        self._full_text = full
        unseen = full[self._extracted_len:]
        sentences: list[str] = []
        for m in _SENTENCE_RE.finditer(unseen):
            candidate = unseen[: m.end()].strip()
            if len(candidate) >= MIN_SENTENCE_LEN:
                sentences.append(candidate)
                self._extracted_len += m.end()
                unseen = full[self._extracted_len:]
        return sentences
