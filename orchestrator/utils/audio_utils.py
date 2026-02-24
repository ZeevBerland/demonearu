from __future__ import annotations

import math

import numpy as np

TARGET_SR = 16_000


def decode_pcm_f32(raw: bytes) -> np.ndarray | None:
    """Decode raw little-endian float32 PCM bytes into a numpy array.

    The client sends raw PCM at 16kHz via Web Audio API ScriptProcessorNode.
    """
    if len(raw) < 64:
        return None
    n = len(raw) // 4
    samples = np.frombuffer(raw[:n * 4], dtype=np.float32).copy()
    samples = np.clip(samples, -1.0, 1.0)
    return samples


def compute_rms(samples: np.ndarray) -> float:
    """Return the RMS energy of an audio buffer."""
    if len(samples) == 0:
        return 0.0
    s = samples.astype(np.float64)
    rms = float(np.sqrt(np.mean(s * s)))
    if math.isnan(rms) or math.isinf(rms):
        return 0.0
    return rms
