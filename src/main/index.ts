import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerSettingsIpc, readSettings } from './settings'
import { registerDocIpc } from './doc'
import { registerExportIpc } from './export'
import { registerUserPresetIpc } from './user-presets'

/** electron-vite 产物扩展名随版本/配置变化（.js 或 .mjs），按实际存在的文件取用 */
function preloadPath(): string {
  const base = join(__dirname, '../preload/index')
  for (const ext of ['.mjs', '.js']) {
    if (existsSync(base + ext)) return base + ext
  }
  return base + '.mjs'
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // 跟随当前主题源设置窗口底色：避免暗色模式下亮色"白边一圈"
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#f5f5f5',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 外部链接交给系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式加载 Vite 开发服务器，生产加载打包产物
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // 启动即恢复用户保存的主题：否则 nativeTheme 跟随系统，暗色应用会带亮色边框/白底窗口
  const settings = await readSettings()
  nativeTheme.themeSource = settings.theme
  registerSettingsIpc()
  registerDocIpc()
  registerExportIpc()
  registerUserPresetIpc()
  createMainWindow()

  app.on('activate', () => {
    // macOS 上点击 Dock 图标时若无窗口则重建
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
