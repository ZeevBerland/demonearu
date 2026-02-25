from __future__ import annotations

import asyncio

import numpy as np
import torch

from utils.audio_utils import decode_pcm_f32, compute_rms

MIN_SAMPLES = 8_000  # 0.5s at 16kHz
LOW_ENERGY_THRESHOLD = 0.01

MODEL_ID = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"

WEIGHT_REMAP = {
    "classifier.dense.weight": "projector.weight",
    "classifier.dense.bias": "projector.bias",
    "classifier.output.weight": "classifier.weight",
    "classifier.output.bias": "classifier.bias",
}


class SERService:
    """Speech Emotion Recognition using ehcalabres wav2vec2 (RAVDESS, 8 classes).

    Raw labels: angry, calm, disgust, fearful, happy, neutral, sad, surprised.
    """

    def __init__(self) -> None:
        self._pipe = None
        self._buffer = np.array([], dtype=np.float32)

    async def load(self) -> None:
        self._pipe = await asyncio.to_thread(self._load_model)

    @staticmethod
    def _load_model():
        from transformers import AutoConfig, AutoModelForAudioClassification, AutoFeatureExtractor, pipeline
        from huggingface_hub import hf_hub_download

        config = AutoConfig.from_pretrained(MODEL_ID)
        config.classifier_proj_size = 1024
        model = AutoModelForAudioClassification.from_config(config)

        try:
            ckpt_path = hf_hub_download(MODEL_ID, "model.safetensors")
            from safetensors.torch import load_file
            raw_sd = load_file(ckpt_path)
        except Exception:
            ckpt_path = hf_hub_download(MODEL_ID, "pytorch_model.bin")
            raw_sd = torch.load(ckpt_path, map_location="cpu", weights_only=True)

        remapped_sd = {}
        remapped_keys = []
        for key, val in raw_sd.items():
            new_key = WEIGHT_REMAP.get(key, key)
            if new_key != key:
                remapped_keys.append(f"  {key} → {new_key}")
            remapped_sd[new_key] = val

        result = model.load_state_dict(remapped_sd, strict=False)
        print(f"[ser] Loaded checkpoint with {len(remapped_keys)} remapped keys:")
        for rk in remapped_keys:
            print(rk)
        if result.missing_keys:
            print(f"[ser] Still missing: {result.missing_keys}")
        if result.unexpected_keys:
            print(f"[ser] Unexpected: {result.unexpected_keys}")

        feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_ID)

        return pipeline(
            "audio-classification",
            model=model,
            feature_extractor=feature_extractor,
            device="cpu",
        )

    async def infer(self, audio_bytes: bytes) -> dict | None:
        """Run SER on raw PCM float32 bytes. Returns ``{label, confidence, rms}`` or ``None``."""
        pcm = decode_pcm_f32(audio_bytes)
        if pcm is None:
            return None

        self._buffer = np.concatenate([self._buffer, pcm])

        if len(self._buffer) < MIN_SAMPLES:
            return None

        chunk = self._buffer.copy()
        self._buffer = np.array([], dtype=np.float32)

        rms = compute_rms(chunk)
        if rms < LOW_ENERGY_THRESHOLD:
            return {"label": "neutral", "confidence": 0.5, "rms": rms}

        results = await asyncio.to_thread(self._classify, chunk)
        if not results:
            return {"label": "neutral", "confidence": 0.0, "rms": rms}

        top = results[0]
        label = top["label"].lower()
        confidence = float(top["score"])

        return {"label": label, "confidence": round(confidence, 3), "rms": round(rms, 4)}

    async def warmup(self) -> None:
        """Run a dummy inference to warm JIT caches."""
        if self._pipe is None:
            return
        dummy = np.zeros(16_000, dtype=np.float32)
        await asyncio.to_thread(self._classify, dummy)
        print("[ser] Warmup complete.")

    def _classify(self, pcm: np.ndarray) -> list[dict]:
        return self._pipe({"raw": pcm, "sampling_rate": 16_000})
