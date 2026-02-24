import { useSessionStore } from '../store/sessionStore'

interface PushToTalkButtonProps {
  onPointerDown: () => void
  onPointerUp: () => void
}

export function PushToTalkButton({ onPointerDown, onPointerUp }: PushToTalkButtonProps) {
  const status = useSessionStore((s) => s.status)
  const isListening = status === 'listening'

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className={`
          relative h-20 w-20 rounded-full border-2 transition-all duration-200
          flex items-center justify-center select-none cursor-pointer
          ${
            isListening
              ? 'border-red-500 bg-red-500/20 scale-110 shadow-lg shadow-red-500/25'
              : 'border-surface-3 bg-surface-2 hover:bg-surface-3 hover:border-accent/50'
          }
        `}
      >
        {/* Mic icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-8 w-8 ${isListening ? 'text-red-400' : 'text-gray-400'}`}
        >
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>

        {isListening && (
          <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-30" />
        )}
      </button>

      <span className="text-xs text-gray-500">
        {isListening ? 'Release to send' : 'Hold Space to talk'}
      </span>
    </div>
  )
}
