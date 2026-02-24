import { useCallback, useRef } from 'react'

interface UseVideoCaptureOptions {
  fps?: number
  onFrame?: (jpegBase64: string) => void
}

export function useVideoCapture({ fps = 3, onFrame }: UseVideoCaptureOptions = {}) {
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    const base64 = dataUrl.split(',')[1]
    onFrameRef.current?.(base64)
  }, [])

  const stop = useCallback(() => {
    clearInterval(intervalRef.current)
    intervalRef.current = undefined
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    stop()

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    })
    streamRef.current = stream

    if (!videoRef.current) {
      videoRef.current = document.createElement('video')
      videoRef.current.setAttribute('playsinline', '')
      videoRef.current.muted = true
    }
    videoRef.current.srcObject = stream
    await videoRef.current.play()

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
      canvasRef.current.width = 320
      canvasRef.current.height = 240
    }

    intervalRef.current = setInterval(captureFrame, 1000 / fps)
  }, [fps, stop, captureFrame])

  return { start, stop }
}
