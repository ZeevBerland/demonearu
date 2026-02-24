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

const TREND_ARROWS: Record<string, string> = {
  improving: '↑',
  worsening: '↓',
  stable: '→'
}

function Spinner() {
  return (
    <svg className="mx-auto h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

export function EmotionPanel() {
  const ser = useSessionStore((s) => s.serEmotion)
  const ver = useSessionStore((s) => s.verEmotion)
  const fused = useSessionStore((s) => s.fusedEmotion)
  const status = useSessionStore((s) => s.status)

  const serProcessing = status === 'listening' || status === 'thinking'

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Emotion</h3>

      {/* Fused — hero display */}
      <div className="rounded-lg bg-surface-1 p-4 text-center">
        {fused ? (
          <>
            <p className={`text-2xl font-bold capitalize ${emotionColor(fused.dominant)}`}>
              {fused.dominant}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {Math.round(fused.confidence * 100)}% confidence{' '}
              <span className="ml-1">{TREND_ARROWS[fused.trend] ?? '→'} {fused.trend}</span>
            </p>
          </>
        ) : (
          <p className="text-gray-600 text-sm">Waiting for input…</p>
        )}
      </div>

      {/* SER / VER rows */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-surface-2 p-2">
          <p className="text-gray-500 mb-1">SER (voice)</p>
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
          <p className="text-gray-500 mb-1">VER (face)</p>
          {ver ? (
            <>
              <p className={`font-medium capitalize ${emotionColor(ver.label)}`}>
                {ver.label} <span className="text-gray-500">{Math.round(ver.confidence * 100)}%</span>
              </p>
              {!ver.face_present && (
                <p className="text-gray-600 text-[10px] mt-0.5">No face detected</p>
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
