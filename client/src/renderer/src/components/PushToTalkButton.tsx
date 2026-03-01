import { useSessionStore } from '../store/sessionStore'

interface PushToTalkButtonProps {
  onPointerDown: () => void
  onPointerUp: () => void
}

export function PushToTalkButton({ onPointerDown, onPointerUp }: PushToTalkButtonProps) {
  const status = useSessionStore((s) => s.status)
  const isListening = status === 'listening'

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className={`
        flex items-center gap-2 rounded-full font-medium text-sm
        transition-nearu select-none
        ${isListening
          ? 'bg-[#E05555] text-white px-7 py-3 shadow-[0_8px_24px_rgba(224,85,85,0.25)] hover:bg-[#CA4040] cursor-pointer'
          : 'bg-blue-dark text-white px-7 py-3 shadow-[0_8px_24px_rgba(26,142,224,0.25)] hover:bg-[#1680CA] hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(26,142,224,0.32)] cursor-pointer'
        }
      `}
    >
      {isListening ? (
        <>
          <svg width="15" height="15" fill="none" viewBox="0 0 16 16">
            <rect x="3" y="3" width="10" height="10" rx="2" fill="white" />
          </svg>
          Release to send
        </>
      ) : (
        <>
          <svg width="15" height="15" fill="none" viewBox="0 0 16 16">
            <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Talk to Nearu
        </>
      )}
    </button>
  )
}
