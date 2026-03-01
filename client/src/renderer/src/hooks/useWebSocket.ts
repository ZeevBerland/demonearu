import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'
import type { FusedEmotion, InterpretedEmotion, SensorFusedEmotion, SERResult, VERResult } from '../types'

const FALLBACK_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8765/ws'
const RECONNECT_DELAY = 2000

let resolvedWsUrl: string | null = null

async function getWsUrl(): Promise<string> {
  if (resolvedWsUrl) return resolvedWsUrl
  try {
    const port = await window.electronAPI.getWsPort()
    resolvedWsUrl = `ws://127.0.0.1:${port}/ws`
  } catch {
    resolvedWsUrl = FALLBACK_WS_URL
  }
  return resolvedWsUrl
}

export function resetResolvedWsUrl(): void {
  resolvedWsUrl = null
}

export type AudioChunkCallback = (b64: string) => void

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const audioChunkCbRef = useRef<AudioChunkCallback | null>(null)

  const sessionId = useSessionStore((s) => s.sessionId)
  const setSessionId = useSessionStore((s) => s.setSessionId)
  const setSER = useSessionStore((s) => s.setSER)
  const setVER = useSessionStore((s) => s.setVER)
  const setFused = useSessionStore((s) => s.setFused)
  const setPartial = useSessionStore((s) => s.setPartialTranscript)
  const addMessage = useSessionStore((s) => s.addMessage)
  const setAudioStreaming = useSessionStore((s) => s.setAudioStreaming)
  const setSensorFused = useSessionStore((s) => s.setSensorFused)
  const setInterpreted = useSessionStore((s) => s.setInterpreted)
  const setStatus = useSessionStore((s) => s.setStatus)
  const mergeDebug = useSessionStore((s) => s.mergeDebugMetrics)

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = await getWsUrl()
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      const state = useSessionStore.getState()
      const id = sessionId || crypto.randomUUID()
      send('session.start', {
        session_id: id,
        ser_mode: state.settings.serMode,
        fusion: state.settings.fusion,
        device_id: state.deviceId,
        memory_enabled: state.memoryEnabled,
        tts_voice: state.settings.ttsVoice,
      })
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        dispatch(msg.type, msg.payload, msg.session_id)
      } catch {
        /* ignore malformed messages */
      }
    }

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
    }

    ws.onerror = () => ws.close()
  }, [sessionId])

  const dispatch = useCallback(
    (type: string, payload: Record<string, unknown>, _sid: string | null) => {
      switch (type) {
        case 'session.started':
          setSessionId(payload.session_id as string)
          break
        case 'stt.final': {
          const text = payload.text as string
          if (text?.trim()) {
            setPartial(text)
            addMessage({
              id: crypto.randomUUID(),
              role: 'user',
              text,
              timestamp: Date.now()
            })
          }
          break
        }
        case 'emotion.ser':
          setSER(payload as unknown as SERResult)
          break
        case 'emotion.ver':
          setVER(payload as unknown as VERResult)
          break
        case 'emotion.fused':
          setFused(payload as unknown as FusedEmotion)
          break
        case 'emotion.sensor_fused':
          setSensorFused(payload as unknown as SensorFusedEmotion)
          break
        case 'emotion.interpreted':
          setInterpreted(payload as unknown as InterpretedEmotion)
          break
        case 'assistant.text':
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            text: payload.text as string,
            timestamp: Date.now(),
            tone: payload.tone as string,
            followUp: payload.follow_up_question as string | undefined,
            evidenceSummary: (payload.interpreted_emotion as Record<string, unknown>)?.evidence_summary as string | undefined,
          })
          setAudioStreaming(true)
          setStatus('speaking')
          break
        case 'assistant.audio_chunk':
          audioChunkCbRef.current?.(payload.audio_b64 as string)
          break
        case 'assistant.audio_done':
          setAudioStreaming(false)
          break
        case 'assistant.response_start':
          setStatus('thinking')
          break
        case 'assistant.response_end':
          if (useSessionStore.getState().status !== 'speaking') {
            setStatus('idle')
          }
          break
        case 'session.ready':
          break
        case 'stt.error':
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            text: (payload.message as string) || "I didn't catch that, try again.",
            timestamp: Date.now(),
          })
          setStatus('idle')
          break
        case 'memory.cleared':
          break
        case 'debug.metrics':
          mergeDebug(payload as Record<string, number>)
          break
      }
    },
    [setSER, setVER, setFused, setSensorFused, setInterpreted, setPartial, addMessage, setAudioStreaming, setStatus, setSessionId, mergeDebug]
  )

  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        v: 1,
        type,
        payload,
        session_id: useSessionStore.getState().sessionId,
        ts: Date.now(),
      })
    )
  }, [])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    wsRef.current?.close()
  }, [])

  useEffect(() => {
    connect()
    return disconnect
  }, [connect, disconnect])

  return { send, wsRef, audioChunkCbRef }
}
