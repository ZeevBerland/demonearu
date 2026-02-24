import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'

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
        <div
          key={m.id}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
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
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
