import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getWsPort: () => ipcRenderer.invoke('get-ws-port'),
  getIsDev: () => ipcRenderer.invoke('get-is-dev'),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  saveApiKeys: (keys: { openai: string; gemini: string }) =>
    ipcRenderer.invoke('save-api-keys', keys),
})
