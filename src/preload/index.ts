import { contextBridge, ipcRenderer } from 'electron'
import type { AiSettings } from '../shared/settings'

const api = {
  getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AiSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
  generateBlock: (prompt: string, kind: string): Promise<{ content: string }> =>
    ipcRenderer.invoke('ai:generate-block', prompt, kind)
}

export type BriefyApi = typeof api

contextBridge.exposeInMainWorld('briefy', api)
