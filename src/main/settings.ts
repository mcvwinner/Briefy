import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AiSettings, type InfoSource, type ThemeMode } from '../shared/settings'
import { generateSlotContent, planIssue, reviewIssue, resolveImageQueries, summarizeIssue, compressDigest } from './ai'
import type { DocContext } from './ai'
import { fetchPageText, readLocalSourceText } from './tools'
import type { ToolId } from '../shared/layout'
import { dialog } from 'electron'

const SETTINGS_FILE = 'settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

export async function readSettings(): Promise<AiSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    // 只取已知字段，防止文件被手改出脏数据
    if (parsed && typeof parsed === 'object') {
      const s = parsed as Record<string, unknown>
      const { apiKey = '', baseUrl = '', model = '', theme = 'light', tavilyKey = '', sources = [] } = s
      // P6a/P6b 字段（layout/stylePrompt/roleDuties）：形状校验后透传，防脏数据但不丢配置
      const layout =
        s.layout && typeof s.layout === 'object' ? (s.layout as AiSettings['layout']) : undefined
      const stylePrompt = typeof s.stylePrompt === 'string' ? s.stylePrompt : undefined
      const roleDuties =
        s.roleDuties && typeof s.roleDuties === 'object' && !Array.isArray(s.roleDuties)
          ? (s.roleDuties as AiSettings['roleDuties'])
          : undefined
      const editorial =
        s.editorial && typeof s.editorial === 'object' ? (s.editorial as AiSettings['editorial']) : undefined
      const customRoles = Array.isArray(s.customRoles)
        ? (s.customRoles.filter(
            (r) => r && typeof r === 'object' && typeof (r as { name?: unknown }).name === 'string'
          ) as AiSettings['customRoles'])
        : undefined
      // 实验开关（v0.34.1 自订阅对话框迁入）：显式布尔透传（false 也保留，能覆盖旧订阅遗留字段）
      const experimentalLayoutFit = typeof s.experimentalLayoutFit === 'boolean' ? s.experimentalLayoutFit : undefined
      return {
        apiKey: typeof apiKey === 'string' ? apiKey : '',
        baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
        model: typeof model === 'string' ? model : '',
        theme: theme === 'dark' ? 'dark' : 'light',
        tavilyKey: typeof tavilyKey === 'string' ? tavilyKey : '',
        sources: Array.isArray(sources) ? sources : [],
        layout,
        stylePrompt,
        roleDuties,
        editorial,
        customRoles,
        experimentalLayoutFit
      }
    }
  } catch {
    // 文件不存在或解析失败 → 用默认值
  }
  return { ...DEFAULT_SETTINGS }
}

async function writeSettings(settings: AiSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  // 同步到系统级主题，让原生标题栏/对话框跟随亮暗模式
  nativeTheme.themeSource = settings.theme
  // 同步刷新窗口底色，避免切主题后残留旧色"边框"
  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(settings.theme === 'dark' ? '#141414' : '#f5f5f5')
  }
}

/** 进行中的生成任务（供用户终止） */
const activeGenerations = new Map<string, AbortController>()

