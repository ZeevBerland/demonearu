import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useVideoCapture } from '../hooks/useVideoCapture'
import { usePushToTalk } from '../hooks/usePushToTalk'
import { useSTT } from '../hooks/useSTT'
import { useWebSocket } from '../hooks/useWebSocket'

import { StatusBadge } from '../components/StatusBadge'
import { PushToTalkButton } from '../components/PushToTalkButton'
import { WaveformMeter } from '../components/WaveformMeter'
import { TranscriptView } from '../components/TranscriptView'
import { EmotionPanel } from '../components/EmotionPanel'
import { EmotionTimeline } from '../components/EmotionTimeline'
import { ChatLog } from '../components/ChatLog'

export function SessionPage() {
  const status = useSessionStore((s) => s.status)
  const addMessage = useSessionStore((s) => s.addMessage)
  const setStatus = useSessionStore((s) => s.setStatus)
  const setPartial = useSessionStore((s) => s.setPartialTranscript)
  const dequeueAudio = useSessionStore((s) => s.dequeueAudio)
  const clearAudioQueue = useSessionStore((s) => s.clearAudioQueue)
  const setAudioStreaming = useSessionStore((s) => s.setAudioStreaming)
  const audioQueue = useSessionStore((s) => s.audioQueue)
  const audioStreaming = useSessionStore((s) => s.audioStreaming)
  const cameraEnabled = useSessionStore((s) => s.settings.cameraEnabled)

  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playingRef = useRef(false)

  const msRef = useRef<MediaSource | null>(null)
  const sbRef = useRef<SourceBuffer | null>(null)
  const pendingRef = useRef<Uint8Array[]>([])
  const streamEndedRef = useRef(false)

  const reset = useSessionStore((s) => s.reset)

  const { send } = useWebSocket()
  const { transcribe } = useSTT()

  const onPcmChunk = useCallback(
    (b64: string) => {
      send('audio.chunk', { data: b64, format: 'f32le', seq: Date.now() })
    },
    [send]
  )

  const { start: startAudio, stop: stopAudio, getFrequencyData } = useAudioCapture({
    onPcmChunk,
    timeslice: 1000
  })

  const onVideoFrame = useCallback(
    (jpegBase64: string) => {
      send('ver.frame', { data: jpegBase64, ts: Date.now() / 1000 })
    },
    [send]
  )

  const { start: startVideo, stop: stopVideo } = useVideoCapture({
    fps: 3,
    onFrame: onVideoFrame
  })

  // ── MediaSource gapless streaming ──

  const flushPending = useCallback(() => {
    const sb = sbRef.current
    if (!sb || sb.updating) return
    if (pendingRef.current.length > 0) {
      const next = pendingRef.current.shift()!
      try {
        sb.appendBuffer(next)
      } catch {
        setTimeout(() => flushPending(), 0)
      }
    } else if (streamEndedRef.current && msRef.current?.readyState === 'open') {
      try { msRef.current.endOfStream() } catch { /* already ended */ }
    }
  }, [])

  const teardownMediaSource = useCallback(() => {
    const audio = currentAudioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    currentAudioRef.current = null
    msRef.current = null
    sbRef.current = null
    pendingRef.current = []
    streamEndedRef.current = false
    playingRef.current = false
  }, [])

  const initMediaSource = useCallback(() => {
    if (msRef.current) return

    const ms = new MediaSource()
    msRef.current = ms
    streamEndedRef.current = false

    const audio = new Audio()
    currentAudioRef.current = audio
    audio.src = URL.createObjectURL(ms)

    ms.addEventListener('sourceopen', () => {
      try {
        const sb = ms.addSourceBuffer('audio/mpeg')
        sbRef.current = sb
        sb.addEventListener('updateend', flushPending)
        flushPending()
      } catch (e) {
        console.error('[audio] addSourceBuffer failed:', e)
      }
    })

    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audio.src)
      currentAudioRef.current = null
      msRef.current = null
      sbRef.current = null
      pendingRef.current = []
      streamEndedRef.current = false
      playingRef.current = false
      useSessionStore.getState().setStatus('idle')
    })

    audio.play().catch(console.error)
    playingRef.current = true
    useSessionStore.getState().setStatus('speaking')
  }, [flushPending])

  useEffect(() => {
    let enqueued = false
    while (true) {
      const b64 = dequeueAudio()
      if (!b64) break
      pendingRef.current.push(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      enqueued = true
    }
    if (!enqueued) return
    if (!msRef.current) {
      initMediaSource()
    } else {
      flushPending()
    }
  }, [audioQueue, dequeueAudio, initMediaSource, flushPending])

  useEffect(() => {
    if (!audioStreaming && msRef.current) {
      streamEndedRef.current = true
      flushPending()
    }
  }, [audioStreaming, flushPending])

  // ── PTT handlers ──

  const handlePTTStart = useCallback(() => {
    teardownMediaSource()
    clearAudioQueue()
    setAudioStreaming(false)

    setPartial('')
    startAudio()
    if (cameraEnabled) startVideo()
  }, [teardownMediaSource, startAudio, startVideo, cameraEnabled, setPartial, clearAudioQueue, setAudioStreaming])

  const serMode = useSessionStore((s) => s.settings.serMode)

  const handlePTTStop = useCallback(async () => {
    stopVideo()
    const audioBlob = await stopAudio()
    if (audioBlob.size < 1000) {
      setStatus('idle')
      return
    }

    if (serMode === 'gemini') {
      send('turn.complete', { duration_ms: 0 })
    } else {
      const transcript = await transcribe(audioBlob)
      if (!transcript.trim()) {
        setStatus('idle')
        return
      }

      setPartial(transcript)
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        text: transcript,
        timestamp: Date.now()
      })

      send('stt.final', { text: transcript, duration_ms: 0 })
    }
  }, [stopAudio, stopVideo, transcribe, send, addMessage, setStatus, setPartial, serMode])

  usePushToTalk({ onStart: handlePTTStart, onStop: handlePTTStop })

  return (
    <div className="flex h-full gap-4 p-4">
      {/* Left: main interaction */}
      <div className="flex flex-1 flex-col gap-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Nearu Sense</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { teardownMediaSource(); reset(); }}
              className="rounded px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-surface-2 transition-colors"
            >
              Clear Chat
            </button>
            <StatusBadge status={status} />
          </div>
        </div>

        {/* PTT + waveform */}
        <div className="flex flex-col items-center gap-4 py-4">
          <PushToTalkButton onPointerDown={handlePTTStart} onPointerUp={handlePTTStop} />
          <WaveformMeter getFrequencyData={getFrequencyData} active={status === 'listening'} />
        </div>

        {/* Transcript */}
        <TranscriptView />

        {/* Chat */}
        <div className="flex-1 flex flex-col min-h-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Conversation
          </h3>
          <ChatLog />
        </div>
      </div>

      {/* Right: emotion sidebar */}
      <div className="w-64 flex flex-col gap-4 shrink-0">
        <EmotionPanel />
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Timeline (20s)
          </h3>
          <EmotionTimeline />
        </div>
      </div>
    </div>
  )
}
