from __future__ import annotations

import math
import time
from collections import deque
from typing import Optional

POSITIVE_LABELS = frozenset({"calm", "happy", "neutral", "surprised"})

DOMINANT_SWITCH_MARGIN = 0.08
DOMINANT_HOLD_UPDATES = 3

DEFAULTS = {
    "ema_alpha": 0.90,
    "trend_window_sec": 2.0,
    "buffer_max": 40,
    "ser_weight": 0.4,
    "ver_weight": 0.6,
}


def _safe(v: float, default: float = 0.0) -> float:
    if math.isnan(v) or math.isinf(v):
        return default
    return v


class FusionService:
    """Per-session rolling emotion fusion with EMA smoothing, sticky dominant, and trend detection.

    Works with any label set — no fixed canonical list.
    All tuning knobs can be overridden via the constructor.
    """

    def __init__(
        self,
        ema_alpha: float = DEFAULTS["ema_alpha"],
        trend_window_sec: float = DEFAULTS["trend_window_sec"],
        buffer_max: int = int(DEFAULTS["buffer_max"]),
        ser_weight: float = DEFAULTS["ser_weight"],
        ver_weight: float = DEFAULTS["ver_weight"],
    ) -> None:
        self.ema_alpha = max(0.01, min(1.0, ema_alpha))
        self.trend_window_sec = max(0.5, trend_window_sec)
        self.ser_base_weight = max(0.0, min(1.0, ser_weight))
        self.ver_base_weight = max(0.0, min(1.0, ver_weight))

        buf_max = max(5, int(buffer_max))
        self._ser_buffer: deque[dict] = deque(maxlen=buf_max)
        self._ver_buffer: deque[dict] = deque(maxlen=buf_max)
        self._ema: dict[str, float] = {}
        self._ema_history: deque[tuple[float, dict]] = deque(maxlen=100)
        self._last_face_present: bool = False
        self._last_rms: float = 0.0
        self._current_dominant: str = "neutral"
        self._challenger: str | None = None
        self._challenger_streak: int = 0

    def _ensure_label(self, label: str) -> None:
        if label not in self._ema:
            self._ema[label] = 0.0

    def add_ser_result(self, label: str, confidence: float, rms: float = 0.0) -> None:
        confidence = _safe(confidence)
        self._ensure_label(label)
        self._ser_buffer.append({"label": label, "confidence": confidence, "ts": time.time()})
        self._last_rms = _safe(rms)
        self._update_ema()

    def add_ver_result(self, label: str, confidence: float, face_present: bool) -> None:
        confidence = _safe(confidence)
        self._ensure_label(label)
        self._ver_buffer.append(
            {"label": label, "confidence": confidence, "face_present": face_present, "ts": time.time()}
        )
        self._last_face_present = face_present
        self._update_ema()

    # ── EMA ───────────────────────────────────────────────────────

    def _update_ema(self) -> None:
        scores = self._compute_weighted_scores()
        for label in scores:
            self._ensure_label(label)
        a = self.ema_alpha
        for label in self._ema:
            raw = a * scores.get(label, 0.0) + (1 - a) * self._ema[label]
            self._ema[label] = _safe(raw)
        self._ema_history.append((time.time(), dict(self._ema)))
        self._update_dominant()

    def _compute_weighted_scores(self) -> dict[str, float]:
        ser_w = self.ser_base_weight
        ver_w = self.ver_base_weight
        if self._last_rms < 0.01:
            ser_w = 0.2
        if not self._last_face_present:
            ver_w = 0.2

        total_w = ser_w + ver_w
        if total_w == 0:
            n = max(len(self._ema), 1)
            return {l: 1.0 / n for l in self._ema}
        ser_w /= total_w
        ver_w /= total_w

        ser_scores = self._aggregate_buffer(self._ser_buffer)
        ver_scores = self._aggregate_buffer(self._ver_buffer)

        all_labels = set(ser_scores) | set(ver_scores) | set(self._ema)
        combined: dict[str, float] = {}
        for label in all_labels:
            val = ser_w * ser_scores.get(label, 0.0) + ver_w * ver_scores.get(label, 0.0)
            combined[label] = _safe(val)
        return combined

    @staticmethod
    def _aggregate_buffer(buf: deque[dict]) -> dict[str, float]:
        if not buf:
            return {}
        counts: dict[str, float] = {}
        total = 0.0
        for item in buf:
            lbl = item["label"]
            conf = _safe(item["confidence"])
            counts[lbl] = counts.get(lbl, 0.0) + conf
            total += conf
        if total <= 0:
            if not counts:
                return {}
            n = len(counts)
            return {k: 1.0 / n for k in counts}
        return {k: _safe(v / total) for k, v in counts.items()}

    # ── sticky dominant ──────────────────────────────────────────

    def _update_dominant(self) -> None:
        """Only switch dominant emotion if a new label leads by DOMINANT_SWITCH_MARGIN
        for DOMINANT_HOLD_UPDATES consecutive updates."""
        if not self._ema:
            return
        raw_top = max(self._ema, key=lambda l: self._ema[l])
        current_score = _safe(self._ema.get(self._current_dominant, 0.0))
        top_score = _safe(self._ema.get(raw_top, 0.0))

        if raw_top == self._current_dominant:
            self._challenger = None
            self._challenger_streak = 0
            return

        if top_score - current_score > DOMINANT_SWITCH_MARGIN:
            if self._challenger == raw_top:
                self._challenger_streak += 1
            else:
                self._challenger = raw_top
                self._challenger_streak = 1

            if self._challenger_streak >= DOMINANT_HOLD_UPDATES:
                self._current_dominant = raw_top
                self._challenger = None
                self._challenger_streak = 0
        else:
            self._challenger = None
            self._challenger_streak = 0

    # ── outputs ──────────────────────────────────────────────────

    def get_fused(self) -> Optional[dict]:
        if not self._ema_history:
            return None
        dominant = self._current_dominant
        confidence = _safe(self._ema.get(dominant, 0.0))
        trend = self._compute_trend(dominant)
        return {
            "dominant": dominant,
            "confidence": round(confidence, 3),
            "trend": trend,
            "face_present": self._last_face_present,
            "summary_text": self._build_summary(dominant, confidence, trend),
        }

    def get_summary(self) -> dict:
        fused = self.get_fused()
        if fused is None:
            return {"dominant": "neutral", "confidence": 0.0, "trend": "stable", "window_sec": 0}
        fused["window_sec"] = min(8, len(self._ema_history) * 0.5)
        return fused

    def get_raw_signals(self) -> dict:
        """Return the latest raw SER and VER readings for direct LLM consumption."""
        ser: dict = {"label": "neutral", "confidence": 0.0, "recent": []}
        ver: dict = {"label": "neutral", "confidence": 0.0, "face_present": False, "recent": []}

        if self._ser_buffer:
            latest = self._ser_buffer[-1]
            ser["label"] = latest["label"]
            ser["confidence"] = round(_safe(latest["confidence"]), 2)
            ser["recent"] = [
                {"label": e["label"], "confidence": round(_safe(e["confidence"]), 2)}
                for e in list(self._ser_buffer)[-5:]
            ]

        if self._ver_buffer:
            latest = self._ver_buffer[-1]
            ver["label"] = latest["label"]
            ver["confidence"] = round(_safe(latest["confidence"]), 2)
            ver["face_present"] = latest.get("face_present", False)
            ver["recent"] = [
                {"label": e["label"], "confidence": round(_safe(e["confidence"]), 2)}
                for e in list(self._ver_buffer)[-5:]
            ]

        return {"ser": ser, "ver": ver}

    def _compute_trend(self, dominant: str) -> str:
        now = time.time()
        past_entries = [e for ts, e in self._ema_history if now - ts >= self.trend_window_sec - 1]
        if not past_entries:
            return "stable"
        past_val = _safe(past_entries[0].get(dominant, 0.0))
        current_val = _safe(self._ema.get(dominant, 0.0))
        diff = current_val - past_val
        if diff > 0.05:
            return "improving" if dominant in POSITIVE_LABELS else "worsening"
        if diff < -0.05:
            return "worsening" if dominant in POSITIVE_LABELS else "improving"
        return "stable"

    @staticmethod
    def _build_summary(dominant: str, confidence: float, trend: str) -> str:
        pct = int(_safe(confidence) * 100)
        trend_arrow = {"improving": "↑", "worsening": "↓", "stable": "→"}.get(trend, "→")
        return f"User appears {dominant} ({pct}% confidence, {trend} {trend_arrow})"
