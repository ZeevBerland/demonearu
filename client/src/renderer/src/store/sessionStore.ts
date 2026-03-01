import { create } from 'zustand'
import type {
  AppStatus,
  AppSettings,
  ChatMessage,
  DebugMetrics,
  EmotionSnapshot,
  FusedEmotion,
  InterpretedEmotion,
  SensorFusedEmotion,
  SERResult,
  VERResult
} from '../types'

interface SessionState {
  sessionId: string | null
  deviceId: string
  status: AppStatus
  currentPage: 'session' | 'settings' | 'setup'
  showDebug: boolean
  memoryEnabled: boolean

  partialTranscript: string
  serEmotion: SERResult | null
  verEmotion: VERResult | null
  fusedEmotion: FusedEmotion | null
  sensorFused: SensorFusedEmotion | null
  interpretedEmotion: InterpretedEmotion | null
  emotionHistory: EmotionSnapshot[]

  messages: ChatMessage[]
  audioStreaming: boolean
  activeRole: string | null

  settings: AppSettings
  debugMetrics: DebugMetrics

  setSessionId: (id: string) => void
  setStatus: (s: AppStatus) => void
  setPage: (p: 'session' | 'settings' | 'setup') => void
  toggleDebug: () => void
  setMemoryEnabled: (v: boolean) => void
  setActiveRole: (role: string | null) => void

  setPartialTranscript: (t: string) => void
  setSER: (r: SERResult) => void
  setVER: (r: VERResult) => void
  setFused: (f: FusedEmotion) => void
  setSensorFused: (f: SensorFusedEmotion) => void
  setInterpreted: (e: InterpretedEmotion) => void

  addMessage: (m: ChatMessage) => void
  setAudioStreaming: (s: boolean) => void

  updateSettings: (patch: Partial<AppSettings>) => void
  mergeDebugMetrics: (patch: Partial<DebugMetrics>) => void
  reset: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  sttModel: 'whisper-1',
  ttsVoice: 'alloy',
  emotionSensitivity: 0.5,
  serMode: 'gemini',
  fusion: {
    emaAlpha: 0.50,
    trendWindowSec: 2.0,
    bufferMax: 40,
    voiceWeight: 0.4,
  },
  demoMode: false,
  demoEmotion: 'neutral',
  cameraEnabled: true,
  simulateNoFace: false,
  simulateSttFailure: false,
  simulateCameraOff: false,
}

const DEFAULT_METRICS: DebugMetrics = {
  ser_ms: 0,
  ver_ms: 0,
  llm_ms: 0,
  tts_ms: 0,
  tts_first_chunk_ms: 0,
}

function getOrCreateDeviceId(): string {
  const KEY = 'nearu_device_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  deviceId: getOrCreateDeviceId(),
  status: 'idle',
  currentPage: 'session',
  showDebug: false,
  memoryEnabled: true,

  partialTranscript: '',
  serEmotion: null,
  verEmotion: null,
  fusedEmotion: null,
  sensorFused: null,
  interpretedEmotion: null,
  emotionHistory: [],

  messages: [],
  audioStreaming: false,
  activeRole: null,

  settings: { ...DEFAULT_SETTINGS },
  debugMetrics: { ...DEFAULT_METRICS },

  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (s) => set({ status: s }),
  setPage: (p) => set({ currentPage: p }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  setMemoryEnabled: (v) => set({ memoryEnabled: v }),
  setActiveRole: (role) => set({ activeRole: role }),

  setPartialTranscript: (t) => set({ partialTranscript: t }),
  setSER: (r) => set({ serEmotion: r }),
  setVER: (r) => set({ verEmotion: r }),
  setFused: (f) =>
    set((s) => ({
      fusedEmotion: f,
      emotionHistory: [
        ...s.emotionHistory.slice(-39),
        { ts: Date.now(), dominant: f.dominant, confidence: f.confidence }
      ]
    })),
  setSensorFused: (f) => set({ sensorFused: f }),
  setInterpreted: (e) => set({ interpretedEmotion: e }),

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setAudioStreaming: (s) => set({ audioStreaming: s }),

  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
  mergeDebugMetrics: (patch) =>
    set((s) => ({ debugMetrics: { ...s.debugMetrics, ...patch } })),
  reset: () =>
    set({
      sessionId: null,
      status: 'idle',
      partialTranscript: '',
      serEmotion: null,
      verEmotion: null,
      fusedEmotion: null,
      sensorFused: null,
      interpretedEmotion: null,
      emotionHistory: [],
      messages: [],
      audioStreaming: false,
      activeRole: null,
      debugMetrics: { ...DEFAULT_METRICS }
    })
}))
