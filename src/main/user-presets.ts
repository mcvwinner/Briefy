import { app, dialog, ipcMain } from 'electron'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UserPreset } from '../shared/user-preset'

const PRESETS_DIR = 'presets'

function presetsPath(): string {
  return join(app.getPath('userData'), PRESETS_DIR)
}

/** 单个预设文件名（含 .json） */
const fileName = (name: string): string => `${name}.json`

export function registerUserPresetIpc(): void {
  // 列出全部用户预设
  ipcMain.handle('user-preset:list', async (): Promise<UserPreset[]> => {
    try {
      const files = await readdir(presetsPath())
      const presets: UserPreset[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const raw = await readFile(join(presetsPath(), file), 'utf-8')
          const data = JSON.parse(raw) as UserPreset
          if (data.version === 1 && data.name) presets.push(data)
        } catch {
          // 单个文件损坏不影响其余
        }
      }
      return presets.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    } catch {
      return [] // 目录不存在
    }
  })

  // 保存（新增或覆盖同名）
  ipcMain.handle('user-preset:save', async (_event, preset: UserPreset): Promise<'saved' | 'name-conflict' | 'error'> => {
    if (!preset.name?.trim()) return 'error'
    try {
      await mkdir(presetsPath(), { recursive: true })
      await writeFile(
        join(presetsPath(), fileName(preset.name)),
        JSON.stringify(preset, null, 2),
        'utf-8'
      )
      return 'saved'
    } catch {
      return 'error'
    }
  })

  // 检查同名是否存在
  ipcMain.handle('user-preset:exists', async (_event, name: string): Promise<boolean> => {
    try {
      await readFile(join(presetsPath(), fileName(name)), 'utf-8')
      return true
    } catch {
      return false
    }
  })

  // 删除
  ipcMain.handle('user-preset:delete', async (_event, name: string): Promise<boolean> => {
    try {
      await rm(join(presetsPath(), fileName(name)))
      return true
    } catch {
      return false
    }
  })

  // 重命名
  ipcMain.handle(
    'user-preset:rename',
    async (_event, oldName: string, newName: string): Promise<boolean> => {
      if (!newName?.trim()) return false
      try {
        const raw = await readFile(join(presetsPath(), fileName(oldName)), 'utf-8')
        const preset = JSON.parse(raw) as UserPreset
        preset.name = newName
        await writeFile(join(presetsPath(), fileName(newName)), JSON.stringify(preset, null, 2), 'utf-8')
        await rm(join(presetsPath(), fileName(oldName)))
        return true
      } catch {
        return false
      }
    }
  )

  // 导出为 .briefy-preset 文件（可分享）
  ipcMain.handle('user-preset:export', async (_event, name: string): Promise<string | null> => {
    try {
      const raw = await readFile(join(presetsPath(), fileName(name)), 'utf-8')
      const win = BrowserWindow.getAllWindows()[0]
      const result = await dialog.showSaveDialog(win, {
        title: '导出预设',
        defaultPath: `${name}.briefy-preset`,
        filters: [{ name: 'Briefy 预设', extensions: ['briefy-preset'] }]
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, raw, 'utf-8')
      return result.filePath
    } catch {
      return null
    }
  })

  // 从文件导入
  ipcMain.handle('user-preset:import', async (): Promise<UserPreset | null> => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '导入预设',
      filters: [{ name: 'Briefy 预设', extensions: ['briefy-preset'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      const preset = JSON.parse(raw) as UserPreset
      if (preset.version !== 1 || !preset.name) return null
      await mkdir(presetsPath(), { recursive: true })
      await writeFile(join(presetsPath(), fileName(preset.name)), JSON.stringify(preset, null, 2), 'utf-8')
      return preset
    } catch {
      return null
    }
  })
}
