import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AiSettings, type InfoSource, type ThemeMode } from '../shared/settings'
import { generateSlotContent } from './ai'
import type { DocContext } from './ai'
import { fetchPageText } from './tools'
import type { ToolId } from '../shared/layout'

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
      const { apiKey = '', baseUrl = '', model = '', theme = 'light', tavilyKey = '', sources = [] } =
        parsed as Record<string, unknown>
      return {
        apiKey: typeof apiKey === 'string' ? apiKey : '',
        baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
        model: typeof model === 'string' ? model : '',
        theme: theme === 'dark' ? 'dark' : 'light',
        tavilyKey: typeof tavilyKey === 'string' ? tavilyKey : '',
        sources: Array.isArray(sources) ? sources : []
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
      estHeight: number
    ) => {
      const settings = await readSettings()
      const controller = new AbortController()
      activeGenerations.set(generationId, controller)
      try {
        // 抓取该槽位内联挂载的信息源（失败的单个源跳过，不阻塞整体生成）
        const sourceContents: { name: string; note: string; text: string }[] = []
        for (const src of sources ?? []) {
          if (!src?.url) continue
          try {
            sourceContents.push({ name: src.name, note: src.note, text: await fetchPageText(src.url) })
          } catch {
            // 源抓取失败：跳过并在内容中如实说明
            sourceContents.push({ name: src.name, note: src.note, text: '（此源抓取失败）' })
          }
        }
        return await generateSlotContent(
          settings,
          prompt,
          role,
          kind,
          tools as ToolId[],
          docContext,
          slotIndex,
          sourceContents,
          controller.signal,
          estHeight
        )
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
