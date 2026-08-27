import { app, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AiSettings } from '../shared/settings'

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
      const { apiKey = '', baseUrl = '', model = '' } = parsed as Record<string, unknown>
      return {
        apiKey: typeof apiKey === 'string' ? apiKey : '',
        baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
        model: typeof model === 'string' ? model : ''
      }
    }
  } catch {
    // 文件不存在或解析失败 → 用默认值
  }
  return { ...DEFAULT_SETTINGS }
}

async function writeSettings(settings: AiSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_event, settings: AiSettings) => writeSettings(settings))
}
