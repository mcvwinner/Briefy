import type * as React from 'react'
import { useEffect, useState } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Button,
  Checkbox,  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  makeStyles,
  Textarea,
  tokens
} from '@fluentui/react-components'
import { DeleteRegular } from '@fluentui/react-icons'
import type { AiSettings, InfoSource, LayoutPrefs } from '../../../shared/settings'
import { ROLE_DEFS } from '../../../shared/layout'
import type { SlotRole } from '../../../shared/layout'

/** 设置分区 */
type SettingsTab = 'ai' | 'layout' | 'generate' | 'labs' | 'about'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'ai', label: 'AI 服务' },
  { id: 'layout', label: '版式' },
  { id: 'generate', label: '生成' },
  { id: 'labs', label: '实验性' },
  { id: 'about', label: '关于' }
]

/** 预设主题色（品牌色块；支持自定义 hex） */
const ACCENT_SWATCHES = ['#0f6cbd', '#c50f1f', '#0e700e', '#6b3fa0', '#8a6142', '#1b1b1b']

const useStyles = makeStyles({
  body: {
    display: 'flex',
    gap: '16px',
    minHeight: '380px'
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '120px',
    flexShrink: 0,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2
  },
  navItem: {
    textAlign: 'left',
    justifyContent: 'flex-start',
    padding: '6px 10px',
    borderRadius: tokens.borderRadiusMedium
  },
  navItemActive: {
    backgroundColor: tokens.colorNeutralBackground3Selected,
    fontWeight: tokens.fontWeightSemibold
  },
  panel: {
    flex: 1,
    minWidth: 0,
    maxHeight: '60vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    paddingRight: '4px'
  },
  apiKeyInput: { width: '100%' },
  hint: { marginTop: '4px', fontSize: '12px' },
  swatchRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    marginTop: '4px'
  },
  swatch: {
    width: '24px',
    height: '24px',
    borderRadius: tokens.borderRadiusCircular,
    cursor: 'pointer',
    border: `2px solid ${tokens.colorNeutralStroke1}`
  },
  swatchActive: {
    outline: `2px solid ${tokens.colorBrandStroke1}`,
    outlineOffset: '1px'
  },
  sourceItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '6px'
  },
  sourceRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center'
  },
  sourceInput: { flex: 1, minWidth: 0 },
  sourceList: {
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '8px',
    marginTop: '4px'
  },
  dutyArea: {
    minHeight: '52px',
    width: '100%',
    fontFamily: 'inherit'
  }
})

interface SettingsDialogProps {
  open: boolean
  settings: AiSettings | null
  onClose: () => void
  /** 保存成功后回传最新配置 */
  onSaved?: (settings: AiSettings) => void
}

