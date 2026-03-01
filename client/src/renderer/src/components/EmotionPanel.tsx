import { useSessionStore } from '../store/sessionStore'

const EMOTION_COLORS: Record<string, string> = {
  neutral: '#94a3b8',
  calm: '#38bdf8',
  happy: '#fbbf24',
  sad: '#60a5fa',
  angry: '#f87171',
  fearful: '#c084fc',
  disgust: '#34d399',
  surprised: '#f472b6',
  contempt: '#fb923c',
}

function emotionColor(label: string): string {
  return EMOTION_COLORS[label.toLowerCase()] ?? '#6EC1FF'
}

export function EmotionPanel() {
  const ser = useSessionStore((s) => s.serEmotion)
  const ver = useSessionStore((s) => s.verEmotion)
  const fused = useSessionStore((s) => s.fusedEmotion)
  const sensorFused = useSessionStore((s) => s.sensorFused)
  const status = useSessionStore((s) => s.status)

  const serProcessing = status === 'listening' || status === 'thinking'

  const dominant = fused?.dominant ?? sensorFused?.dominant ?? null
  const dominantConf = fused?.confidence ?? sensorFused?.confidence ?? 0

  return (
    <div className="bg-card border border-border rounded-[14px] p-4 space-y-4">
      <div className="text-[10px] font-medium tracking-[0.06em] uppercase text-ink-4">This session</div>

      {/* Combined / Dominant */}
      {dominant ? (
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: emotionColor(dominant), boxShadow: `0 0 8px ${emotionColor(dominant)}60` }}
          />
          <span className="text-base font-semibold text-ink capitalize">{dominant}</span>
          <span className="text-xs text-ink ml-auto">{Math.round(dominantConf * 100)}%</span>
        </div>
      ) : (
        <div className="text-xs text-ink-4 text-center py-2">Waiting for input…</div>
      )}

      {/* Voice / Face signals */}
      <div className="grid grid-cols-2 gap-3">
        {/* Voice signal */}
        <SignalCard
          label="Voice"
          processing={serProcessing}
          emotion={ser?.label ?? null}
          confidence={ser?.confidence ?? 0}
        />

        {/* Face signal */}
        <SignalCard
          label="Face"
          processing={false}
          emotion={ver?.label ?? null}
          confidence={ver?.confidence ?? 0}
          inactive={ver ? !ver.face_present : false}
        />
      </div>
    </div>
  )
}

function SignalCard({
  label,
  processing,
  emotion,
  confidence,
  inactive,
}: {
  label: string
  processing: boolean
  emotion: string | null
  confidence: number
  inactive?: boolean
}) {
  const color = emotion ? emotionColor(emotion) : '#565B6E'
  const pct = Math.round(confidence * 100)

  return (
    <div className="bg-bg border border-border rounded-[10px] p-3 space-y-2">
      <div className="text-[10px] font-medium tracking-[0.04em] uppercase text-ink-2">{label}</div>

      {processing ? (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue animate-pulse" />
          <span className="text-xs text-ink-2 animate-pulse">Analyzing…</span>
        </div>
      ) : emotion ? (
        <>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}50` }}
            />
            <span className="text-sm font-semibold text-ink capitalize">{emotion}</span>
            {inactive && <span className="text-[10px] text-ink-3">(off)</span>}
          </div>
          <div className="w-full h-[4px] bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <div className="text-[11px] text-ink text-right">{pct}%</div>
        </>
      ) : (
        <span className="text-xs text-ink-3">—</span>
      )}
    </div>
  )
}
