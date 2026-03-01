import { useSessionStore } from '../store/sessionStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { QuickTool } from '../types'

const TOOLS: QuickTool[] = [
  { id: 'pitch_practice', title: 'Pitch Practice', subtitle: 'Refine clarity & presence', icon: '🎯' },
  { id: 'difficult_conversations', title: 'Difficult Conversations', subtitle: 'Navigate tension precisely', icon: '🤝' },
  { id: 'investor_qa', title: 'Investor Q&A', subtitle: 'Practice tough questions', icon: '💬' },
  { id: 'heart_to_heart', title: 'Heart-to-Heart', subtitle: 'Open emotional space', icon: '❤️' },
]

function ToolCard({ tool, active, onSelect }: { tool: QuickTool; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`
        text-left p-4 rounded-[14px] border transition-nearu cursor-pointer
        ${active
          ? 'bg-blue-faint border-blue/30 shadow-[0_0_16px_rgba(110,193,255,0.12)]'
          : 'bg-card border-border hover:border-ink-4/30 hover:shadow-card'}
      `}
    >
      <span className="text-xl leading-none block mb-2.5">{tool.icon}</span>
      <p className="text-[13px] font-semibold text-ink mb-0.5">{tool.title}</p>
      <p className="text-[11px] text-ink-3 leading-snug">{tool.subtitle}</p>
    </button>
  )
}

export function QuickTools() {
  const activeRole = useSessionStore((s) => s.activeRole)
  const setActiveRole = useSessionStore((s) => s.setActiveRole)
  const { send } = useWebSocket()

  const handleSelect = (toolId: string) => {
    const next = activeRole === toolId ? null : toolId
    setActiveRole(next)
    send('settings.update', { role: next })
  }

  return (
    <div className="shrink-0">
      <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-4 mb-3">
        Quick Tools
      </p>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {TOOLS.map((t) => (
          <ToolCard
            key={t.id}
            tool={t}
            active={activeRole === t.id}
            onSelect={() => handleSelect(t.id)}
          />
        ))}
      </div>
    </div>
  )
}
