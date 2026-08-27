import { useEffect, useState } from 'react'
import {
  FluentProvider,
  makeStyles,
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
  WeatherSunnyRegular
} from '@fluentui/react-icons'
import PageView from './components/PageView'
import PageTabs from './components/PageTabs'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import SettingsDialog from './components/SettingsDialog'
import { useLayout } from './hooks/useLayout'
import type { AiSettings, ThemeMode } from '../../shared/settings'

declare global {
  interface Window {
    briefy?: {
      getSettings(): Promise<AiSettings>
      saveSettings(settings: AiSettings): Promise<void>
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

  const isDark = settings?.theme === 'dark'

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme} style={{ height: '100vh' }}>
      <div className={`${styles.app} ${isDark ? 'theme-dark' : 'theme-light'}`}>
        <FluentToolbar aria-label="主工具栏" className={styles.toolbar}>          <Tooltip content="新建文档" relationship="description">
            <ToolbarButton icon={<DocumentAddRegular />}>新建</ToolbarButton>
          </Tooltip>
          <Tooltip content="打开设计文件" relationship="description">
            <ToolbarButton icon={<FolderOpenRegular />}>打开</ToolbarButton>
          </Tooltip>
          <Tooltip content="保存设计" relationship="description">
            <ToolbarButton icon={<SaveRegular />}>保存</ToolbarButton>
          </Tooltip>
          <Tooltip content="在页面上框选一块内容区域" relationship="description">
            <ToolbarButton
              icon={<AddSquareRegular />}
              appearance={drawing ? 'primary' : undefined}
              onClick={() => setDrawing(!drawing)}
            >
              {drawing ? '点击页面框选…' : '添加内容'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="AI 生成所有内容块" relationship="description">
            <ToolbarButton icon={<WandRegular />} disabled={!hasApiKey}>
              生成
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

        <StatusBar version="0.0.6" hasApiKey={hasApiKey} />

        <SettingsDialog open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} />
      </div>
    </FluentProvider>
  )
}

export default App
