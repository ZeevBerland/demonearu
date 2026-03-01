interface WaveformMeterProps {
  getFrequencyData: () => Uint8Array
  active: boolean
}

export function WaveformMeter({ active }: WaveformMeterProps) {
  if (!active) return null

  return (
    <div className="flex items-center gap-[3px] h-4">
      {[6, 12, 9, 14, 7].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-blue animate-wave"
          style={{
            height: `${h}px`,
            animationDelay: `${[0, 0.1, 0.2, 0.05, 0.15][i]}s`,
          }}
        />
      ))}
    </div>
  )
}
