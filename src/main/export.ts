import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'

/**
 * PDF 导出：新建一个隐藏窗口加载当前渲染页的"打印视图"，用 printToPDF 输出。
 * 打印视图由渲染进程通过 sessionStorage 标记 + URL 参数触发干净版式（无工具栏/面板）。
 */
export function registerExportIpc(): void {
  ipcMain.handle('export:pdf', async () => {
    const source = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (!source) return null

    // 取当前页面 URL，加 print=1 参数进入打印模式
    const currentUrl = source.webContents.getURL()

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { preload: undefined, sandbox: true }
    })
    try {
      const url = new URL(currentUrl)
      url.searchParams.set('print', '1')
      await printWin.loadURL(url.toString())

      const pdfData = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })

      const win = BrowserWindow.getAllWindows()[0]
      const result = await dialog.showSaveDialog(win, {
        title: '导出 PDF',
        defaultPath: '报纸.pdf',
        filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, pdfData)
      return result.filePath
    } finally {
      if (!printWin.isDestroyed()) printWin.destroy()
    }
  })
}