/** 订阅出刊用：在本次生成范围内叠加模板覆盖（model/baseUrl/stylePrompt/roleDuties 等），不写 settings.json */
function readSettingsWith(base: AiSettings, overrides?: Partial<AiSettings>): AiSettings {
  return overrides ? { ...base, ...overrides } : base
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_event, settings: AiSettings) => writeSettings(settings))
  // 单槽位生成：主进程统一持有 Key 与信息源，渲染进程不接触密钥。
  // generationId 用于用户终止（ai:cancel-generation）
  ipcMain.handle(
    'ai:generate-slot',
    async (
      _event,
      generationId: string,
      prompt: string,
      role: string,
      kind: string,
      tools: string[],
      docContext: DocContext,
      slotIndex: number,
      sources: InfoSource[],
      estHeight: number,
      overrides?: Partial<AiSettings>,
      widthMM?: number
    ) => {
      const settings = await readSettings()
      const controller = new AbortController()
      activeGenerations.set(generationId, controller)
      try {
        // 抓取该槽位内联挂载的信息源（带当日缓存，同源多槽只抓一次；失败标注原因不阻塞）。
        // 文件源（kind === 'file'）不预注入：读全文后经 readSource 工具由 AI 按需分块读取（限次）
        const sourceContents: { name: string; note: string; text: string }[] = []
        const fileSources: { name: string; note: string; text: string }[] = []
        for (const src of sources ?? []) {
          if (src?.kind === 'file') {
            if (!src.path) continue
            try {
              fileSources.push({ name: src.name, note: src.note, text: await readLocalSourceText(src.path) })
            } catch (err) {
              sourceContents.push({
                name: src.name,
                note: src.note,
                text: `（此文件源读取失败：${err instanceof Error ? err.message : String(err)}）`
              })
            }
            continue
          }
          if (!src?.url) continue
          try {
            sourceContents.push({ name: src.name, note: src.note, text: await fetchPageText(src.url) })
          } catch (err) {
            // 源抓取失败：如实标注原因（超时/HTTP 状态等），供 AI 在内容中说明与用户排查
            const reason = err instanceof Error ? err.message : String(err)
            sourceContents.push({ name: src.name, note: src.note, text: `（此源抓取失败：${reason}）` })
          }
        }
        const generated = await generateSlotContent(
          readSettingsWith(settings, overrides),
          prompt,
          role,
          kind,
          tools as ToolId[],
          docContext,
          slotIndex,
          sourceContents,
          controller.signal,
          estHeight,
          (delta) => _event.sender.send('ai:heartbeat', generationId, delta),
          fileSources,
          widthMM
        )
        // 配图闭环（ROADMAP Q3）：AI 给意图，系统用 Tavily 图搜回填真实 URL（失败不影响正文）
        const content = await resolveImageQueries(generated.content, settings.tavilyKey)
        return { content, usage: generated.usage }
      } finally {
        activeGenerations.delete(generationId)
      }
    }
  )
  // 用户终止某次生成
  ipcMain.handle('ai:cancel-generation', (_event, generationId: string) => {
    activeGenerations.get(generationId)?.abort()
    return true
  })

  // 选择本地文件作为参考源（渲染层不直接访问文件系统）
  ipcMain.handle('sources:pick-file', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      title: '选择参考文件',
      properties: ['openFile'],
      filters: [
        { name: '参考文档', extensions: ['txt', 'md', 'csv', 'json', 'log', 'pdf', 'docx'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const p = res.filePaths[0]
    return { path: p, name: p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1) }
  })

  /** 编辑部阶段共用的源摘要抓取（带当日缓存；失败标原因）。文件源读前 4000 字作摘要（选题只需概览） */
  const gatherSourceDigests = async (sources: InfoSource[]) => {
    const digests: { name: string; text: string }[] = []
    for (const src of sources ?? []) {
      if (src?.kind === 'file') {
        if (!src.path) continue
        try {
          digests.push({ name: src.name, text: (await readLocalSourceText(src.path)).slice(0, 4000) })
        } catch (err) {
          digests.push({ name: src.name, text: `（此文件源读取失败：${err instanceof Error ? err.message : String(err)}）` })
        }
        continue
      }
      if (!src?.url) continue
      try {
        digests.push({ name: src.name, text: await fetchPageText(src.url) })
      } catch (err) {
        digests.push({ name: src.name, text: `（此源抓取失败：${err instanceof Error ? err.message : String(err)}）` })
      }
    }
    return digests
  }

  /** 编辑部三段式 · 选题（ROADMAP Q2） */
  ipcMain.handle(
    'ai:plan-issue',
    async (
      _event,
      generationId: string,
      outline: { index: number; role: string; prompt: string }[],
      sources: InfoSource[],
      overrides?: Partial<AiSettings>
    ) => {
      const settings = readSettingsWith(await readSettings(), overrides)
      const controller = new AbortController()
      activeGenerations.set(generationId, controller)
      try {
        const digests = await gatherSourceDigests(sources)
        return await planIssue(settings, outline ?? [], digests, controller.signal, (delta) =>
          _event.sender.send('ai:heartbeat', generationId, delta)
        )
      } finally {
        activeGenerations.delete(generationId)
      }
    }
  )

  /** 编辑部三段式 · 审稿（ROADMAP Q2） */
  ipcMain.handle(
    'ai:review-issue',
    async (
      _event,
      generationId: string,
      articles: { index: number; role: string; content: string }[],
      overrides?: Partial<AiSettings>
    ) => {
      const settings = readSettingsWith(await readSettings(), overrides)
      const controller = new AbortController()
      activeGenerations.set(generationId, controller)
      try {
        return await reviewIssue(settings, articles ?? [], controller.signal, (delta) =>
          _event.sender.send('ai:heartbeat', generationId, delta)
        )
      } finally {
        activeGenerations.delete(generationId)
      }
    }
  )

  /** 订阅出刊归档：AI 提炼本期记忆摘要（失败由调用方降级为截断摘要） */
  ipcMain.handle(
    'ai:summarize-issue',
    async (
      _event,
      generationId: string,
      articles: { role: string; content: string }[],
      overrides?: Partial<AiSettings>
    ) => {
      const settings = readSettingsWith(await readSettings(), overrides)
      const controller = new AbortController()
      activeGenerations.set(generationId, controller)
      try {
        return await summarizeIssue(settings, articles ?? [], controller.signal, (delta) =>
          _event.sender.send('ai:heartbeat', generationId, delta)
        )
      } finally {
        activeGenerations.delete(generationId)
      }
    }
  )
  /** 长期总览压缩（v0.33 记忆升级）：AI 整合旧 digest 与新增期摘要，失败由调用方降级拼接 */
  ipcMain.handle(
    'ai:compress-digest',
    async (
      _event,
      generationId: string,
      oldDigest: string,
      overflow: { issuedAt: string; headline: string; points: string[] }[],
      overrides?: Partial<AiSettings>
    ) => {
      const settings = readSettingsWith(await readSettings(), overrides)
      const controller = new AbortController()
      activeGenerations.set(generationId, controller)
      try {
        return await compressDigest(settings, oldDigest ?? '', overflow ?? [], controller.signal)
      } finally {
        activeGenerations.delete(generationId)
      }
    }
  )
  // 开发/自动化验证用：导出真实状态到临时文件（测试与 AI 助手可读取）
  ipcMain.handle('dev:export-state', async () => {
    const settings = await readSettings()
    const out = {
      exportedAt: new Date().toISOString(),
      settings: {
        model: settings.model,
        baseUrl: settings.baseUrl,
        hasApiKey: Boolean(settings.apiKey),
        theme: settings.theme,
        hasTavilyKey: Boolean(settings.tavilyKey),
        sourceCount: settings.sources.length,
        sources: settings.sources.map((s) => ({ name: s.name, url: s.url, note: s.note }))
      }
    }
    await writeFile(join(app.getPath('userData'), 'dev-state.json'), JSON.stringify(out, null, 2))
    return out
  })
  // 启动时按已保存的偏好恢复系统主题
  void readSettings().then((s) => {
    nativeTheme.themeSource = s.theme as ThemeMode
  })
}
