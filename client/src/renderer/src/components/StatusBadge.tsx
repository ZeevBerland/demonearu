import type { AppStatus } from '../types'

const STATUS_CONFIG: Record<AppStatus, { label: string; dotClass: string }> = {
  idle: { label: 'Ready', dotClass: 'bg-ink-4' },
  listening: { label: 'Listening', dotClass: 'bg-[#34C759] animate-pulse-green' },
  thinking: { label: 'Thinking', dotClass: 'bg-blue animate-pulse-blue' },
  speaking: { label: 'Responding', dotClass: 'bg-[#34C759] animate-pulse-green' },
}

export function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <div className="flex items-center gap-1.5 bg-card border border-border rounded-full py-[5px] pl-2 pr-3 text-xs font-medium text-ink-3 shadow-card">
      <span className={`w-[7px] h-[7px] rounded-full ${cfg.dotClass}`} />
      <span>{cfg.label}</span>
    </div>
  )
}
