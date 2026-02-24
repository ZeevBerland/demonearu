import { useSessionStore } from '../store/sessionStore'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  ReferenceLine
} from 'recharts'

const EMOTION_HEX: Record<string, string> = {
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

function emotionHex(label: string): string {
  return EMOTION_HEX[label] ?? '#94a3b8'
}

export function EmotionTimeline() {
  const history = useSessionStore((s) => s.emotionHistory)

  const points = history.slice(-40).map((h, i) => ({
    idx: i,
    confidence: h.confidence,
    fill: emotionHex(h.dominant)
  }))

  if (points.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center text-xs text-gray-600 bg-surface-1 rounded-lg">
        Timeline will appear during conversation
      </div>
    )
  }

  const dominantColor = points.at(-1)?.fill ?? '#94a3b8'

  return (
    <div className="h-16 bg-surface-1 rounded-lg overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="emotionGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={dominantColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={dominantColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 1]} hide />
          <ReferenceLine y={0.5} stroke="#333" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="confidence"
            stroke={dominantColor}
            fill="url(#emotionGrad)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
