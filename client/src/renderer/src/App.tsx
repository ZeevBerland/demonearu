import { useEffect } from 'react'
import { useSessionStore } from './store/sessionStore'
import { SessionPage } from './pages/SessionPage'
import { SettingsPage } from './pages/SettingsPage'
import { DebugPage } from './pages/DebugPage'

export default function App() {
  const currentPage = useSessionStore((s) => s.currentPage)
  const setPage = useSessionStore((s) => s.setPage)
  const showDebug = useSessionStore((s) => s.showDebug)
  const toggleDebug = useSessionStore((s) => s.toggleDebug)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault()
        toggleDebug()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDebug])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Navigation bar */}
      <nav className="flex items-center gap-1 border-b border-surface-3 bg-surface-1 px-4 py-2">
        <NavTab
          label="Session"
          active={currentPage === 'session'}
          onClick={() => setPage('session')}
        />
        <NavTab
          label="Settings"
          active={currentPage === 'settings'}
          onClick={() => setPage('settings')}
        />
        <div className="flex-1" />
        <span className="text-[10px] text-gray-600 font-mono">v0.1</span>
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        {currentPage === 'session' && <SessionPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>

      {/* Debug overlay */}
      {showDebug && <DebugPage />}
    </div>
  )
}

function NavTab({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 text-sm rounded-md transition-colors
        ${active ? 'bg-surface-2 text-gray-100' : 'text-gray-500 hover:text-gray-300 hover:bg-surface-2/50'}
      `}
    >
      {label}
    </button>
  )
}
