import { useEffect, useState } from 'react'
import {
  FluentProvider,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  tokens,
  Toolbar as FluentToolbar,
  ToolbarButton,
  Tooltip,
  webDarkTheme,
  webLightTheme
} from '@fluentui/react-components'
import {
  DocumentAddRegular,
  FolderOpenRegular,
  SaveRegular,
  AddSquareRegular,
  WandRegular,
  SettingsRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
  DocumentPdfRegular,
  AppsRegular
} from '@fluentui/react-icons'
import PageView from './components/PageView'
import PageTabs from './components/PageTabs'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import SettingsDialog from './components/SettingsDialog'
import { useLayout } from './hooks/useLayout'
import type { AiSettings, ThemeMode } from '../../shared/settings'
import type { Block, LayoutDoc } from '../../shared/layout'
import { PRESETS, buildDocFromPreset } from '../../shared/presets'

declare global {
  interface Window {
    briefy?: {
      getSettings(): Promise<AiSettings>
      saveSettings(settings: AiSettings): Promise<void>
      generateBlock(prompt: string, kind: string): Promise<{ content: string }>
      saveDoc(doc: LayoutDoc): Promise<string | null>
      openDoc(): Promise<LayoutDoc | null>
      exportPdf(): Promise<string | null>
    }
  }
}

const useStyles = makeStyles({
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground2
  },
  workspace: {
    flex: 1,
    display: 'flex',
    minHeight: 0
  },
  canvasScroll: {
    flex: 1,
    overflow: 'auto',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    backgroundColor: tokens.colorNeutralBackground3,
    scrollbarColor: `${tokens.colorNeutralStroke1} transparent`,
    '::-webkit-scrollbar': {
      width: '12px',
      height: '12px'
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: tokens.colorNeutralStroke1,
      borderRadius: '6px',
      border: `3px solid transparent`,
      backgroundClip: 'content-box'
    },
    '::-webkit-scrollbar-thumb:hover': {
      backgroundColor: tokens.colorNeutralStroke1Hover
    },
    '::-webkit-scrollbar-track': {
      backgroundColor: 'transparent'
    }
  },
  toolbar: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: '4px 8px'
  }
})

/** 打印/导出模式：URL 带 ?print=1 时为 true，只渲染纯净版面 */
const PRINT_MODE = new URLSearchParams(window.location.search).has('print')

