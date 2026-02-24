import { create } from 'zustand'
import type {
  AppStatus,
  AppSettings,
  ChatMessage,
  DebugMetrics,
  EmotionSnapshot,
  FusedEmotion,
  InterpretedEmotion,
  SERResult,
  VERResult
} from '../types'

interface SessionState {
  sessionId: string | null
  status: AppStatus
  currentPage: 'session' | 'settings'
  showDebug: boolean

  partialTranscript: string
  serEmotion: SERResult | null
  verEmotion: VERResult | null
  fusedEmotion: FusedEmotion | null
  interpretedEmotion: InterpretedEmotion | null
  emotionHistory: EmotionSnapshot[]

  messages: ChatMessage[]
  audioQueue: string[]
  audioStreaming: boolean

  settings: AppSettings
  debugMetrics: DebugMetrics

  setSessionId: (id: string) => void
  setStatus: (s: AppStatus) => void
  setPage: (p: 'session' | 'settings') => void
  toggleDebug: () => void

  setPartialTranscript: (t: string) => void
  setSER: (r: SERResult) => void
  setVER: (r: VERResult) => void
  setFused: (f: FusedEmotion) => void
  setInterpreted: (e: InterpretedEmotion) => void

  addMessage: (m: ChatMessage) => void
  enqueueAudio: (b64: string) => void
  dequeueAudio: () => string | undefined
  clearAudioQueue: () => void
  setAudioStreaming: (s: boolean) => void

  updateSettings: (patch: Partial<AppSettings>) => void
  mergeDebugMetrics: (patch: Partial<DebugMetrics>) => void
  reset: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  sttModel: 'whisper-1',
  ttsVoice: 'alloy',
  emotionSensitivity: 0.5,
  serMode: 'local',
  fusion: {
    emaAlpha: 0.90,
    trendWindowSec: 2.0,
    bufferMax: 40,
    voiceWeight: 0.4,
  },
  demoMode: false,
  demoEmotion: 'neutral',
  cameraEnabled: true
}

const DEFAULT_METRICS: DebugMetrics = {
  ser_ms: 0,
  ver_ms: 0,
  llm_ms: 0,
  tts_ms: 0
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  status: 'idle',
  currentPage: 'session',
  showDebug: false,

  partialTranscript: '',
  serEmotion: null,
  verEmotion: null,
  fusedEmotion: null,
  interpretedEmotion: null,
  emotionHistory: [],

  messages: [],
  audioQueue: [],
  audioStreaming: false,

  settings: { ...DEFAULT_SETTINGS },
  debugMetrics: { ...DEFAULT_METRICS },

  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (s) => set({ status: s }),
  setPage: (p) => set({ currentPage: p }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),

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
  setInterpreted: (e) => set({ interpretedEmotion: e }),

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  enqueueAudio: (b64) => set((s) => ({ audioQueue: [...s.audioQueue, b64] })),
  dequeueAudio: () => {
    const q = get().audioQueue
    if (q.length === 0) return undefined
    const first = q[0]
    set({ audioQueue: q.slice(1) })
    return first
  },
  clearAudioQueue: () => set({ audioQueue: [], audioStreaming: false }),
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
      interpretedEmotion: null,
      emotionHistory: [],
      messages: [],
      audioQueue: [],
      audioStreaming: false,
      debugMetrics: { ...DEFAULT_METRICS }
    })
}))
