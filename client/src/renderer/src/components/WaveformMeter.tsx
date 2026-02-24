import { useEffect, useRef } from 'react'

interface WaveformMeterProps {
  getFrequencyData: () => Uint8Array
  active: boolean
}

export function WaveformMeter({ getFrequencyData, active }: WaveformMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const data = getFrequencyData()
      const { width, height } = canvas

      ctx.clearRect(0, 0, width, height)

      if (data.length === 0) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const barCount = 32
      const step = Math.floor(data.length / barCount)
      const barWidth = width / barCount - 2

      for (let i = 0; i < barCount; i++) {
        const value = data[i * step] / 255
        const barHeight = Math.max(2, value * height)

        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, 'rgba(99,102,241,0.6)')
        gradient.addColorStop(1, 'rgba(99,102,241,0.15)')
        ctx.fillStyle = gradient

        const x = i * (barWidth + 2)
        ctx.fillRect(x, height - barHeight, barWidth, barHeight)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, getFrequencyData])

  return (
    <canvas
      ref={canvasRef}
      width={260}
      height={48}
      className="w-full h-12 rounded bg-surface-1"
    />
  )
}
