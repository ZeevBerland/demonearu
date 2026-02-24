import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'

interface UsePushToTalkOptions {
  onStart: () => void
  onStop: () => void
  key?: string
}

export function usePushToTalk({ onStart, onStop, key = ' ' }: UsePushToTalkOptions) {
  const status = useSessionStore((s) => s.status)
  const setStatus = useSessionStore((s) => s.setStatus)
  const holdingRef = useRef(false)

  const handleDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== key || e.repeat || holdingRef.current) return
      if (status === 'thinking') return
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return

      holdingRef.current = true
      setStatus('listening')
      onStart()
    },
    [key, onStart, setStatus, status]
  )

  const handleUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== key || !holdingRef.current) return
      holdingRef.current = false
      setStatus('thinking')
      onStop()
    },
    [key, onStop, setStatus]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
    }
  }, [handleDown, handleUp])

  const manualStart = useCallback(() => {
    if (holdingRef.current) return
    holdingRef.current = true
    setStatus('listening')
    onStart()
  }, [onStart, setStatus])

  const manualStop = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    setStatus('thinking')
    onStop()
  }, [onStop, setStatus])

  return { isHolding: holdingRef, manualStart, manualStop }
}
