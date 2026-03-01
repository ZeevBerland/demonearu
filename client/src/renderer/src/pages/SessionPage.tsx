import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useVideoCapture } from '../hooks/useVideoCapture'
import { usePushToTalk } from '../hooks/usePushToTalk'
import { useWebSocket } from '../hooks/useWebSocket'

import { PushToTalkButton } from '../components/PushToTalkButton'
import { QuickTools } from '../components/QuickTools'

export function SessionPage() {
  const status = useSessionStore((s) => s.status)
  const setStatus = useSessionStore((s) => s.setStatus)
  const setPartial = useSessionStore((s) => s.setPartialTranscript)
  const setAudioStreaming = useSessionStore((s) => s.setAudioStreaming)
  const audioStreaming = useSessionStore((s) => s.audioStreaming)
  const cameraEnabled = useSessionStore((s) => s.settings.cameraEnabled)
  const fusedEmotion = useSessionStore((s) => s.fusedEmotion)

  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playingRef = useRef(false)

  const msRef = useRef<MediaSource | null>(null)
  const sbRef = useRef<SourceBuffer | null>(null)
  const pendingRef = useRef<Uint8Array[]>([])
  const streamEndedRef = useRef(false)

  const reset = useSessionStore((s) => s.reset)

  const mutedRef = useRef(false)

  const { send, audioChunkCbRef } = useWebSocket()

  const listeningRef = useRef(false)

  const onPcmChunk = useCallback(
    (b64: string) => {
      if (!listeningRef.current) return
      send('audio.chunk', { data: b64, format: 'f32le', seq: Date.now() })
    },
    [send]
  )

  const { start: startAudio, stop: stopAudio, getFrequencyData } = useAudioCapture({
    onPcmChunk,
  })

  void getFrequencyData

  const onVideoFrame = useCallback(
    (jpegBase64: string) => {
      if (!listeningRef.current) return
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
    audioChunkCbRef.current = (b64: string) => {
      pendingRef.current.push(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      if (!msRef.current) {
        initMediaSource()
      } else {
        flushPending()
      }
    }
    return () => { audioChunkCbRef.current = null }
  }, [audioChunkCbRef, initMediaSource, flushPending])

  useEffect(() => {
    if (!audioStreaming && msRef.current) {
      streamEndedRef.current = true
      flushPending()
    }
  }, [audioStreaming, flushPending])

  // ── PTT handlers ──

  const handlePTTStart = useCallback(() => {
    if (mutedRef.current) return

    teardownMediaSource()
    setAudioStreaming(false)

    setPartial('')
    listeningRef.current = true
    startAudio()
    if (cameraEnabled) startVideo()
  }, [teardownMediaSource, startAudio, startVideo, cameraEnabled, setPartial, setAudioStreaming])

  const handlePTTStop = useCallback(() => {
    listeningRef.current = false
    stopVideo()
    stopAudio()
    send('turn.complete', { duration_ms: 0 })
  }, [stopAudio, stopVideo, send])

  const { manualStart, manualStop } = usePushToTalk({ onStart: handlePTTStart, onStop: handlePTTStop })

  const statusLabel =
    status === 'listening' ? 'Nearu is listening…' :
    status === 'thinking'  ? 'Nearu is thinking…' :
    status === 'speaking'  ? 'Nearu is responding…' :
    'Press Space to start'

  const emotionTags = fusedEmotion
    ? [{ label: fusedEmotion.dominant, style: 'default' as const }]
    : []

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* ── Session Card ── */}
      <div className="flex-1 bg-card rounded-[24px] border border-border shadow-card-md flex flex-col items-center justify-between py-9 px-8 relative overflow-hidden min-h-[440px]">
        {/* Clear button – top left */}
        <button
          onClick={() => { teardownMediaSource(); reset() }}
          className="absolute top-4 right-4 z-10 w-[34px] h-[34px] rounded-[9px] flex items-center justify-center bg-card/60 text-ink-4 border border-border/50 cursor-pointer transition-nearu hover:text-[#E05555] hover:border-[#E05555]/30 backdrop-blur-sm"
          title="Clear session"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 16 16">
            <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* Radial glow background */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: '72%',
            background: 'radial-gradient(ellipse 70% 80% at 50% 30%, var(--glow-blue) 0%, transparent 100%)',
          }}
        />

        {/* Avatar area */}
        <div className="flex flex-col items-center gap-3.5 z-[1] flex-1 justify-center">
          {/* Outer ring */}
          <div
            className="w-[220px] h-[220px] rounded-full flex items-center justify-center relative animate-float"
            style={{
              background: 'radial-gradient(circle, rgb(var(--color-card)) 60%, transparent)',
              boxShadow: '0 0 0 1px var(--glow-ring), 0 0 40px var(--glow-blue)',
            }}
          >
            {/* Inner ring */}
            <div
              className="w-[180px] h-[180px] rounded-full flex items-center justify-center bg-card"
              style={{
                boxShadow: '0 8px 32px rgba(110,193,255,0.18), inset 0 2px 8px rgba(110,193,255,0.06)',
              }}
            >
              {/* Character face */}
              <div className="w-[140px] h-[140px] rounded-full overflow-hidden flex items-center justify-center bg-bg">
                <img src="character.png" alt="Nearu" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* Glow below avatar */}
          <div
            className="w-40 h-10 pointer-events-none -mt-8"
            style={{ background: 'radial-gradient(ellipse, rgba(110,193,255,0.20), transparent 70%)' }}
          />

          {/* Status with wave bars */}
          <div className="flex items-center gap-[7px] text-[13px] font-medium text-ink-3 z-[1]">
            {(status === 'listening' || status === 'speaking') && <WaveBars />}
            <span>{statusLabel}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 z-[1] w-full justify-center flex-wrap">
          <PushToTalkButton onPointerDown={manualStart} onPointerUp={manualStop} />
        </div>
      </div>

      {/* ── Emotion Bar ── */}
      <div className="bg-card border border-border rounded-[16px] py-4 px-5 shadow-card flex items-center gap-5 shrink-0">
        <span className="text-xs font-medium text-ink whitespace-nowrap">Detected emotion</span>
        <div className="flex gap-2 flex-wrap">
          {emotionTags.length > 0 ? (
            emotionTags.map((t) => (
              <EmotionTag key={t.label} label={t.label} variant={t.style} />
            ))
          ) : (
            <span className="text-xs text-ink-2">Waiting for input…</span>
          )}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-ink">
          {fusedEmotion ? `${Math.round(fusedEmotion.confidence * 100)}% confidence` : ''}
        </span>
      </div>

      {/* ── Quick Tools ── */}
      <QuickTools />
    </div>
  )
}

/* ── Emotion tag pill ── */

const EMOTION_COLORS: Record<string, string> = {
  neutral: '#94a3b8', calm: '#38bdf8', happy: '#fbbf24', sad: '#60a5fa',
  angry: '#f87171', fearful: '#c084fc', disgust: '#34d399', surprised: '#f472b6',
  contempt: '#fb923c',
}

function EmotionTag({ label, variant }: { label: string; variant: 'default' | 'calm' | 'warm' }) {
  void variant
  const color = EMOTION_COLORS[label.toLowerCase()] ?? '#6EC1FF'

  return (
    <span
      className="text-xs font-semibold py-[5px] px-3 rounded-full border capitalize"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}18`,
      }}
    >
      {label}
    </span>
  )
}

/* ── Wave bars animation ── */

function WaveBars() {
  return (
    <div className="flex items-center gap-[3px] h-4">
      {[6, 12, 9, 14, 7].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-blue animate-wave"
          style={{
            height: `${h}px`,
            animationDelay: `${[0, 0.1, 0.2, 0.05, 0.15][i]}s`,
          }}
        />
      ))}
    </div>
  )
}
