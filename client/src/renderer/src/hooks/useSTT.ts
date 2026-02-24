import { useCallback, useRef } from 'react'
import OpenAI from 'openai'
import { useSessionStore } from '../store/sessionStore'

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export function useSTT() {
  const settings = useSessionStore((s) => s.settings)
  const busyRef = useRef(false)

  const transcribe = useCallback(
    async (audioBlob: Blob): Promise<string> => {
      if (busyRef.current) return ''
      busyRef.current = true

      try {
        const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })
        const result = await client.audio.transcriptions.create({
          file,
          model: settings.sttModel,
          language: 'en',
          prompt: 'The user is speaking in English in a conversational tone.',
        })
        return result.text
      } catch (err) {
        console.error('[STT] Transcription failed:', err)
        return ''
      } finally {
        busyRef.current = false
      }
    },
    [settings.sttModel]
  )

  return { transcribe }
}
