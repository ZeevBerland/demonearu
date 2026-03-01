import { useCallback, useRef } from 'react'

interface UseAudioCaptureOptions {
  onPcmChunk?: (b64: string) => void
  timeslice?: number
}

export function useAudioCapture({ onPcmChunk, timeslice = 1000 }: UseAudioCaptureOptions = {}) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
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
    recStreamRef.current?.getTracks().forEach((t) => t.stop())
    recStreamRef.current = null
    try { recorderRef.current?.stop() } catch { /* already stopped */ }
    recorderRef.current = null
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

    const recStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recStreamRef.current = recStream
    const recorder = new MediaRecorder(recStream, { mimeType: 'audio/webm;codecs=opus' })
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.start(timeslice)
  }, [onPcmChunk, timeslice, teardown])

  const stop = useCallback(async (): Promise<Blob> => {
    activeRef.current = false
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null

    return new Promise((resolve) => {
      const recorder = recorderRef.current
      recorderRef.current = null

      const cleanup = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recStreamRef.current?.getTracks().forEach((t) => t.stop())
        recStreamRef.current = null
      }

      if (!recorder || recorder.state === 'inactive') {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        cleanup()
        resolve(blob)
        return
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        cleanup()
        resolve(blob)
      }
      recorder.stop()
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
