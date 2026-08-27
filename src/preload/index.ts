import { contextBridge, ipcRenderer } from 'electron'
import type { AiSettings } from '../shared/settings'
import type { LayoutDoc } from '../shared/layout'

const api = {
  getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AiSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
  generateBlock: (prompt: string, kind: string, tools: string[]): Promise<{ content: string }> =>
    ipcRenderer.invoke('ai:generate-block', prompt, kind, tools),
  saveDoc: (doc: LayoutDoc): Promise<string | null> => ipcRenderer.invoke('doc:save', doc),
  openDoc: (): Promise<LayoutDoc | null> => ipcRenderer.invoke('doc:open'),
  exportPdf: (): Promise<string | null> => ipcRenderer.invoke('export:pdf')
}

export type BriefyApi = typeof api

contextBridge.exposeInMainWorld('briefy', api)
