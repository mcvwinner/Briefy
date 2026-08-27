import { useEffect, useState } from 'react'
import {
  FluentProvider,
  teamsLightTheme,
  Toolbar as FluentToolbar,
  ToolbarButton,
  Tooltip
} from '@fluentui/react-components'
import {
  DocumentAddRegular,
  FolderOpenRegular,
  SaveRegular,
  AddSquareRegular,
  WandRegular,
  SettingsRegular
} from '@fluentui/react-icons'
import PageCanvas from './components/PageCanvas'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import SettingsDialog from './components/SettingsDialog'
import type { AiSettings } from '../../shared/settings'

declare global {
  interface Window {
    briefy?: { getSettings(): Promise<AiSettings> }
  }
}

function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AiSettings | null>(null)

  // 启动时读取已保存的 AI 配置
  useEffect(() => {
    void window.briefy?.getSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  const hasApiKey = Boolean(settings?.apiKey)

  return (
    <FluentProvider theme={teamsLightTheme} style={{ height: '100vh' }}>
      <div className="app">
        <FluentToolbar aria-label="主工具栏">
          <Tooltip content="新建文档" relationship="description">
            <ToolbarButton icon={<DocumentAddRegular />}>新建</ToolbarButton>
          </Tooltip>
          <Tooltip content="打开设计文件" relationship="description">
            <ToolbarButton icon={<FolderOpenRegular />}>打开</ToolbarButton>
          </Tooltip>
          <Tooltip content="保存设计" relationship="description">
            <ToolbarButton icon={<SaveRegular />}>保存</ToolbarButton>
          </Tooltip>
          <Tooltip content="在页面上框选一块内容区域" relationship="description">
            <ToolbarButton icon={<AddSquareRegular />} disabled={!hasApiKey}>
              添加内容
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="AI 生成所有内容块" relationship="description">
            <ToolbarButton icon={<WandRegular />} disabled={!hasApiKey}>
              生成
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

        <div className="workspace">
          <PageCanvas />
          <PropertiesPanel />
        </div>

        <StatusBar version="0.0.3" hasApiKey={hasApiKey} />

        <SettingsDialog open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} />
      </div>
    </FluentProvider>
  )
}

export default App
