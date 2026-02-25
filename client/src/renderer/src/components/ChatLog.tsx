import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import type { ChatMessage } from '../types'

function ReasoningChip({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-gray-500 hover:text-gray-300 bg-surface-3 rounded px-1.5 py-0.5 transition-colors"
      >
        {open ? 'Hide reasoning' : 'Why this response?'}
      </button>
      {open && (
        <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">{reasoning}</p>
      )}
    </div>
  )
}

function MessageBubble({ m }: { m: ChatMessage }) {
  const showDebug = useSessionStore((s) => s.showDebug)
  const demoMode = useSessionStore((s) => s.settings.demoMode)

  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed
          ${
            m.role === 'user'
              ? 'bg-accent/20 text-gray-100 rounded-br-sm'
              : 'bg-surface-2 text-gray-200 rounded-bl-sm'
          }
        `}
      >
        <p>{m.text}</p>
        {m.tone && m.role === 'assistant' && (
          <span className="mt-1 inline-block text-[10px] text-gray-500 bg-surface-3 rounded px-1.5 py-0.5">
            tone: {m.tone}
          </span>
        )}
        {m.followUp && (
          <p className="mt-2 text-xs text-accent-light italic">{m.followUp}</p>
        )}
        {m.role === 'assistant' && m.reasoning && (showDebug || demoMode) && (
          <ReasoningChip reasoning={m.reasoning} />
        )}
      </div>
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
      <div className="flex-1 flex items-center justify-center text-sm text-gray-600">
        Start talking to begin the conversation
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
      {messages.map((m) => (
        <MessageBubble key={m.id} m={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
