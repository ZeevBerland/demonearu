import { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { resetResolvedWsUrl } from '../hooks/useWebSocket'
import type { EmotionLabel } from '../types'

const TTS_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']

const DEMO_EMOTIONS: EmotionLabel[] = [
  'neutral', 'calm', 'happy', 'sad', 'angry', 'fearful', 'disgust', 'surprised', 'contempt'
]

const selectClass = 'w-full rounded-sm bg-bg border border-border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30'
const sliderClass = 'w-full accent-blue-dark'

export function SettingsPage() {
  const settings = useSessionStore((s) => s.settings)
  const update = useSessionStore((s) => s.updateSettings)
  const memoryEnabled = useSessionStore((s) => s.memoryEnabled)
  const setMemoryEnabled = useSessionStore((s) => s.setMemoryEnabled)
  const { send } = useWebSocket()

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h2 className="text-xl font-semibold text-ink">Settings</h2>

      {/* TTS voice */}
      <Card>
        <Label>TTS Voice</Label>
        <select
          value={settings.ttsVoice}
          onChange={(e) => {
            const voice = e.target.value
            update({ ttsVoice: voice })
            send('settings.update', { tts_voice: voice })
          }}
          className={selectClass}
        >
          {TTS_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </Card>

      {/* Emotion sensitivity */}
      <Card>
        <div className="flex justify-between">
          <Label>Emotion Sensitivity</Label>
          <span className="text-xs text-ink-4">{Math.round(settings.emotionSensitivity * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.05}
          value={settings.emotionSensitivity}
          onChange={(e) => update({ emotionSensitivity: parseFloat(e.target.value) })}
          className={sliderClass}
        />
      </Card>

      {/* Camera toggle */}
      <Card>
        <div className="flex items-center justify-between">
          <Label>Camera (VER)</Label>
          <Toggle checked={settings.cameraEnabled} onChange={() => update({ cameraEnabled: !settings.cameraEnabled })} />
        </div>
      </Card>

      {/* Fusion tuning */}
      <Card>
        <Label>Fusion Tuning</Label>

        <div className="space-y-1 mt-2">
          <p className="text-xs text-ink-4">Quick presets</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { name: 'Balanced', alpha: 0.50, voice: 0.40 },
              { name: 'Voice-first', alpha: 0.50, voice: 0.70 },
              { name: 'Face-first', alpha: 0.50, voice: 0.20 },
              { name: 'Smooth', alpha: 0.25, voice: 0.40 },
              { name: 'Reactive', alpha: 0.85, voice: 0.40 },
            ].map((p) => (
              <button
                key={p.name}
                onClick={() => update({ fusion: { ...settings.fusion, emaAlpha: p.alpha, voiceWeight: p.voice } })}
                className="px-2.5 py-1 rounded-full text-xs bg-bg border border-border text-ink-3 hover:text-ink hover:border-blue/30 transition-nearu"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <Slider
          label="Reactivity (EMA)" value={settings.fusion.emaAlpha}
          min={0.05} max={1} step={0.05}
          onChange={(v) => update({ fusion: { ...settings.fusion, emaAlpha: v } })}
          leftHint="Smooth" rightHint="Reactive"
        />

        <Slider
          label="Voice / Face Balance"
          value={settings.fusion.voiceWeight}
          min={0} max={1} step={0.05}
          displayValue={`${Math.round(settings.fusion.voiceWeight * 100)}% / ${Math.round((1 - settings.fusion.voiceWeight) * 100)}%`}
          onChange={(v) => update({ fusion: { ...settings.fusion, voiceWeight: v } })}
          leftHint="All Face" rightHint="All Voice"
        />

        <Slider
          label="Trend Window" value={settings.fusion.trendWindowSec}
          min={1} max={10} step={0.5} displayValue={`${settings.fusion.trendWindowSec.toFixed(1)}s`}
          onChange={(v) => update({ fusion: { ...settings.fusion, trendWindowSec: v } })}
        />

        <Slider
          label="Buffer Size" value={settings.fusion.bufferMax}
          min={10} max={100} step={5}
          onChange={(v) => update({ fusion: { ...settings.fusion, bufferMax: v } })}
        />
      </Card>

      {/* Demo mode */}
      <Card>
        <div className="flex items-center justify-between">
          <Label>Demo Mode (manual override)</Label>
          <Toggle checked={settings.demoMode} onChange={() => update({ demoMode: !settings.demoMode })} />
        </div>

        {settings.demoMode && (
          <>
            <div className="flex gap-2 flex-wrap mt-3">
              {DEMO_EMOTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => update({ demoEmotion: e })}
                  className={`
                    px-3 py-1 rounded-full text-xs font-medium capitalize transition-nearu
                    ${settings.demoEmotion === e
                      ? 'bg-blue-dark text-white'
                      : 'bg-bg border border-border text-ink-3 hover:text-ink'}
                  `}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="space-y-2 pt-3 mt-3 border-t border-border">
              <p className="text-xs text-ink-4">Simulation Toggles</p>
              {[
                { key: 'simulateNoFace' as const, label: 'Simulate no face' },
                { key: 'simulateSttFailure' as const, label: 'Simulate STT failure' },
                { key: 'simulateCameraOff' as const, label: 'Simulate camera off' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs text-ink-3 cursor-pointer">
                  <input
                    type="checkbox" checked={settings[key]}
                    onChange={() => update({ [key]: !settings[key] })}
                    className="accent-blue-dark"
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Privacy & Memory */}
      <Card>
        <Label>Privacy & Memory</Label>

        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-ink-2">Save conversation history</span>
          <Toggle checked={memoryEnabled} onChange={() => setMemoryEnabled(!memoryEnabled)} />
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => send('memory.clear', { scope: 'session' })}
            className="px-3 py-1.5 rounded-sm text-xs bg-bg border border-border text-ink-3 hover:text-ink hover:border-blue/30 transition-nearu"
          >
            Clear current session
          </button>
          <button
            onClick={() => {
              if (confirm('Clear all stored memory? This cannot be undone.')) {
                send('memory.clear', { scope: 'all' })
              }
            }}
            className="px-3 py-1.5 rounded-sm text-xs bg-[#3D1515]/50 border border-[#6B2222] text-[#F87171] hover:bg-[#3D1515] transition-nearu"
          >
            Clear all memory
          </button>
        </div>

        <p className="text-[11px] text-ink-4 leading-relaxed mt-3">
          Emotion signals are approximate and optional. Camera processing is local — webcam
          frames are never stored. Only transcripts and emotion summaries are saved to the
          local database. Nearu adapts tone, not diagnosis.
        </p>
      </Card>

      {/* API Keys */}
      <ApiKeysCard />
    </div>
  )
}

/* ── Shared sub-components ── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-card p-5 space-y-3 shadow-card">
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-semibold text-ink block">{children}</label>
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? 'bg-blue-dark' : 'bg-border'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  )
}

function ApiKeysCard() {
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [isCustomOpenai, setIsCustomOpenai] = useState(false)
  const [isCustomGemini, setIsCustomGemini] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    window.electronAPI?.getApiKeys().then((keys: any) => {
      setIsCustomOpenai(keys.isCustomOpenai ?? false)
      setIsCustomGemini(keys.isCustomGemini ?? false)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setStatus('idle')
    try {
      const result = await window.electronAPI.saveApiKeys({
        openai: openaiKey.trim(),
        gemini: geminiKey.trim(),
      })
      if (result.success) {
        resetResolvedWsUrl()
        setStatus('saved')
        setOpenaiKey('')
        setGeminiKey('')
        if (openaiKey.trim()) setIsCustomOpenai(true)
        else setIsCustomOpenai(false)
        if (geminiKey.trim()) setIsCustomGemini(true)
        else setIsCustomGemini(false)
      }
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-sm bg-bg border border-border px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-blue/30'

  return (
    <Card>
      <Label>API Keys</Label>
      <p className="text-[11px] text-ink-4 leading-relaxed">
        Built-in keys are included for demo use. Enter your own keys to override them.
        Leave a field blank to revert to the built-in default.
      </p>

      <div className="space-y-3 mt-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-ink-3">OpenAI API Key</label>
            <span className={`text-[10px] ${isCustomOpenai ? 'text-blue-mid' : 'text-ink-4'}`}>
              {isCustomOpenai ? 'Custom' : 'Built-in'}
            </span>
          </div>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={isCustomOpenai ? 'sk-...  (custom key set)' : 'sk-...  (using built-in)'}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-ink-3">Gemini API Key</label>
            <span className={`text-[10px] ${isCustomGemini ? 'text-blue-mid' : 'text-ink-4'}`}>
              {isCustomGemini ? 'Custom' : 'Built-in'}
            </span>
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={isCustomGemini ? 'AIza...  (custom key set)' : 'AIza...  (using built-in)'}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-sm text-xs font-medium bg-blue-dark text-white hover:bg-[#1680CA] transition-nearu disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Restarting backend…' : 'Save & Restart Backend'}
        </button>
        {status === 'saved' && <span className="text-xs text-[#34D399]">Saved. Backend restarted.</span>}
        {status === 'error' && <span className="text-xs text-[#F87171]">Failed to save.</span>}
      </div>
    </Card>
  )
}

function Slider({
  label, value, min, max, step, displayValue, leftHint, rightHint, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  displayValue?: string; leftHint?: string; rightHint?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1 mt-3">
      <div className="flex justify-between text-xs text-ink-3">
        <span>{label}</span>
        <span className="text-ink-4">{displayValue ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={sliderClass}
      />
      {(leftHint || rightHint) && (
        <div className="flex justify-between text-[10px] text-ink-4">
          <span>{leftHint}</span><span>{rightHint}</span>
        </div>
      )}
    </div>
  )
}
