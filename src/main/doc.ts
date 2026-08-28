import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { parseLayoutDoc, type LayoutDoc } from '../shared/layout'

/**
 * .briefy 设计文件保存/打开。
 * v1（blocks）与 v2（slots）统一由 parseLayoutDoc 迁移，写回时始终为 v2。
 */
export function registerDocIpc(): void {
  ipcMain.handle('doc:save', async (_event, doc: LayoutDoc) => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win, {
      title: '保存设计',
      defaultPath: `${doc.title || '未命名报纸'}.briefy`,
      filters: [{ name: 'Briefy 设计', extensions: ['briefy'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, JSON.stringify(doc, null, 2), 'utf-8')
    return result.filePath
  })

  ipcMain.handle('doc:open', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '打开设计',
      filters: [{ name: 'Briefy 设计', extensions: ['briefy'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const raw = await readFile(result.filePaths[0], 'utf-8')
    return parseLayoutDoc(raw)
  })
}
