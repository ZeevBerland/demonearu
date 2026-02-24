import { useCallback, useRef } from 'react'

interface UseAudioCaptureOptions {
  onPcmChunk?: (b64: string) => void
  timeslice?: number
}

export function useAudioCapture({ onPcmChunk, timeslice = 1000 }: UseAudioCaptureOptions = {}) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream

    // Audio context at 16kHz for SER PCM capture
    const ctx = new AudioContext({ sampleRate: 16000 })
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)

    // Analyser for waveform visualisation
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser

    // ScriptProcessor to capture raw PCM float32 for SER
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    source.connect(processor)
    processor.connect(ctx.destination)

    processor.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0)
      const buf = new Float32Array(samples)
      const bytes = new Uint8Array(buf.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      onPcmChunk?.(btoa(binary))
    }

    // MediaRecorder for STT (sends full webm blob to OpenAI on stop)
    const recStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(recStream, { mimeType: 'audio/webm;codecs=opus' })
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.start(timeslice)
  }, [onPcmChunk, timeslice])

  const stop = useCallback(async (): Promise<Blob> => {
    // Stop PCM capture
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null

    // Stop MediaRecorder and return full blob for STT
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
        streamRef.current?.getTracks().forEach((t) => t.stop())
        return
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        resolve(blob)
      }
      recorder.stop()

      // Stop all mic streams
      streamRef.current?.getTracks().forEach((t) => t.stop())
      recorder.stream?.getTracks().forEach((t) => t.stop())
    })
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
