import type * as React from 'react'
import { useEffect, useState, useCallback } from 'react'
import {
  FluentProvider,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MenuGroup,
  MenuGroupHeader,
  MenuDivider,
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
  AppsRegular,
  DeleteRegular,
  ArrowExportLtrRegular,
  ArrowImportRegular,
  EditRegular
} from '@fluentui/react-icons'
import PageView from './components/PageView'
import PageTabs from './components/PageTabs'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import SettingsDialog from './components/SettingsDialog'
import InputDialog from './components/InputDialog'
import { useLayout } from './hooks/useLayout'
import type { AiSettings, ThemeMode } from '../../shared/settings'
import type { LayoutDoc, Slot, SlotRole } from '../../shared/layout'
import { ROLE_DEFS } from '../../shared/layout'
import { PRESETS, buildDocFromPreset } from '../../shared/presets'
import { toPresetSlots, fromPresetSlots, type UserPreset } from '../../shared/user-preset'

declare global {
  interface Window {
    briefy?: {
      getSettings(): Promise<AiSettings>
      saveSettings(settings: AiSettings): Promise<void>
      generateSlot(
        prompt: string,
        role: string,
        kind: string,
        tools: string[],
        docContext: unknown,
        slotIndex: number,
        sourceIds: string[]
      ): Promise<{ content: string }>
      devExportState(): Promise<unknown>
      saveDoc(doc: LayoutDoc): Promise<string | null>
      openDoc(): Promise<LayoutDoc | null>
      exportPdf(): Promise<string | null>
      listUserPresets(): Promise<UserPreset[]>
      saveUserPreset(preset: UserPreset): Promise<'saved' | 'name-conflict' | 'error'>
      deleteUserPreset(name: string): Promise<boolean>
      renameUserPreset(oldName: string, newName: string): Promise<boolean>
      exportUserPreset(name: string): Promise<string | null>
      importUserPreset(): Promise<UserPreset | null>
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

/** 打印视图中的槽位内容渲染（纯文本流，无需控件交互） */
function SlotContentRender({ slot }: { slot: Slot }): React.JSX.Element {
  return <div className="print-slot">{slot.content ?? ''}</div>
}

function App(): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AiSettings | null>(null)
  // 输入对话框状态（Electron 无 window.prompt，用此替代）
  const [inputDialog, setInputDialog] = useState<{
    title: string
    label: string
    initialValue: string
    onConfirm: (value: string) => void
  } | null>(null)

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
      setSettings({ apiKey: '', baseUrl: '', model: '', theme: next, tavilyKey: '', sources: [] })
    }
  }

  // Delete 键删除选中槽位
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' || !layout.selection) return
      layout.removeSlot(layout.selection.page.id, layout.selection.slot.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layout])

  const hasApiKey = Boolean(settings?.apiKey)

  /** 并发生成所有槽位（并发上限 3），逐槽回填；附带文档大纲供 AI 语篇决策 */
  const [generating, setGenerating] = useState(false)
  const generateAll = async (): Promise<void> => {
    if (!window.briefy || generating) return
    setGenerating(true)
    try {
      const tasks: { pageId: string; slot: Slot; index: number }[] = []
      let index = 0
      for (const page of layout.doc.pages) {
        for (const slot of page.slots) {
          if (!slot.prompt.trim()) continue // 无提示词的槽位跳过
          tasks.push({ pageId: page.id, slot, index })
          index++
        }
      }
      // 语篇上下文：整份报纸的槽位大纲（角色+职责）
      const docContext = {
        title: layout.doc.title,
        outline: layout.doc.pages.flatMap((page, pi) =>
          page.slots.map((s) => ({
            position: `第${pi + 1}页·${ROLE_DEFS[s.role].name}`,
            prompt: s.prompt
          }))
        )
      }

      const CONCURRENCY = 3
      let cursor = 0
      const worker = async (): Promise<void> => {
        while (cursor < tasks.length) {
          const task = tasks[cursor++]
          layout.updateSlot(task.pageId, task.slot.id, { status: 'generating' })
          try {
            const { content } = await window.briefy!.generateSlot(
              task.slot.prompt,
              ROLE_DEFS[task.slot.role].name,
              task.slot.kind,
              task.slot.tools ?? ['getCurrentTime'],
              docContext,
              task.index,
              task.slot.sourceIds ?? []
            )
            layout.updateSlot(task.pageId, task.slot.id, { content, status: 'done' })
          } catch (err) {
            layout.updateSlot(task.pageId, task.slot.id, {
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

  // ---- 用户自定义预设 ----
  const [userPresets, setUserPresets] = useState<UserPreset[]>([])

  const refreshUserPresets = useCallback(async (): Promise<void> => {
    const list = await window.briefy?.listUserPresets()
    setUserPresets(list ?? [])
  }, [])

  useEffect(() => {
    void refreshUserPresets()
  }, [refreshUserPresets])

  /** 把当前版面另存为预设（含提示词与工具配置，剥离生成内容） */
  const saveAsPreset = async (name: string): Promise<void> => {
    if (!window.briefy || !name.trim()) return
    const preset: UserPreset = {
      version: 2,
      name: name.trim(),
      savedAt: new Date().toISOString(),
      pages: layout.doc.pages.map((p) => ({ slots: toPresetSlots(p.slots) }))
    }
    const result = await window.briefy.saveUserPreset(preset)
    void refreshUserPresets()
    if (result === 'name-conflict') window.alert('同名预设已存在，已覆盖保存')
  }

  /** 套用用户预设 */
  const applyUserPreset = (preset: UserPreset): void => {
    layout.loadDoc({
      version: 2,
      title: preset.name,
      pages: preset.pages.map((p) => ({ id: crypto.randomUUID(), slots: fromPresetSlots(p.slots) }))
    })
  }

  const deleteUserPreset = async (name: string): Promise<void> => {
    if (!window.confirm(`删除预设「${name}」？`)) return
    await window.briefy?.deleteUserPreset(name)
    void refreshUserPresets()
  }

  const renameUserPreset = async (oldName: string, newName: string): Promise<void> => {
    if (!newName.trim() || newName === oldName) return
    await window.briefy?.renameUserPreset(oldName, newName.trim())
    void refreshUserPresets()
  }

  const exportUserPreset = async (name: string): Promise<void> => {
    await window.briefy?.exportUserPreset(name)
  }

  const importUserPreset = async (): Promise<void> => {
    const preset = await window.briefy?.importUserPreset()
    if (preset) void refreshUserPresets()
    else if (preset === null) void refreshUserPresets() // 取消或失败都刷新一下
  }

  // 打印模式：仅渲染所有页面的干净版式，供 printToPDF 截取
  if (PRINT_MODE) {
    return (
      <FluentProvider theme={webLightTheme}>
        <div className="print-view">
          {layout.doc.pages.flatMap((page) =>
            page.slots.map((slot) => (
              <div
                key={slot.id}
                className="print-block"
                style={{ left: 0, width: '100%' }}
              >
                <SlotContentRender slot={slot} />
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
              <Tooltip content="新建/打开/保存设计文件，导出 PDF" relationship="description">
                <ToolbarButton icon={<FolderOpenRegular />}>文件</ToolbarButton>
              </Tooltip>
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
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="向页面添加一个内容槽位：选角色（头条/正文/数据/快讯/提示框）即可，AI 按角色分工写作，高度随内容自适应" relationship="description">
                <ToolbarButton icon={<AddSquareRegular />}>添加槽位</ToolbarButton>
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {(Object.keys(ROLE_DEFS) as SlotRole[])
                  .filter((r) => r !== 'custom')
                  .map((role) => (
                    <MenuItem
                      key={role}
                      onClick={() => layout.addSlot(layout.currentPageId, role, 'full')}
                    >
                      {ROLE_DEFS[role].name}
                    </MenuItem>
                  ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="一键套用整套版面（槽位+提示词+工具）；也可把当前版面存为自己的预设" relationship="description">
                <ToolbarButton icon={<AppsRegular />}>预设</ToolbarButton>
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuGroup>
                  <MenuGroupHeader>内置预设</MenuGroupHeader>
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
                </MenuGroup>
                <MenuDivider />
                <MenuGroup>
                  <MenuGroupHeader>我的预设</MenuGroupHeader>
                  <MenuItem
                    icon={<SaveRegular />}
                    onClick={() =>
                      setInputDialog({
                        title: '保存为预设',
                        label: '预设名称',
                        initialValue: layout.doc.title,
                        onConfirm: (name) => void saveAsPreset(name)
                      })
                    }
                  >
                    把当前版面存为预设…
                  </MenuItem>
                  <MenuItem icon={<ArrowImportRegular />} onClick={() => void importUserPreset()}>
                    导入预设…
                  </MenuItem>
                  {userPresets.length > 0 && <MenuDivider />}
                  {userPresets.map((preset) => (
                    <MenuItem key={preset.name} onClick={() => applyUserPreset(preset)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                        <span style={{ flex: 1 }}>{preset.name}</span>
                        <span
                          role="button"
                          aria-label={`重命名 ${preset.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setInputDialog({
                              title: '重命名预设',
                              label: '新名称',
                              initialValue: preset.name,
                              onConfirm: (newName) => void renameUserPreset(preset.name, newName)
                            })
                          }}
                        >
                          <EditRegular fontSize={14} />
                        </span>
                        <span
                          role="button"
                          aria-label={`导出 ${preset.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void exportUserPreset(preset.name)
                          }}
                        >
                          <ArrowExportLtrRegular fontSize={14} />
                        </span>
                        <span
                          role="button"
                          aria-label={`删除 ${preset.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteUserPreset(preset.name)
                          }}
                        >
                          <DeleteRegular fontSize={14} style={{ color: '#c50f1f' }} />
                        </span>
                      </div>
                    </MenuItem>
                  ))}
                </MenuGroup>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Tooltip content="让 AI 填充全部槽位：按各槽位的角色与提示词并行写作；可在设置中配置模型与信息源" relationship="description">
            <ToolbarButton
              icon={<WandRegular />}
              disabled={!hasApiKey || generating}
              appearance={hasApiKey ? 'primary' : undefined}
              onClick={() => void generateAll()}
            >
              {generating ? '生成中…' : '生成'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content={isDark ? '切换到亮色模式' : '切换到暗色模式（主题偏好会保存）'} relationship="description">
            <ToolbarButton
              icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={() => void toggleTheme()}
            >
              {isDark ? '亮色' : '暗色'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="配置 AI 服务（API Key/模型）、信息源、搜索 Key" relationship="description">
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
                  selectedSlotId={layout.selectedSlotId}
                  onSelectSlot={layout.selectSlot}
                />
              ))}
          </div>
          <PropertiesPanel
            slot={layout.selection?.slot ?? null}
            sources={settings?.sources ?? []}
            onChange={(patch) => {
              if (layout.selection) {
                layout.updateSlot(layout.selection.page.id, layout.selection.slot.id, patch)
              }
            }}
            onSetWidth={(widthMode) => {
              if (layout.selection) {
                layout.setSlotWidth(layout.selection.page.id, layout.selection.slot.id, widthMode)
              }
            }}
            onRemove={() => {
              if (layout.selection) {
                layout.removeSlot(layout.selection.page.id, layout.selection.slot.id)
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

        <StatusBar version="0.9.3" hasApiKey={hasApiKey} />

        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setSettings(updated)}
        />

        <InputDialog
          open={inputDialog !== null}
          title={inputDialog?.title ?? ''}
          label={inputDialog?.label ?? ''}
          initialValue={inputDialog?.initialValue ?? ''}
          onConfirm={(value) => {
            inputDialog?.onConfirm(value)
            setInputDialog(null)
          }}
          onCancel={() => setInputDialog(null)}
        />
      </div>
    </FluentProvider>
  )
}

export default App
