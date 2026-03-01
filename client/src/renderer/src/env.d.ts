/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  electronAPI: {
    platform: string
    getWsPort: () => Promise<number>
    getIsDev: () => Promise<boolean>
    getApiKeys: () => Promise<{ openai: string; gemini: string }>
    saveApiKeys: (keys: { openai: string; gemini: string }) => Promise<{ success: boolean; port: number }>
  }
}
