import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'
import type { FusedEmotion, InterpretedEmotion, SERResult, VERResult } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8765/ws'
const RECONNECT_DELAY = 2000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()

  const sessionId = useSessionStore((s) => s.sessionId)
  const setSessionId = useSessionStore((s) => s.setSessionId)
  const setSER = useSessionStore((s) => s.setSER)
  const setVER = useSessionStore((s) => s.setVER)
  const setFused = useSessionStore((s) => s.setFused)
  const setPartial = useSessionStore((s) => s.setPartialTranscript)
  const addMessage = useSessionStore((s) => s.addMessage)
  const enqueueAudio = useSessionStore((s) => s.enqueueAudio)
  const setAudioStreaming = useSessionStore((s) => s.setAudioStreaming)
  const setInterpreted = useSessionStore((s) => s.setInterpreted)
  const setStatus = useSessionStore((s) => s.setStatus)
  const mergeDebug = useSessionStore((s) => s.mergeDebugMetrics)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      const state = useSessionStore.getState()
      const id = sessionId || crypto.randomUUID()
      send('session.start', {
        session_id: id,
        ser_mode: state.settings.serMode,
        fusion: state.settings.fusion,
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
    (type: string, payload: Record<string, unknown>, sid: string | null) => {
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
            followUp: payload.follow_up_question as string | undefined
          })
          setAudioStreaming(true)
          setStatus('speaking')
          break
        case 'assistant.audio_chunk':
          enqueueAudio(payload.audio_b64 as string)
          break
        case 'assistant.audio_done':
          setAudioStreaming(false)
          break
        case 'assistant.audio_ready':
          enqueueAudio(payload.audio_b64 as string)
          break
        case 'debug.metrics':
          mergeDebug(payload as Record<string, number>)
          break
      }
    },
    [setSER, setVER, setFused, setInterpreted, setPartial, addMessage, enqueueAudio, setAudioStreaming, setStatus, setSessionId, mergeDebug]
  )

  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        type,
        payload,
        session_id: useSessionStore.getState().sessionId
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

  return { send, wsRef }
}
