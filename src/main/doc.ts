import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import type { Block, LayoutDoc, ToolId } from '../shared/layout'

/** 修补旧版文件的区块：补默认工具字段，保证打开不崩 */
function normalizeBlocks(blocks: unknown): Block[] {
  if (!Array.isArray(blocks)) return []
  return blocks.map((b) => {
    const block = b as Partial<Block>
    const validTools: ToolId[] = ['getCurrentTime', 'webSearch', 'fetchPage', 'readReference']
    return {
      id: block.id ?? crypto.randomUUID(),
      x: typeof block.x === 'number' ? block.x : 0,
      y: typeof block.y === 'number' ? block.y : 0,
      width: typeof block.width === 'number' ? block.width : 50,
      height: typeof block.height === 'number' ? block.height : 40,
      prompt: typeof block.prompt === 'string' ? block.prompt : '',
      kind: block.kind ?? 'text',
      // 旧文件没有 tools 字段 → 默认给时间工具
      tools: Array.isArray(block.tools)
        ? block.tools.filter((t) => validTools.includes(t))
        : ['getCurrentTime'],
      status: block.status ?? 'empty',
      content: typeof block.content === 'string' ? block.content : undefined
    }
  })
}

/** 简单的结构校验 + 兼容修补，防止打开任意 JSON 崩溃 */
function parseLayoutDoc(raw: string): LayoutDoc {
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error('不是有效的 Briefy 设计文件')
  const doc = data as Partial<LayoutDoc>
  if (doc.version !== 1 || !Array.isArray(doc.pages)) throw new Error('设计文件版本不受支持')
  return {
    version: 1,
    title: doc.title ?? '未命名报纸',
    pages: doc.pages.map((p) => ({ id: p.id ?? crypto.randomUUID(), blocks: normalizeBlocks(p.blocks) }))
  }
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
