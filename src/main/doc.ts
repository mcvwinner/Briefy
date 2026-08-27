import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import type { LayoutDoc } from '../shared/layout'

/** 简单的结构校验，防止打开任意 JSON 崩溃 */
function parseLayoutDoc(raw: string): LayoutDoc {
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error('不是有效的 Briefy 设计文件')
  const doc = data as Partial<LayoutDoc>
  if (doc.version !== 1 || !Array.isArray(doc.pages)) throw new Error('设计文件版本不受支持')
  return doc as LayoutDoc
}

export function registerDocIpc(): void {
  // 保存：弹保存框 → 写入 .briefy（即 LayoutSpec JSON）
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

  // 打开：弹打开框 → 校验 → 返回文档
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
