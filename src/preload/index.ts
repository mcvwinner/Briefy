import { contextBridge, ipcRenderer } from 'electron'
import type { AiSettings } from '../shared/settings'
import type { LayoutDoc } from '../shared/layout'
import type { UserPreset } from '../shared/user-preset'

const api = {
  getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AiSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
  generateSlot: (
    prompt: string,
    role: string,
    kind: string,
    tools: string[],
    docContext: unknown,
    slotIndex: number
  ): Promise<{ content: string }> =>
    ipcRenderer.invoke('ai:generate-slot', prompt, role, kind, tools, docContext, slotIndex),
  saveDoc: (doc: LayoutDoc): Promise<string | null> => ipcRenderer.invoke('doc:save', doc),
  openDoc: (): Promise<LayoutDoc | null> => ipcRenderer.invoke('doc:open'),
  exportPdf: (): Promise<string | null> => ipcRenderer.invoke('export:pdf'),
  listUserPresets: (): Promise<UserPreset[]> => ipcRenderer.invoke('user-preset:list'),
  saveUserPreset: (preset: UserPreset): Promise<'saved' | 'name-conflict' | 'error'> =>
    ipcRenderer.invoke('user-preset:save', preset),
  existsUserPreset: (name: string): Promise<boolean> => ipcRenderer.invoke('user-preset:exists', name),
  deleteUserPreset: (name: string): Promise<boolean> => ipcRenderer.invoke('user-preset:delete', name),
  renameUserPreset: (oldName: string, newName: string): Promise<boolean> =>
    ipcRenderer.invoke('user-preset:rename', oldName, newName),
  exportUserPreset: (name: string): Promise<string | null> => ipcRenderer.invoke('user-preset:export', name),
  importUserPreset: (): Promise<UserPreset | null> => ipcRenderer.invoke('user-preset:import')
}

export type BriefyApi = typeof api

contextBridge.exposeInMainWorld('briefy', api)
