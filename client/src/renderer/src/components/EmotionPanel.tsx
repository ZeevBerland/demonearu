import { useSessionStore } from '../store/sessionStore'

const EMOTION_COLORS: Record<string, string> = {
  neutral: 'text-gray-400',
  calm: 'text-sky-400',
  happy: 'text-amber-400',
  sad: 'text-blue-400',
  angry: 'text-red-400',
  fearful: 'text-purple-400',
  disgust: 'text-emerald-400',
  surprised: 'text-pink-400',
  contempt: 'text-orange-400',
}

function emotionColor(label: string): string {
  return EMOTION_COLORS[label] ?? 'text-gray-300'
}

function Spinner() {
  return (
    <svg className="mx-auto h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const low = pct < 40
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${low ? 'bg-gray-500' : 'bg-current'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 w-8 text-right">
        {pct}%{low && ' low'}
      </span>
    </div>
  )
}

export function EmotionPanel() {
  const ser = useSessionStore((s) => s.serEmotion)
  const ver = useSessionStore((s) => s.verEmotion)
  const fused = useSessionStore((s) => s.fusedEmotion)
  const sensorFused = useSessionStore((s) => s.sensorFused)
  const status = useSessionStore((s) => s.status)

  const serProcessing = status === 'listening' || status === 'thinking'

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Emotion</h3>

      {/* Turn Interpretation — hero display */}
      <div className="rounded-lg bg-surface-1 p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Turn Interpretation</p>
        {fused ? (
          <>
            <p className={`text-2xl font-bold capitalize ${emotionColor(fused.dominant)}`}>
              {fused.dominant}
            </p>
            <ConfidenceBar value={fused.confidence} />
          </>
        ) : (
          <p className="text-gray-600 text-sm">Waiting for input…</p>
        )}
      </div>

      {/* Live Affect — sensor fusion */}
      {sensorFused && (
        <div className="rounded bg-surface-2 p-2 text-center">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">Live Affect</p>
          <p className={`text-sm font-semibold capitalize ${emotionColor(sensorFused.dominant)}`}>
            {sensorFused.dominant}{' '}
            <span className="text-gray-500 text-[10px]">
              {Math.round(sensorFused.confidence * 100)}%
            </span>
          </p>
        </div>
      )}

      {/* Voice / Face Signal rows */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-surface-2 p-2">
          <p className="text-gray-500 mb-1">Voice Signal</p>
          {serProcessing ? (
            <div className="py-0.5"><Spinner /></div>
          ) : ser ? (
            <p className={`font-medium capitalize ${emotionColor(ser.label)}`}>
              {ser.label} <span className="text-gray-500">{Math.round(ser.confidence * 100)}%</span>
            </p>
          ) : (
            <p className="text-gray-600">—</p>
          )}
        </div>
        <div className="rounded bg-surface-2 p-2">
          <p className="text-gray-500 mb-1">Face Signal</p>
          {ver ? (
            <>
              <p className={`font-medium capitalize ${emotionColor(ver.label)}`}>
                {ver.label} <span className="text-gray-500">{Math.round(ver.confidence * 100)}%</span>
              </p>
              {!ver.face_present && (
                <p className="text-gray-600 text-[10px] mt-0.5">Camera off</p>
              )}
            </>
          ) : (
            <p className="text-gray-600">—</p>
          )}
        </div>
      </div>
    </div>
  )
}
