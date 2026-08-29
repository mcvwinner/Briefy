import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { AiSettings, InfoSource } from '../shared/settings'
import type { LayoutDoc } from '../shared/layout'
import type { UserPreset } from '../shared/user-preset'
import type { Subscription } from '../shared/subscription'

const api = {
  getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AiSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
  generateSlot: (
    generationId: string,
    prompt: string,
    role: string,
    kind: string,
    tools: string[],
    docContext: unknown,
    slotIndex: number,
    sources: InfoSource[],
    estHeight: number,
    overrides?: Partial<AiSettings>
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> =>
    ipcRenderer.invoke(
      'ai:generate-slot',
      generationId,
      prompt,
      role,
      kind,
      tools,
      docContext,
      slotIndex,
      sources,
      estHeight,
      overrides
    ),
  cancelGeneration: (generationId: string): Promise<boolean> =>
    ipcRenderer.invoke('ai:cancel-generation', generationId),
  /** 编辑部三段式（ROADMAP Q2）：选题 / 审稿 */
  planIssue: (
    generationId: string,
    outline: { index: number; role: string; prompt: string }[],
    sources: InfoSource[],
    overrides?: Partial<AiSettings>
  ): Promise<{ assignments: { index: number; angle: string; quota?: number; avoid?: string }[] }> =>
    ipcRenderer.invoke('ai:plan-issue', generationId, outline, sources, overrides),
  reviewIssue: (
    generationId: string,
    articles: { index: number; role: string; content: string }[],
    overrides?: Partial<AiSettings>
  ): Promise<{ comments: { index: number; problem: string; instruction: string }[] }> =>
    ipcRenderer.invoke('ai:review-issue', generationId, articles, overrides),
  /** 订阅出刊归档：AI 提炼本期记忆摘要 */
  summarizeIssue: (
    generationId: string,
    articles: { role: string; content: string }[],
    overrides?: Partial<AiSettings>
  ): Promise<{ headline: string; points: string[] }> =>
    ipcRenderer.invoke('ai:summarize-issue', generationId, articles, overrides),
  /** 生成过程心跳（AI 流式输出增量，ROADMAP Q2 反馈）；返回去注册函数 */
  onHeartbeat: (cb: (generationId: string, delta: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, id: string, delta: string): void => cb(id, delta)
    ipcRenderer.on('ai:heartbeat', listener)
    return () => ipcRenderer.removeListener('ai:heartbeat', listener)
  },
  devExportState: (): Promise<unknown> => ipcRenderer.invoke('dev:export-state'),
  saveDoc: (doc: LayoutDoc): Promise<string | null> => ipcRenderer.invoke('doc:save', doc),
  openDoc: (): Promise<LayoutDoc | null> => ipcRenderer.invoke('doc:open'),
  exportPdf: (doc: LayoutDoc, savePath?: string): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', doc, savePath),
  /** dev 自动化：读取指定路径 .briefy（仅开发模式） */
  readDocPath: (path: string): Promise<string> => ipcRenderer.invoke('dev:read-doc-path', path),
  /** 打印窗口：取待导出文档 / A4 页渲染完成后通知主进程 */
  getExportDoc: (): Promise<LayoutDoc | null> => ipcRenderer.invoke('export:get-doc'),
  renderReady: (): Promise<boolean> => ipcRenderer.invoke('export:render-ready'),
  listUserPresets: (): Promise<UserPreset[]> => ipcRenderer.invoke('user-preset:list'),
  saveUserPreset: (preset: UserPreset): Promise<'saved' | 'name-conflict' | 'error'> =>
    ipcRenderer.invoke('user-preset:save', preset),
  existsUserPreset: (name: string): Promise<boolean> => ipcRenderer.invoke('user-preset:exists', name),
  deleteUserPreset: (name: string): Promise<boolean> => ipcRenderer.invoke('user-preset:delete', name),
  renameUserPreset: (oldName: string, newName: string): Promise<boolean> =>
    ipcRenderer.invoke('user-preset:rename', oldName, newName),
  exportUserPreset: (name: string): Promise<string | null> => ipcRenderer.invoke('user-preset:export', name),
  importUserPreset: (): Promise<UserPreset | null> => ipcRenderer.invoke('user-preset:import'),
  /** 选择本地文件作为参考源（返回 null = 用户取消） */
  pickSourceFile: (): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('sources:pick-file'),
  /** 订阅（v0.26）：CRUD / 归档路径 / 打开目录 */
  listSubscriptions: (): Promise<Subscription[]> => ipcRenderer.invoke('subscriptions:list'),
  saveSubscription: (sub: Subscription): Promise<boolean> => ipcRenderer.invoke('subscriptions:save', sub),
  deleteSubscription: (id: string): Promise<boolean> => ipcRenderer.invoke('subscriptions:delete', id),
  issuePath: (id: string, stamp?: string): Promise<string> => ipcRenderer.invoke('subscriptions:issue-path', id, stamp),
  openSubscriptionFolder: (id: string): Promise<string> => ipcRenderer.invoke('subscriptions:open-folder', id)
}

export type BriefyApi = typeof api

contextBridge.exposeInMainWorld('briefy', api)
