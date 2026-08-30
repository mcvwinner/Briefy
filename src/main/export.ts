import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LayoutDoc } from '../shared/layout'
import { readSettings } from './settings'
import type { AiSettings } from '../shared/settings'

/**
 * PDF 导出：把当前文档传给隐藏打印窗口，逐页渲染真实 A4 版式后 printToPDF。
 * 链路：export:pdf(doc) 暂存文档 → 打印窗口（带 preload）加载 ?print=1 →
 * 渲染进程 export:get-doc 取文档渲染 A4 页 → export:render-ready 通知 → printToPDF。
 * 页面物理尺寸由 CSS 保证（sheet 固定 210×297mm + overflow hidden），内容永不突破纸张。
 */

/** 待导出数据（主进程暂存）：文档 + 主窗口每槽 fitScale 终值（所见即所得）+ 设置快照（版式/主题，打印窗口同步装载避免竞态） */
let pendingDoc: { doc: LayoutDoc; fits?: Record<string, number>; settings: AiSettings } | null = null
/** 打印视图渲染完成的通知回调 */
let notifyRenderReady: (() => void) | null = null

/** electron-vite 产物扩展名随版本/配置变化（.js 或 .mjs），按实际存在的文件取用 */
function preloadPath(): string {
  const base = join(__dirname, '../preload/index')
  for (const ext of ['.mjs', '.js']) {
    if (existsSync(base + ext)) return base + ext
  }
  return base + '.mjs'
}

export function registerExportIpc(): void {
  ipcMain.handle(
    'export:pdf',
    async (_event, doc: LayoutDoc, savePath?: string, fits?: Record<string, number>) => {
    const appSettings = await readSettings()
    const source =
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.webContents.getURL().includes('print=1')) ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (!source) return null

    pendingDoc = doc ? { doc, fits, settings: appSettings } : null
    // 渲染完成通知（5s 超时兜底：即使渲染卡住也照常导出，不无限等待）
    const ready = new Promise<void>((resolve) => {
      notifyRenderReady = resolve
      setTimeout(resolve, 5000)
    })

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { preload: preloadPath(), sandbox: false }
    })
    try {
      const url = new URL(source.webContents.getURL())
      url.searchParams.set('print', '1')
      await printWin.loadURL(url.toString())
      await ready

      const pdfData = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })

      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w !== printWin) ?? source
      let filePath = savePath
      // dev 自动化：传入 savePath 直接落盘，不弹系统对话框
      if (!filePath) {
        const result = await dialog.showSaveDialog(win, {
          title: '导出 PDF',
          defaultPath: '报纸.pdf',
          filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }
      await writeFile(filePath, pdfData)
      return filePath
    } finally {
      notifyRenderReady = null
      pendingDoc = null
      // 调试：BRIEFY_KEEP_PRINT=1 时保留并显示打印窗口（对比主窗口与打印渲染差异）
      if (process.env.BRIEFY_KEEP_PRINT === '1' && !printWin.isDestroyed()) {
        printWin.show()
      } else if (!printWin.isDestroyed()) {
        printWin.destroy()
      }
    }
  })

  // 打印窗口渲染进程：取待导出文档与主窗口 fitScale 终值
  ipcMain.handle('export:get-doc', () => pendingDoc)
  // dev 自动化：读取任意路径的 .briefy（仅未打包版本可用）
  ipcMain.handle('dev:read-doc-path', async (_event, path: string) => {
    if (app.isPackaged) throw new Error('仅开发模式可用')
    if (!path.toLowerCase().endsWith('.briefy')) throw new Error('仅支持 .briefy 文件')
    const { readFile } = await import('node:fs/promises')
    return readFile(path, 'utf-8')
  })
  // 打印窗口渲染进程：A4 页面渲染完成
  ipcMain.handle('export:render-ready', () => {
    notifyRenderReady?.()
    return true
  })
}