/** 设置弹窗：分区导航（AI 服务 / 版式 / 生成 / 实验性 / 关于） */
function SettingsDialog({ open, settings, onClose, onSaved }: SettingsDialogProps): React.JSX.Element | null {
  const styles = useStyles()
  const [tab, setTab] = useState<SettingsTab>('ai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [sources, setSources] = useState<InfoSource[]>([])
  const [layout, setLayout] = useState<LayoutPrefs>({})
  const [stylePrompt, setStylePrompt] = useState('')
  const [roleDuties, setRoleDuties] = useState<Partial<Record<string, string>>>({})
  /** 自定义角色库（用户反馈：支持添加新角色） */
  const [customRoleList, setCustomRoleList] = useState<{ name: string; duty: string }[]>([])
  const [editorialEnabled, setEditorialEnabled] = useState(false)
  const [reviewModel, setReviewModel] = useState('')
  /** 职责编辑器展开的角色 */
  const [dutyOpenItems, setDutyOpenItems] = useState<string[]>([])

  // 每次打开时同步当前已保存的配置
  useEffect(() => {
    if (open && settings) {
      setApiKey(settings.apiKey)
      setBaseUrl(settings.baseUrl)
      setModel(settings.model)
      setTavilyKey(settings.tavilyKey ?? '')
      setSources(settings.sources ?? [])
      setLayout(settings.layout ?? {})
      setStylePrompt(settings.stylePrompt ?? '')
      setRoleDuties(settings.roleDuties ?? {})
      setCustomRoleList(settings.customRoles ?? [])
      setEditorialEnabled(settings.editorial?.enabled === true)
      setReviewModel(settings.editorial?.reviewModel ?? '')
    }
  }, [open, settings])

  if (!open) return null

  const save = async (): Promise<void> => {
    const updated: AiSettings = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      theme: settings?.theme ?? 'light',
      tavilyKey: tavilyKey.trim(),
      // 网页源需 name+url；文件源需 name+path（url 为空不算缺失）
      sources: sources.filter((s) => s.name.trim() && (s.kind === 'file' ? !!s.path : !!s.url.trim())),
      layout,
      stylePrompt: stylePrompt.trim() || undefined,
      roleDuties: Object.keys(roleDuties).length > 0 ? roleDuties : undefined,
      customRoles: customRoleList.filter((c) => c.name.trim() && c.duty.trim()),
      editorial: {
        enabled: editorialEnabled,
        reviewModel: reviewModel.trim() || undefined
      }
    }
    try {
      if (window.briefy) {
        await window.briefy.saveSettings(updated)
        onSaved?.(updated)
      }
      onClose()
    } catch (err) {
      // IPC 失败也要保证弹窗可关闭，并暴露错误信息
      console.error('保存设置失败', err)
      onClose()
    }
  }

  /** 数值字段：空 = 恢复默认（undefined） */
  const numField = (key: keyof LayoutPrefs, value: string): void => {
    const n = Number(value)
    setLayout({ ...layout, [key]: value.trim() === '' || Number.isNaN(n) ? undefined : n })
  }

  const renderTab = (): React.JSX.Element => {
    switch (tab) {
      case 'layout':
        return (
          <>
            <Field label="页边距（mm，10–25，默认 15）">
              <Input
                type="number"
                value={layout.marginMM?.toString() ?? ''}
                placeholder="15"
                onChange={(_, d) => numField('marginMM', d.value)}
              />
            </Field>
            <Field label="栏间距（mm，4–12，默认 8）">
              <Input
                type="number"
                value={layout.gapMM?.toString() ?? ''}
                placeholder="8"
                onChange={(_, d) => numField('gapMM', d.value)}
              />
            </Field>
            <Field label="正文字体（CSS font-family，默认跟随主题）">
              <Input
                placeholder='例："Microsoft YaHei", sans-serif'
                value={layout.fontFamily ?? ''}
                onChange={(_, d) => setLayout({ ...layout, fontFamily: d.value.trim() || undefined })}
              />
            </Field>
            <Field label="正文字号（pt，8–14，默认 10）">
              <Input
                type="number"
                value={layout.fontSizePt?.toString() ?? ''}
                placeholder="10"
                onChange={(_, d) => numField('fontSizePt', d.value)}
              />
            </Field>
            <Field label="行距（1.2–2.0，默认 1.5）">
              <Input
                type="number"
                step="0.1"
                value={layout.lineHeight?.toString() ?? ''}
                placeholder="1.5"
                onChange={(_, d) => numField('lineHeight', d.value)}
              />
            </Field>
            <Field label="主题色（界面品牌色；黑白优先开启时打印为灰阶）">
              <div className={styles.swatchRow}>
                {ACCENT_SWATCHES.map((c) => (
                  <span
                    key={c}
                    role="button"
                    tabIndex={0}
                    className={`${styles.swatch} ${layout.accentColor === c ? styles.swatchActive : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setLayout({ ...layout, accentColor: c })}
                    onKeyDown={(e) => e.key === 'Enter' && setLayout({ ...layout, accentColor: c })}
                  />
                ))}
                <Input
                  size="small"
                  style={{ width: '110px' }}
                  placeholder="#0f6cbd"
                  value={layout.accentColor ?? ''}
                  onChange={(_, d) => setLayout({ ...layout, accentColor: /^#[0-9a-fA-F]{3,8}$/.test(d.value) ? d.value : undefined })}
                />
              </div>
            </Field>
            <Field label="正文分栏（body 槽位文字多栏流式，1–3 栏，默认 1 = 单栏）">
              <Input
                type="number"
                value={layout.columns?.toString() ?? ''}
                placeholder="1"
                onChange={(_, d) => numField('columns', d.value)}
              />
            </Field>
            <Checkbox
              label="黑白优先（灰阶渲染，兼容黑白打印机；导出 PDF 同样灰阶）"
              checked={layout.grayscale === true}
              onChange={(_, d) => setLayout({ ...layout, grayscale: d.checked === true })}
            />
            <Field label="页眉页脚（绘制在页边距区，不占内容空间）">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Checkbox
                  label="报头（页眉居左，可自定义文字）"
                  checked={layout.header?.title === true}
                  onChange={(_, d) =>
                    setLayout({ ...layout, header: { ...layout.header, title: d.checked === true } })
                  }
                />
                {layout.header?.title === true && (
                  <Input
                    size="small"
                    placeholder="报头文字（留空 = 用文档标题）"
                    value={layout.header.text ?? ''}
                    onChange={(_, d) =>
                      setLayout({ ...layout, header: { ...layout.header, text: d.value } })
                    }
                  />
                )}
                <Checkbox
                  label="日期（页眉居右）"
                  checked={layout.header?.date === true}
                  onChange={(_, d) =>
                    setLayout({ ...layout, header: { ...layout.header, date: d.checked === true } })
                  }
                />
                <Checkbox
                  label="页码（页脚居中：第 X 页 · 共 N 页）"
                  checked={layout.header?.pageNo === true}
                  onChange={(_, d) =>
                    setLayout({ ...layout, header: { ...layout.header, pageNo: d.checked === true } })
                  }
                />
              </div>
            </Field>
            <p className={styles.hint}>版式修改立即影响流式排布与自动分页；留空的项使用默认值。</p>
          </>
        )
      case 'generate':
        return (
          <>
            <Field label="全局风格提示词（本报调性，注入每次生成）">
              <Textarea
                placeholder="例：面向 Linux 爱好者的晚报，语气克制专业，偶尔冷幽默；技术名词首次出现给一句话解释"
                value={stylePrompt}
                onChange={(_, d) => setStylePrompt(d.value)}
              />
            </Field>
            <Field label="编辑部模式（ROADMAP Q2）">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Checkbox
                  label="启用编辑部三段式（选题 → 写作 → 审稿）：生成前先为每个槽位分配互不重复的选题，完成后主编审稿；默认关闭 = 逐槽独立生成"
                  checked={editorialEnabled}
                  onChange={(_, d) => setEditorialEnabled(d.checked === true)}
                />
                <Input
                  size="small"
                  placeholder="选题/审稿模型（留空 = 用上方主模型，如 deepseek-reasoner）"
                  value={reviewModel}
                  onChange={(_, d) => setReviewModel(d.value)}
                />
                <p className={styles.hint}>
                  每期额外增加 2 次 AI 调用；审稿意见生成后由你决定是否按指令重写；生成前的版本自动存为快照可还原。
                </p>
              </div>
            </Field>
            <Field label={`角色职责自定义（${Object.keys(roleDuties).length} 个已自定义，可同时生效；留空 = 使用默认职责）`}>
              <Accordion
                openItems={dutyOpenItems}
                onToggle={(_, d) => setDutyOpenItems(d.openItems as string[])}
                multiple
                collapsible
              >
                {(Object.keys(ROLE_DEFS) as SlotRole[]).map((role) => {
                  const customized = Boolean(roleDuties[role]?.trim())
                  return (
                    <AccordionItem key={role} value={role}>
                      <AccordionHeader>
                        <span>
                          {ROLE_DEFS[role].name}
                          {customized && (
                            <span style={{ marginLeft: '6px', color: tokens.colorBrandForeground1, fontSize: tokens.fontSizeBase200 }}>
                              （已自定义）
                            </span>
                          )}
                        </span>
                      </AccordionHeader>
                      <AccordionPanel>
                        <Textarea
                          className={styles.dutyArea}
                          placeholder={ROLE_DEFS[role].duty || '（无默认）'}
                          value={roleDuties[role] ?? ''}
                          onChange={(_, d) => {
                            const next = { ...roleDuties }
                            if (d.value.trim()) next[role] = d.value
                            else delete next[role]
                            setRoleDuties(next)
                          }}
                        />
                      </AccordionPanel>
                    </AccordionItem>
                  )
                })}
              </Accordion>
              <p className={styles.hint}>点击角色名展开编辑；每个角色的自定义职责互相独立、可同时生效。</p>
            </Field>
            <Field label={`自定义角色库（${customRoleList.length} 个）—— 新建你自己的角色，槽位选"自定义"时按名引用，AI 按其职责写作`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {customRoleList.map((cr, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Input
                        size="small"
                        style={{ width: '140px' }}
                        placeholder="角色名（如：情感专栏）"
                        value={cr.name}
                        onChange={(_, d) =>
                          setCustomRoleList(customRoleList.map((c, j) => (j === i ? { ...c, name: d.value } : c)))
                        }
                      />
                      <Button
                        icon={<DeleteRegular />}
                        size="small"
                        appearance="subtle"
                        onClick={() => setCustomRoleList(customRoleList.filter((_, j) => j !== i))}
                      />
                    </div>
                    <Textarea
                      className={styles.dutyArea}
                      placeholder="职责描述：这个角色写什么、怎么写（喂给 AI）"
                      value={cr.duty}
                      onChange={(_, d) =>
                        setCustomRoleList(customRoleList.map((c, j) => (j === i ? { ...c, duty: d.value } : c)))
                      }
                    />
                  </div>
                ))}
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => setCustomRoleList([...customRoleList, { name: '', duty: '' }])}
                >
                  + 添加自定义角色
                </Button>
              </div>
            </Field>
          </>
        )
      case 'labs':
        return (
          <p className={styles.hint}>
            实验性功能在这里灰度开放；验证稳定后会转正到对应分区并移除开关。当前暂无实验项。
          </p>
        )
      case 'about':
        return (
          <div>
            <p style={{ fontWeight: tokens.fontWeightSemibold, margin: '0 0 8px' }}>Briefy</p>
            <p className={styles.hint}>
              赋予用户自主制作个性化报纸的能力。Electron + React + AI，MIT 开源。
              <br />
              配置仅保存在本机（%APPDATA%/briefy）。
            </p>
          </div>
        )
      case 'ai':
      default:
        return (
          <>
            <Field label="API Key">
              <Input
                className={styles.apiKeyInput}
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(_, data) => setApiKey(data.value)}
              />
            </Field>
            <Field label="Base URL">
              <Input
                className={styles.apiKeyInput}
                placeholder="https://api.openai.com/v1（或任意 OpenAI 兼容地址）"
                value={baseUrl}
                onChange={(_, data) => setBaseUrl(data.value)}
              />
            </Field>
            <Field label="模型名">
              <Input
                className={styles.apiKeyInput}
                placeholder="gpt-4o-mini、deepseek-chat 等"
                value={model}
                onChange={(_, data) => setModel(data.value)}
              />
            </Field>
            <Field label="Tavily 搜索 Key（可选）">
              <Input
                className={styles.apiKeyInput}
                type="password"
                placeholder="用于联网搜索工具，tavily.com 免费申请"
                value={tavilyKey}
                onChange={(_, data) => setTavilyKey(data.value)}
              />
            </Field>
            <Field label={`常用信息源（${sources.length}）—— 收藏夹；在槽位属性面板中导入到具体槽位。网页源自动抓取；文件源由 AI 经 readSource 工具按需读取（每文件限 3 次）`}>
              <div className={styles.sourceList}>
                {sources.map((src, i) => (
                  <div key={src.id} className={styles.sourceItem}>
                    <div className={styles.sourceRow}>
                      {src.kind === 'file' ? (
                        <>
                          <Input
                            className={styles.sourceInput}
                            size="small"
                            value={src.name}
                            onChange={(_, d) =>
                              setSources(sources.map((s, j) => (j === i ? { ...s, name: d.value } : s)))
                            }
                          />
                          <Input
                            className={styles.sourceInput}
                            size="small"
                            value={src.path ?? ''}
                            readOnly
                          />
                        </>
                      ) : (
                        <>
                          <Input
                            className={styles.sourceInput}
                            size="small"
                            placeholder="名称（如：C++ 安全周报）"
                            value={src.name}
                            onChange={(_, d) =>
                              setSources(sources.map((s, j) => (j === i ? { ...s, name: d.value } : s)))
                            }
                          />
                          <Input
                            className={styles.sourceInput}
                            size="small"
                            placeholder="https://网址"
                            value={src.url}
                            onChange={(_, d) =>
                              setSources(sources.map((s, j) => (j === i ? { ...s, url: d.value } : s)))
                            }
                          />
                        </>
                      )}
                      <Button
                        icon={<DeleteRegular />}
                        size="small"
                        appearance="subtle"
                        onClick={() => setSources(sources.filter((_, j) => j !== i))}
                      />
                    </div>
                    <Input
                      className={styles.sourceInput}
                      size="small"
                      placeholder="给 AI 的说明（可选）"
                      value={src.note}
                      onChange={(_, d) =>
                        setSources(sources.map((s, j) => (j === i ? { ...s, note: d.value } : s)))
                      }
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={() =>
                      setSources([
                        ...sources,
                        { id: crypto.randomUUID(), name: '', url: '', note: '' }
                      ])
                    }
                  >
                    + 添加信息源
                  </Button>
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={async () => {
                      const picked = await window.briefy?.pickSourceFile?.()
                      if (!picked) return
                      setSources([
                        ...sources,
                        { id: crypto.randomUUID(), name: picked.name, url: '', note: '', kind: 'file', path: picked.path }
                      ])
                    }}
                  >
                    + 添加文件源
                  </Button>
                </div>
              </div>
            </Field>
          </>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>设置</DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              <div className={styles.nav}>
                {TABS.map((t) => (
                  <Button
                    key={t.id}
                    appearance="subtle"
                    className={`${styles.navItem} ${tab === t.id ? styles.navItemActive : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
              <div className={styles.panel}>{renderTab()}</div>
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">取消</Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={() => void save()}>
              保存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default SettingsDialog