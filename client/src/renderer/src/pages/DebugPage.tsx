import { useSessionStore } from '../store/sessionStore'

export function DebugPage() {
  const ser = useSessionStore((s) => s.serEmotion)
  const ver = useSessionStore((s) => s.verEmotion)
  const fused = useSessionStore((s) => s.fusedEmotion)
  const metrics = useSessionStore((s) => s.debugMetrics)
  const history = useSessionStore((s) => s.emotionHistory)
  const sessionId = useSessionStore((s) => s.sessionId)

  return (
    <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold font-mono text-blue-dark">Debug Panel</h2>
          <span className="text-xs text-ink-4 font-mono">F12 to close</span>
        </div>

        <Section title="Session">
          <Row label="ID" value={sessionId ?? '—'} />
        </Section>

        <Section title="Latency (ms)">
          <Row label="SER" value={metrics.ser_ms.toFixed(0)} />
          <Row label="VER" value={metrics.ver_ms.toFixed(0)} />
          <Row label="LLM" value={metrics.llm_ms.toFixed(0)} />
          <Row label="TTS" value={metrics.tts_ms.toFixed(0)} />
          <Row label="TTS First Byte" value={metrics.tts_first_chunk_ms.toFixed(0)} />
        </Section>

        <Section title="Raw SER">
          <pre className="text-xs text-ink-3 font-mono">{JSON.stringify(ser, null, 2) ?? '—'}</pre>
        </Section>

        <Section title="Raw VER">
          <pre className="text-xs text-ink-3 font-mono">{JSON.stringify(ver, null, 2) ?? '—'}</pre>
        </Section>

        <Section title="Fused Emotion">
          <pre className="text-xs text-ink-3 font-mono">{JSON.stringify(fused, null, 2) ?? '—'}</pre>
        </Section>

        <Section title={`Emotion History (last ${Math.min(10, history.length)} of ${history.length})`}>
          <div className="space-y-0.5 font-mono text-[11px] text-ink-3">
            {history.slice(-10).map((h, i) => (
              <div key={i}>
                {new Date(h.ts).toISOString().slice(11, 23)} | {h.dominant.padEnd(10)} |{' '}
                {(h.confidence * 100).toFixed(0).padStart(3)}%
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-card p-4 space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-blue-dark/70">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between font-mono text-xs">
      <span className="text-ink-4">{label}</span>
      <span className="text-ink-2">{value}</span>
    </div>
  )
}
