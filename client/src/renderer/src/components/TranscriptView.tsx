import { useSessionStore } from '../store/sessionStore'

export function TranscriptView() {
  const partial = useSessionStore((s) => s.partialTranscript)
  const status = useSessionStore((s) => s.status)

  if (status === 'idle' && !partial) return null

  return (
    <div className="rounded-lg bg-surface-1 px-4 py-3 text-sm min-h-[3rem]">
      {status === 'listening' && !partial && (
        <span className="text-gray-500 italic animate-pulse">Listening…</span>
      )}
      {status === 'thinking' && !partial && (
        <span className="text-amber-400/80 italic animate-pulse">Processing…</span>
      )}
      {partial && <p className="text-gray-200">{partial}</p>}
    </div>
  )
}
