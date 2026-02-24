from __future__ import annotations

import asyncio

import cv2
import numpy as np

NORMALIZE: dict[str, str] = {
    "anger": "angry",
    "happiness": "happy",
    "sadness": "sad",
    "surprise": "surprised",
    "fear": "fearful",
}


class VERService:
    """Visual Emotion Recognition using hsemotion-onnx (CPU-friendly)."""

    def __init__(self) -> None:
        self._model = None
        self._face_cascade = None
        self._frame_count = 0

    async def load(self) -> None:
        self._model = await asyncio.to_thread(self._load_model)

    @staticmethod
    def _load_model():
        try:
            from hsemotion_onnx.facial_emotions import HSEmotionRecognizer

            return HSEmotionRecognizer(model_name="enet_b0_8_va_mtl")
        except Exception as exc:
            print(f"[ver] Could not load hsemotion-onnx: {exc}. VER will return neutral.")
            return None

    async def infer(self, frame_bytes: bytes) -> dict | None:
        """Run VER on a JPEG frame. Returns ``{label, confidence, face_present}``."""
        arr = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            self._frame_count += 1
            if self._frame_count <= 3:
                print(f"[ver] Frame decode FAILED — raw bytes length={len(frame_bytes)}, arr shape={arr.shape}")
            return None

        self._frame_count += 1
        if self._frame_count <= 3:
            print(f"[ver] Frame decoded OK — shape={frame.shape}, dtype={frame.dtype}, mean={frame.mean():.1f}")

        if self._model is None:
            return {"label": "neutral", "confidence": 0.0, "face_present": False}

        try:
            result = await asyncio.to_thread(self._predict, frame)
            return result
        except Exception:
            return {"label": "neutral", "confidence": 0.0, "face_present": False}

    def _predict(self, frame: np.ndarray) -> dict:
        if self._face_cascade is None:
            self._face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._face_cascade.detectMultiScale(gray, 1.1, 3, minSize=(30, 30))

        if len(faces) == 0:
            return {"label": "neutral", "confidence": 0.0, "face_present": False}

        x, y, w, h = faces[0]
        face_img = frame[y : y + h, x : x + w]

        emotion, scores = self._model.predict_emotions(face_img, logits=False)
        raw_label = emotion.lower()
        label = NORMALIZE.get(raw_label, raw_label)
        confidence = float(max(scores)) if scores is not None else 0.0

        return {
            "label": label,
            "confidence": round(confidence, 3),
            "face_present": True,
        }
