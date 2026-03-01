import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import type { ChatMessage } from '../types'

function EvidenceChip({ evidence }: { evidence: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-ink-4 hover:text-ink-3 bg-bg border border-border rounded px-1.5 py-0.5 transition-nearu"
      >
        {open ? 'Hide evidence' : 'Why this response?'}
      </button>
      {open && (
        <p className="mt-1 text-[10px] text-ink-4 leading-relaxed">{evidence}</p>
      )}
    </div>
  )
}

function MessageBubble({ m }: { m: ChatMessage }) {
  const showDebug = useSessionStore((s) => s.showDebug)
  const demoMode = useSessionStore((s) => s.settings.demoMode)

  const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className={`flex flex-col gap-1 max-w-[72%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
      <div
        className={`
          py-[11px] px-4 rounded-[18px] text-sm leading-relaxed
          ${m.role === 'user'
            ? 'bg-blue-dark text-white rounded-br-[5px]'
            : 'bg-card border border-border text-ink-2 rounded-bl-[5px] shadow-card'
          }
        `}
      >
        <p>{m.text}</p>
        {m.tone && m.role === 'assistant' && (
          <span className="mt-1.5 inline-block text-[10px] text-ink-4 bg-bg border border-border rounded px-1.5 py-0.5">
            tone: {m.tone}
          </span>
        )}
        {m.followUp && (
          <p className="mt-2 text-xs text-blue italic">{m.followUp}</p>
        )}
        {m.role === 'assistant' && m.evidenceSummary && (showDebug || demoMode) && (
          <EvidenceChip evidence={m.evidenceSummary} />
        )}
      </div>
      <span className="text-[10px] text-ink-4 px-1">{time}</span>
    </div>
  )
}

export function ChatLog() {
  const messages = useSessionStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-4">
        Start talking to begin the conversation
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {messages.map((m) => (
        <MessageBubble key={m.id} m={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
