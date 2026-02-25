// ── WebSocket message types ─────────────────────────────────────────

export interface WSMessage {
  v: number
  type: string
  payload: Record<string, unknown>
  session_id: string | null
  ts: number
}

// ── Emotion ─────────────────────────────────────────────────────────

export type EmotionLabel = string
export type Trend = 'improving' | 'worsening' | 'stable'

export interface SERResult {
  label: EmotionLabel
  confidence: number
}

export interface VERResult {
  label: EmotionLabel
  confidence: number
  face_present: boolean
}

export interface FusedEmotion {
  dominant: EmotionLabel
  confidence: number
  trend: Trend
  face_present: boolean
  summary_text: string
}

export interface SensorFusedEmotion {
  dominant: EmotionLabel
  confidence: number
  trend: Trend
  face_present: boolean
}

export interface InterpretedEmotion {
  label: EmotionLabel
  confidence: number
  reasoning?: string
}

export interface EmotionSnapshot {
  ts: number
  dominant: EmotionLabel
  confidence: number
}

// ── Chat ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  tone?: string
  followUp?: string
  reasoning?: string
}

// ── App status ──────────────────────────────────────────────────────

export type AppStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

// ── Settings ────────────────────────────────────────────────────────

export type SERMode = 'local' | 'gemini' | 'hybrid'

export interface FusionParams {
  emaAlpha: number
  trendWindowSec: number
  bufferMax: number
  voiceWeight: number
}

export interface AppSettings {
  sttModel: string
  ttsVoice: string
  emotionSensitivity: number
  serMode: SERMode
  fusion: FusionParams
  demoMode: boolean
  demoEmotion: EmotionLabel
  cameraEnabled: boolean
  simulateNoFace: boolean
  simulateSttFailure: boolean
  simulateCameraOff: boolean
}

// ── Debug ───────────────────────────────────────────────────────────

export interface DebugMetrics {
  ser_ms: number
  ver_ms: number
  llm_ms: number
  tts_ms: number
  tts_first_chunk_ms: number
}
