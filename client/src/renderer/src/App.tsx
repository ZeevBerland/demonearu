import { useEffect } from 'react'
import { useSessionStore } from './store/sessionStore'
import { SessionPage } from './pages/SessionPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'
import { DebugPage } from './pages/DebugPage'
import { StatusBadge } from './components/StatusBadge'
import { EmotionPanel } from './components/EmotionPanel'
import { ChatLog } from './components/ChatLog'

export default function App() {
  const currentPage = useSessionStore((s) => s.currentPage)
  const setPage = useSessionStore((s) => s.setPage)
  const showDebug = useSessionStore((s) => s.showDebug)
  const toggleDebug = useSessionStore((s) => s.toggleDebug)
  const status = useSessionStore((s) => s.status)

  useEffect(() => {
    window.electronAPI?.getApiKeys().then((keys) => {
      if (!keys.openai || !keys.gemini) {
        window.electronAPI.getIsDev().then((dev) => {
          if (!dev) setPage('setup')
        })
      }
    }).catch(() => {
      // not in electron (dev browser) — skip setup check
    })
  }, [setPage])

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

  if (currentPage === 'setup') {
    return <SetupPage />
  }

  const pageConfig: Record<string, { title: string; sub: string }> = {
    session: { title: 'Live Session', sub: '— Session' },
    settings: { title: 'Settings', sub: '' },
  }
  const cfg = pageConfig[currentPage] ?? pageConfig.session

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ── Sidebar ── */}
      <aside className="w-sidebar min-w-sidebar bg-sidebar-bg border-r border-border flex flex-col z-10">
        <div className="px-4 pt-6 pb-4">
          <img src="nearu-logo.png" alt="Nearu" className="h-6 mb-6 ml-2" />

          <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-4 px-3 mb-1.5">
            Workspace
          </p>

          <NavItem
            active={currentPage === 'session'}
            onClick={() => setPage('session')}
            icon={<CirclePlayIcon />}
            label="Live Session"
          />
        </div>

        <div className="flex-1 px-4 overflow-y-auto">
          <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-4 px-3 mb-1.5 mt-2">
            Tools
          </p>
          <NavItem
            active={currentPage === 'settings'}
            onClick={() => setPage('settings')}
            icon={<SettingsIcon />}
            label="Settings"
          />
        </div>

        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] hover:bg-blue-faint2 transition-nearu cursor-default">
            <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-blue/30 to-blue/10 flex items-center justify-center text-xs font-semibold text-blue-dark shrink-0">
              N
            </div>
            <div>
              <div className="text-[13px] font-medium text-ink-2">Nearu User</div>
              <div className="text-[11px] text-ink-4">Demo</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-bg">
        {/* Top bar */}
        <header className="h-14 min-h-[56px] flex items-center justify-between px-7 bg-bg/85 backdrop-blur-xl border-b border-border z-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{cfg.title}</span>
            {cfg.sub && <span className="text-[13px] text-ink-4">{cfg.sub}</span>}
          </div>
          <div className="flex items-center gap-2.5">
            <StatusBadge status={status} />
            <button
              onClick={toggleDebug}
              className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center bg-card border border-border cursor-pointer transition-nearu text-ink-3 hover:text-ink shadow-card"
              title="Debug (F12)"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentPage === 'session' && <SessionPage />}
            {currentPage === 'settings' && <SettingsPage />}
          </div>

          {/* Right panel — only on session */}
          {currentPage === 'session' && (
            <aside className="w-right-panel min-w-right-panel bg-sidebar-bg border-l border-border py-5 px-4 flex flex-col gap-4 overflow-hidden">
              <div className="shrink-0">
                <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-4 mb-2.5">
                  Emotion Snapshot
                </p>
                <EmotionPanel />
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <div className="py-3 px-1 flex items-center gap-2.5 shrink-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue/30 to-blue/10 flex items-center justify-center overflow-hidden">
                    <img src="character.png" alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[13px] font-semibold text-ink">Chat with Nearu</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-1">
                  <ChatLog />
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>

      {showDebug && <DebugPage />}
    </div>
  )
}

/* ── Nav item ── */

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-3 py-[9px] rounded-[10px]
        text-[13.5px] font-medium cursor-pointer transition-nearu mb-0.5
        ${active
          ? 'bg-blue-faint text-blue-dark font-semibold'
          : 'text-ink-3 hover:bg-blue-faint2 hover:text-ink-2'}
      `}
    >
      <span className={`w-[18px] h-[18px] flex items-center justify-center shrink-0 transition-nearu ${active ? 'opacity-100 text-blue-mid' : 'opacity-50'}`}>
        {icon}
      </span>
      {label}
    </button>
  )
}

/* ── SVG Icons ── */

function CirclePlayIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 5.5 10 8l-3.5 2.5V5.5Z" fill="currentColor" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
