import { useSessionStore } from '../store/sessionStore'

export function TranscriptView() {
  const partial = useSessionStore((s) => s.partialTranscript)
  const status = useSessionStore((s) => s.status)

  if (status === 'idle' && !partial) return null

  return (
    <div className="rounded-[14px] bg-bg border border-border px-4 py-3 text-sm min-h-[3rem]">
      {status === 'listening' && !partial && (
        <span className="text-ink-4 italic animate-pulse">Listening…</span>
      )}
      {status === 'thinking' && !partial && (
        <span className="text-blue-dark italic animate-pulse">Processing…</span>
      )}
      {partial && <p className="text-ink-2">{partial}</p>}
    </div>
  )
}
