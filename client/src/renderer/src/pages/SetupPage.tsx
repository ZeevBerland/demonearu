import { useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { resetResolvedWsUrl } from '../hooks/useWebSocket'

export function SetupPage() {
  const setPage = useSessionStore((s) => s.setPage)
  const [openai, setOpenai] = useState('')
  const [gemini, setGemini] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!openai.trim() || !gemini.trim()) {
      setError('Both API keys are required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const result = await window.electronAPI.saveApiKeys({
        openai: openai.trim(),
        gemini: gemini.trim(),
      })

      if (result.success) {
        resetResolvedWsUrl()
        setPage('session')
      }
    } catch (e) {
      setError(`Failed to save: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-bg">
      <div className="w-full max-w-md bg-card border border-border rounded-[24px] p-8 shadow-card-md space-y-6">
        <div className="text-center space-y-2">
          <img src="nearu-logo.png" alt="Nearu" className="h-7 mx-auto" />
          <h1 className="text-lg font-semibold text-ink">Welcome to NearuVibe</h1>
          <p className="text-sm text-ink-4 leading-relaxed">
            Enter your API keys to get started. They are stored locally on your device and never sent to third parties.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-3 block">OpenAI API Key</label>
            <input
              type="password"
              value={openai}
              onChange={(e) => setOpenai(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-sm bg-bg border border-border px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-blue/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-3 block">Gemini API Key</label>
            <input
              type="password"
              value={gemini}
              onChange={(e) => setGemini(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-sm bg-bg border border-border px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-blue/30"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#E05555] text-center">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-sm bg-blue-dark text-white font-medium text-sm hover:bg-[#1680CA] transition-nearu disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Starting backend…' : 'Save & Launch'}
        </button>

        <p className="text-[10px] text-ink-4 text-center leading-relaxed">
          Keys are stored in your local app data folder. You can update them later from Settings.
        </p>
      </div>
    </div>
  )
}
