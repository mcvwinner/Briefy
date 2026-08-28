import { app, ipcMain, nativeTheme } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AiSettings, type ThemeMode } from '../shared/settings'
import { generateSlotContent } from './ai'
import type { DocContext } from './ai'
import type { ToolId } from '../shared/layout'

const SETTINGS_FILE = 'settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

async function readSettings(): Promise<AiSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    // 只取已知字段，防止文件被手改出脏数据
    if (parsed && typeof parsed === 'object') {
      const { apiKey = '', baseUrl = '', model = '', theme = 'light', tavilyKey = '' } =
        parsed as Record<string, unknown>
      return {
        apiKey: typeof apiKey === 'string' ? apiKey : '',
        baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
        model: typeof model === 'string' ? model : '',
        theme: theme === 'dark' ? 'dark' : 'light',
        tavilyKey: typeof tavilyKey === 'string' ? tavilyKey : ''
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
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_event, settings: AiSettings) => writeSettings(settings))
  // 单槽位生成：主进程统一持有 Key，渲染进程不接触密钥
  ipcMain.handle(
    'ai:generate-slot',
    async (_event, prompt: string, role: string, kind: string, tools: string[], docContext: DocContext, slotIndex: number) => {
      const settings = await readSettings()
      return generateSlotContent(settings, prompt, role, kind, tools as ToolId[], docContext, slotIndex)
    }
  )
  // 启动时按已保存的偏好恢复系统主题
  void readSettings().then((s) => {
    nativeTheme.themeSource = s.theme as ThemeMode
  })
}
