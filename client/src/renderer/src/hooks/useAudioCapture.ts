import { useCallback, useRef } from 'react'

interface UseAudioCaptureOptions {
  onPcmChunk?: (b64: string) => void
}

export function useAudioCapture({ onPcmChunk }: UseAudioCaptureOptions = {}) {
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const activeRef = useRef(false)

  const teardown = useCallback(() => {
    activeRef.current = false
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    teardown()

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream

    const ctx = new AudioContext({ sampleRate: 16000 })
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser

    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    source.connect(processor)
    processor.connect(ctx.destination)

    activeRef.current = true
    processor.onaudioprocess = (e) => {
      if (!activeRef.current) return
      const samples = e.inputBuffer.getChannelData(0)
      const buf = new Float32Array(samples)
      const bytes = new Uint8Array(buf.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      onPcmChunk?.(btoa(binary))
    }
  }, [onPcmChunk, teardown])

  const stop = useCallback(() => {
    activeRef.current = false
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const getFrequencyData = useCallback((): Uint8Array => {
    const analyser = analyserRef.current
    if (!analyser) return new Uint8Array(0)
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    return data
  }, [])

  return { start, stop, getFrequencyData, analyserRef }
}