function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AiSettings | null>(null)
  // "添加内容"框选模式
  const [drawing, setDrawing] = useState(false)

  const layout = useLayout()
  const styles = useStyles()

  useEffect(() => {
    void window.briefy?.getSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  /** 切换主题并持久化（settings 尚未加载或浏览器环境时仅本地生效） */
  const toggleTheme = async (): Promise<void> => {
    const current: ThemeMode = settings?.theme === 'dark' ? 'dark' : 'light'
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
    if (settings) {
      const updated = { ...settings, theme: next }
      setSettings(updated)
      await window.briefy?.saveSettings?.(updated)
    } else {
      // settings 未加载（如纯浏览器预览）：只改本地状态让 UI 生效
      setSettings({ apiKey: '', baseUrl: '', model: '', theme: next })
    }
  }

  // Delete 键删除选中区块
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' || !layout.selection) return
      layout.removeBlock(layout.selection.page.id, layout.selection.block.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layout])

  const hasApiKey = Boolean(settings?.apiKey)

  /** 并发生成所有区块（并发上限 3），逐块回填 */
  const [generating, setGenerating] = useState(false)
  const generateAll = async (): Promise<void> => {
    if (!window.briefy || generating) return
    setGenerating(true)
    try {
      const tasks: { pageId: string; block: Block }[] = []
      for (const page of layout.doc.pages) {
        for (const block of page.blocks) {
          if (!block.prompt.trim()) continue // 无提示词的区块跳过
          tasks.push({ pageId: page.id, block })
        }
      }
      const CONCURRENCY = 3
      let cursor = 0
      const worker = async (): Promise<void> => {
        while (cursor < tasks.length) {
          const task = tasks[cursor++]
          layout.updateBlock(task.pageId, task.block.id, { status: 'generating' })
          try {
            const { content } = await window.briefy!.generateBlock(task.block.prompt, task.block.kind)
            layout.updateBlock(task.pageId, task.block.id, { content, status: 'done' })
          } catch (err) {
            layout.updateBlock(task.pageId, task.block.id, {
              content: err instanceof Error ? err.message : String(err),
              status: 'error'
            })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker))
    } finally {
      setGenerating(false)
    }
  }

  const isDark = settings?.theme === 'dark'

  /** 保存设计为 .briefy 文件 */
  const saveDoc = async (): Promise<void> => {
    await window.briefy?.saveDoc(layout.doc)
  }

  /** 打开 .briefy 设计文件 */
  const openDoc = async (): Promise<void> => {
    const doc = await window.briefy?.openDoc()
    if (doc) layout.loadDoc(doc)
  }

  /** 导出当前文档为 PDF */
  const exportPdf = async (): Promise<void> => {
    await window.briefy?.exportPdf()
  }

  /** 套用排版预设 */
  const applyPreset = (presetId: string): void => {
    const preset = PRESETS.find((p) => p.id === presetId)
    if (preset) layout.loadDoc(buildDocFromPreset(preset))
  }

  // 打印模式：仅渲染所有页面的干净版式，供 printToPDF 截取
  if (PRINT_MODE) {
    return (
      <FluentProvider theme={webLightTheme}>
        <div className="print-view">
          {layout.doc.pages.map((page) =>
            page.blocks.map((block) => (
              <div
                key={block.id}
                className="print-block"
                style={{
                  left: `${(block.x / 210) * 100}%`,
                  top: `${(block.y / 297) * 100}%`,
                  width: `${(block.width / 210) * 100}%`,
                  height: `${(block.height / 297) * 100}%`
                }}
              >
                {block.content}
              </div>
            ))
          )}
        </div>
      </FluentProvider>
    )
  }

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme} style={{ height: '100vh' }}>
      <div className={`${styles.app} ${isDark ? 'theme-dark' : 'theme-light'}`}>
        <FluentToolbar aria-label="主工具栏" className={styles.toolbar}>
          {/* ---- 文件二级菜单：新建/打开/保存/导出 ---- */}
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <ToolbarButton icon={<FolderOpenRegular />}>文件</ToolbarButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<DocumentAddRegular />} onClick={layout.newDoc}>
                  新建
                </MenuItem>
                <MenuItem icon={<FolderOpenRegular />} onClick={() => void openDoc()}>
                  打开…
                </MenuItem>
                <MenuItem icon={<SaveRegular />} onClick={() => void saveDoc()}>
                  保存…
                </MenuItem>
                <MenuItem icon={<DocumentPdfRegular />} onClick={() => void exportPdf()}>
                  导出 PDF…
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Tooltip content="在页面上框选一块内容区域" relationship="description">
            <ToolbarButton
              icon={<AddSquareRegular />}
              appearance={drawing ? 'primary' : undefined}
              onClick={() => setDrawing(!drawing)}
            >
              {drawing ? '点击页面框选…' : '添加内容'}
            </ToolbarButton>
          </Tooltip>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <ToolbarButton icon={<AppsRegular />}>预设</ToolbarButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {PRESETS.map((preset) => (
                  <MenuItem key={preset.id} onClick={() => applyPreset(preset.id)}>
                    <div>
                      <div>{preset.name}</div>
                      <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                        {preset.description}
                      </div>
                    </div>
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Tooltip content="AI 生成所有内容块" relationship="description">
            <ToolbarButton
              icon={<WandRegular />}
              disabled={!hasApiKey || generating}
              appearance={hasApiKey ? 'primary' : undefined}
              onClick={() => void generateAll()}
            >
              {generating ? '生成中…' : '生成'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content={isDark ? '切换到亮色模式' : '切换到暗色模式'} relationship="description">
            <ToolbarButton
              icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={() => void toggleTheme()}
            >
              {isDark ? '亮色' : '暗色'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="配置 AI 服务" relationship="description">
            <ToolbarButton
              icon={<SettingsRegular />}
              onClick={() => setSettingsOpen(true)}
              {...(hasApiKey ? {} : { appearance: 'primary' as const })}
            >
              设置{hasApiKey ? '' : '（未配置）'}
            </ToolbarButton>
          </Tooltip>
        </FluentToolbar>

        <div className={styles.workspace}>
          <div className={styles.canvasScroll}>
            {layout.doc.pages
              .filter((page) => page.id === layout.currentPageId)
              .map((page) => (
                <PageView
                  key={page.id}
                  page={page}
                  selectedBlockId={layout.selectedBlockId}
                  drawRect={drawing ? (rect) => {
                    layout.addBlock(page.id, rect.x, rect.y, rect.width, rect.height)
                    setDrawing(false)
                  } : undefined}
                  onSelectBlock={layout.selectBlock}
                  onChangeBlock={(blockId, patch) => layout.updateBlock(page.id, blockId, patch)}
                />
              ))}
          </div>
          <PropertiesPanel
            block={layout.selection?.block ?? null}
            onChange={(patch) => {
              if (layout.selection) {
                layout.updateBlock(layout.selection.page.id, layout.selection.block.id, patch)
              }
            }}
            onRemove={() => {
              if (layout.selection) {
                layout.removeBlock(layout.selection.page.id, layout.selection.block.id)
              }
            }}
          />
        </div>

        <PageTabs
          pages={layout.doc.pages}
          currentPageId={layout.currentPageId}
          onSelect={layout.setCurrentPageId}
          onAdd={layout.addPage}
          onRemove={layout.removePage}
        />

        <StatusBar version="0.2.1" hasApiKey={hasApiKey} />

        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setSettings(updated)}
        />
      </div>
    </FluentProvider>
  )
}

export default App
