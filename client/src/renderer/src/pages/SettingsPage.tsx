import { useSessionStore } from '../store/sessionStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { EmotionLabel, SERMode } from '../types'

const STT_MODELS = ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe']
const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

const SER_MODES: { value: SERMode; label: string; description: string }[] = [
  { value: 'local', label: 'Local only', description: 'Real-time wav2vec2 + OpenAI STT (fast, free SER)' },
  { value: 'gemini', label: 'Gemini only', description: 'One Gemini call: STT + SER + response (no OpenAI STT needed)' },
  { value: 'hybrid', label: 'Hybrid', description: 'Local real-time SER + OpenAI STT + Gemini SER at turn-end' },
]
const DEMO_EMOTIONS: EmotionLabel[] = [
  'neutral', 'calm', 'happy', 'sad', 'angry', 'fearful', 'disgust', 'surprised', 'contempt'
]

export function SettingsPage() {
  const settings = useSessionStore((s) => s.settings)
  const update = useSessionStore((s) => s.updateSettings)
  const memoryEnabled = useSessionStore((s) => s.memoryEnabled)
  const setMemoryEnabled = useSessionStore((s) => s.setMemoryEnabled)
  const { send } = useWebSocket()

  return (
    <div className="max-w-xl mx-auto p-6 space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* STT model */}
      <fieldset className="space-y-2">
        <label className="text-sm font-medium text-gray-300">STT Model</label>
        <select
          value={settings.sttModel}
          onChange={(e) => update({ sttModel: e.target.value })}
          className="w-full rounded-lg bg-surface-2 border border-surface-3 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          {STT_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </fieldset>

      {/* TTS voice */}
      <fieldset className="space-y-2">
        <label className="text-sm font-medium text-gray-300">TTS Voice</label>
        <select
          value={settings.ttsVoice}
          onChange={(e) => update({ ttsVoice: e.target.value })}
          className="w-full rounded-lg bg-surface-2 border border-surface-3 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          {TTS_VOICES.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </fieldset>

      {/* Emotion sensitivity */}
      <fieldset className="space-y-2">
        <label className="text-sm font-medium text-gray-300">
          Emotion Sensitivity — {Math.round(settings.emotionSensitivity * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.emotionSensitivity}
          onChange={(e) => update({ emotionSensitivity: parseFloat(e.target.value) })}
          className="w-full accent-accent"
        />
      </fieldset>

      {/* SER mode */}
      <fieldset className="space-y-3">
        <label className="text-sm font-medium text-gray-300">Speech Emotion Recognition</label>
        <div className="space-y-2">
          {SER_MODES.map((m) => (
            <label
              key={m.value}
              className={`
                flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors
                ${settings.serMode === m.value
                  ? 'border-accent bg-accent/10'
                  : 'border-surface-3 bg-surface-2 hover:border-surface-3/80'}
              `}
            >
              <input
                type="radio"
                name="serMode"
                value={m.value}
                checked={settings.serMode === m.value}
                onChange={() => update({ serMode: m.value })}
                className="mt-0.5 accent-accent"
              />
              <div>
                <p className="text-sm font-medium text-gray-200">{m.label}</p>
                <p className="text-xs text-gray-500">{m.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Camera toggle */}
      <fieldset className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">Camera (VER)</label>
        <button
          onClick={() => update({ cameraEnabled: !settings.cameraEnabled })}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${settings.cameraEnabled ? 'bg-accent' : 'bg-surface-3'}
          `}
        >
          <span
            className={`
              inline-block h-4 w-4 rounded-full bg-white transition-transform
              ${settings.cameraEnabled ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </fieldset>

      {/* Fusion tuning */}
      <fieldset className="space-y-4 border border-surface-3 rounded-lg p-4">
        <label className="text-sm font-medium text-gray-300">Fusion Tuning</label>

        {/* Presets */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Quick presets</p>
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
                onClick={() =>
                  update({
                    fusion: {
                      ...settings.fusion,
                      emaAlpha: p.alpha,
                      voiceWeight: p.voice,
                    },
                  })
                }
                className="px-2.5 py-1 rounded text-xs bg-surface-2 text-gray-400 hover:text-white hover:bg-surface-3 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Reactivity (EMA alpha) */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Reactivity (EMA)</span>
            <span>{settings.fusion.emaAlpha.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0.05} max={1} step={0.05}
            value={settings.fusion.emaAlpha}
            onChange={(e) => update({ fusion: { ...settings.fusion, emaAlpha: parseFloat(e.target.value) } })}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>Smooth</span><span>Reactive</span>
          </div>
        </div>

        {/* Voice / Face balance */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Voice / Face Balance</span>
            <span>{Math.round(settings.fusion.voiceWeight * 100)}% / {Math.round((1 - settings.fusion.voiceWeight) * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={settings.fusion.voiceWeight}
            onChange={(e) => update({ fusion: { ...settings.fusion, voiceWeight: parseFloat(e.target.value) } })}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>All Face</span><span>All Voice</span>
          </div>
        </div>

        {/* Trend window */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Trend Window</span>
            <span>{settings.fusion.trendWindowSec.toFixed(1)}s</span>
          </div>
          <input
            type="range" min={1} max={10} step={0.5}
            value={settings.fusion.trendWindowSec}
            onChange={(e) => update({ fusion: { ...settings.fusion, trendWindowSec: parseFloat(e.target.value) } })}
            className="w-full accent-accent"
          />
        </div>

        {/* Buffer size */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Buffer Size</span>
            <span>{settings.fusion.bufferMax}</span>
          </div>
          <input
            type="range" min={10} max={100} step={5}
            value={settings.fusion.bufferMax}
            onChange={(e) => update({ fusion: { ...settings.fusion, bufferMax: parseInt(e.target.value) } })}
            className="w-full accent-accent"
          />
        </div>
      </fieldset>

      {/* Demo mode */}
      <fieldset className="space-y-3 border border-surface-3 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-300">Demo Mode (manual override)</label>
          <button
            onClick={() => update({ demoMode: !settings.demoMode })}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${settings.demoMode ? 'bg-accent' : 'bg-surface-3'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 rounded-full bg-white transition-transform
                ${settings.demoMode ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {settings.demoMode && (
          <>
            <div className="flex gap-2 flex-wrap">
              {DEMO_EMOTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => update({ demoEmotion: e })}
                  className={`
                    px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors
                    ${
                      settings.demoEmotion === e
                        ? 'bg-accent text-white'
                        : 'bg-surface-2 text-gray-400 hover:text-gray-200'
                    }
                  `}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="space-y-2 pt-2 border-t border-surface-3">
              <p className="text-xs text-gray-500">Simulation Toggles</p>
              {[
                { key: 'simulateNoFace' as const, label: 'Simulate no face' },
                { key: 'simulateSttFailure' as const, label: 'Simulate STT failure' },
                { key: 'simulateCameraOff' as const, label: 'Simulate camera off' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={() => update({ [key]: !settings[key] })}
                    className="accent-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}
      </fieldset>

      {/* Privacy & Memory */}
      <fieldset className="space-y-4 border border-surface-3 rounded-lg p-4">
        <label className="text-sm font-medium text-gray-300">Privacy & Memory</label>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Save conversation history</span>
          <button
            onClick={() => setMemoryEnabled(!memoryEnabled)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${memoryEnabled ? 'bg-accent' : 'bg-surface-3'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 rounded-full bg-white transition-transform
                ${memoryEnabled ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => send('memory.clear', { scope: 'session' })}
            className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-400 hover:text-white hover:bg-surface-3 transition-colors"
          >
            Clear current session
          </button>
          <button
            onClick={() => {
              if (confirm('Clear all stored memory? This cannot be undone.')) {
                send('memory.clear', { scope: 'all' })
              }
            }}
            className="px-3 py-1.5 rounded text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
          >
            Clear all memory
          </button>
        </div>

        <p className="text-[11px] text-gray-600 leading-relaxed">
          Emotion signals are approximate and optional. Camera processing is local — webcam
          frames are never stored. Only transcripts and emotion summaries are saved to the
          local database. Nearu adapts tone, not diagnosis.
        </p>
      </fieldset>
    </div>
  )
}
