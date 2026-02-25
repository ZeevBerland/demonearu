import { useCallback } from 'react'

/**
 * Server-side STT: sends audio blob to orchestrator via WebSocket.
 * The orchestrator calls OpenAI Whisper and returns stt.final / stt.error.
 */
export function useSTT() {
  const transcribe = useCallback(
    async (audioBlob: Blob): Promise<string> => {
      const buf = await audioBlob.arrayBuffer()
      const b64 = btoa(
        new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
      )
      return b64
    },
    []
  )

  return { transcribe }
}
