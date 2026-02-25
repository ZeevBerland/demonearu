import type { AppStatus } from '../types'

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: 'Ready', color: 'bg-gray-500', pulse: false },
  listening: { label: 'Listening…', color: 'bg-red-500', pulse: true },
  thinking: { label: 'Reading your tone…', color: 'bg-amber-500', pulse: true },
  speaking: { label: 'Speaking…', color: 'bg-accent', pulse: true }
}

export function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-surface-2">
      <span className={`h-2 w-2 rounded-full ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  )
}
