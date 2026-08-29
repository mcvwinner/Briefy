import type * as React from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Button,
  Checkbox,
  Combobox,
  Dropdown,
  Field,
  Input,
  Option,
  Textarea,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { DeleteRegular, WandRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import type { Slot, SlotKind, SlotRole, ToolId } from '../../../shared/layout'
import { ROLE_DEFS, resolveRoleName } from '../../../shared/layout'
import type { CustomRole, InfoSource } from '../../../shared/settings'
import { OptionGroup } from '@fluentui/react-components'
import { listWidgetInstances, updateWidgetInstance } from '../utils/widget-edit'
import { WIDGET_REGISTRY } from '../../../shared/widgets'

/** 工具勾选选项（与主进程 ai.ts 的 buildTools 一一对应） */
const TOOL_OPTIONS: { id: ToolId; label: string; hint?: string }[] = [
  { id: 'getCurrentTime', label: '当前时间' },
  { id: 'webSearch', label: '联网搜索', hint: '需配置 Tavily Key' },
  { id: 'fetchPage', label: '网页抓取' }
]

/** 内容形式选项 */
const KIND_OPTIONS: { text: string; value: SlotKind }[] = [
  { text: '纯文字', value: 'text' },
  { text: '表格', value: 'table' }
]

/** 宽度模式选项 */
const WIDTH_OPTIONS: { text: string; value: 'full' | 'half-left' | 'half-right' | 'sidebar' }[] = [
  { text: '全宽', value: 'full' },
  { text: '左半栏', value: 'half-left' },
  { text: '右半栏', value: 'half-right' },
  { text: '右侧栏', value: 'sidebar' }
]

const useStyles = makeStyles({
  panel: {
    width: '280px',
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
    flexShrink: 0,
    // 关键：面板自身可滚动（控件手风琴展开超高时不再撑破工作区）
    alignSelf: 'stretch',
    minHeight: 0,
    overflowY: 'auto'
  },
  title: {
    margin: '0 0 12px',
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1
  },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  fieldGap: { marginBottom: '4px' },
  promptArea: { minHeight: '120px' },
  widgetInsertRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px'
  },
  widgetInsertBtn: {
    fontSize: tokens.fontSizeBase200,
    padding: '2px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3Hover,
      color: tokens.colorBrandForeground1
    }
  },
  deleteBtn: {
    marginTop: '12px',
    color: tokens.colorPaletteRedForeground1
  },
  sourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '4px'
  },
  sourceInfo: {
    flex: 1,
    minWidth: 0
  },
  sourceName: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  sourceUrl: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  sourceAddRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px'
  },
  commonBox: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  }
})

interface PropertiesPanelProps {
  slot: Slot | null
  /** 常用信息源库（设置页维护），供槽位快速导入 */
  commonSources: InfoSource[]
  /** 把槽位上的源收藏进常用库（自动去重持久化） */
  onAddCommonSources: (srcs: InfoSource[]) => void
  /** 自定义角色库（custom 角色时的角色名建议） */
  customRoles: CustomRole[]
  /** 仅生成此槽位 */
  onGenerateSlot?: (slot: Slot) => void
  onChange: (patch: Partial<Slot>) => void
  onSetWidth: (widthMode: 'full' | 'half-left' | 'half-right' | 'sidebar') => void
  onRemove: () => void
}

/** 右侧属性面板：编辑选中槽位的角色、提示词、宽度、形式、工具、信息源 */
function PropertiesPanel({
  slot,
  commonSources,
  customRoles,
  onAddCommonSources,
  onGenerateSlot,
  onChange,
  onSetWidth,
  onRemove
}: PropertiesPanelProps): React.JSX.Element {
  const styles = useStyles()
  const [newSource, setNewSource] = useState<InfoSource>({ id: '', name: '', url: '', note: '' })

  if (!slot) {
    return (
      <aside className={styles.panel}>
        <h2 className={styles.title}>属性</h2>
        <p className={styles.hint}>选中槽位后在此编辑提示词与工具</p>
      </aside>
    )
  }

  // 从当前宽度反推宽度模式（用于显示）
  const widthMode =
    slot.region.width > 150
      ? 'full'
      : slot.region.width > 80
        ? slot.region.x < 60
          ? 'half-left'
          : 'half-right'
        : 'sidebar'

  return (
    <aside className={styles.panel}>
      <h2 className={styles.title}>槽位属性</h2>

      <Field
        label="槽位角色（决定 AI 的职责）"
        hint={{ children: '内置角色有固定职责与推荐控件；自定义角色在 设置 → 生成 中维护职责' } as never}
        className={styles.fieldGap}
      >
        <Dropdown
          value={resolveRoleName(slot, customRoles)}
          selectedOptions={[slot.role === 'custom' ? `custom:${slot.customRoleName ?? ''}` : slot.role]}
          onOptionSelect={(_, data) => {
            const v = (data.optionValue as string) ?? ''
            // 自定义角色：value 前缀 custom:，映射为 role=custom + customRoleName
            if (v.startsWith('custom:')) {
              onChange({ role: 'custom', customRoleName: v.slice(7) || undefined })
            } else if (v) {
              onChange({ role: v as SlotRole, customRoleName: undefined })
            }
          }}
        >
          <OptionGroup label="内置角色">
            {Object.entries(ROLE_DEFS).map(([value, def]) => (
              <Option key={value} value={value} text={def.name}>
                {def.name}
              </Option>
            ))}
          </OptionGroup>
          <OptionGroup label="自定义角色（设置 → 生成 → 自定义角色库）">
            {customRoles.length > 0 ? (
              customRoles.map((c) => (
                <Option key={c.name} value={`custom:${c.name}`} text={c.name}>
                  {c.name}
                </Option>
              ))
            ) : (
              <Option value="custom:" text="（角色库为空，去设置 → 生成 新建）">
                （角色库为空，去设置 → 生成 新建）
              </Option>
            )}
          </OptionGroup>
        </Dropdown>
      </Field>

      {slot.role === 'custom' && (
        <Field
          label="自定义角色名（从角色库选或直接输入）"
          className={styles.fieldGap}
        >
          <Combobox
            value={slot.customRoleName ?? ''}
            placeholder={customRoles.length > 0 ? '从角色库选择或输入新名' : '输入角色名（可在设置中建角色库）'}
            freeform
            selectedOptions={slot.customRoleName ? [slot.customRoleName] : []}
            onOptionSelect={(_, data) => onChange({ customRoleName: (data.optionValue as string) || undefined })}
            onChange={(e) => onChange({ customRoleName: e.target.value.trim() || undefined })}
          >
            {customRoles.map((c) => (
              <Option key={c.name} value={c.name} text={c.name}>
                {c.name}
              </Option>
            ))}
          </Combobox>
        </Field>
      )}

      <Field
        label="提示词（这一格要什么；下方按钮可快速插入控件模板）"
        hint={{ children: '写得越具体越好：主题、角度、字数、风格；留空则生成时跳过此槽' } as never}
        className={styles.fieldGap}
      >
        <Textarea
          className={styles.promptArea}
          placeholder="例：总结今日头条科技新闻，200 字以内"
          value={slot.prompt}
          onChange={(_, data) => onChange({ prompt: data.value })}
        />
        {/* 控件快速插入（ROADMAP Q3 控件使用引导）：点一下插入模板行，用户无需记语法 */}
        <div className={styles.widgetInsertRow}>
          {Object.values(WIDGET_REGISTRY).map((w) => {
            const template = `:::${w.id}{${Object.entries(w.params)
              .map(([k, v]) => `${k}:"<${v.desc}>"`)
              .join(', ')}}`
            return (
              <button
                key={w.id}
                className={styles.widgetInsertBtn}
                title={`插入 ${w.name} 模板：${template}`}
                onClick={() => {
                  const base = slot.prompt.trimEnd()
                  onChange({ prompt: base ? `${base}\n${template}` : template })
                }}
              >
                {w.name}
              </button>
            )
          })}
        </div>
      </Field>

      <Field
        label="宽度（版式自动重排）"
        hint={{ children: '全宽 = 独占一行；半栏 = 左右并排；侧栏 = 窄条侧边' } as never}
        className={styles.fieldGap}
      >
        <Dropdown
          value={WIDTH_OPTIONS.find((w) => w.value === widthMode)?.text ?? '全宽'}
          selectedOptions={[widthMode]}
          onOptionSelect={(_, data) => onSetWidth(data.optionValue as 'full' | 'half-left' | 'half-right' | 'sidebar')}
        >
          {WIDTH_OPTIONS.map((w) => (
            <Option key={w.value} value={w.value}>
              {w.text}
            </Option>
          ))}
        </Dropdown>
      </Field>

      <Field label="内容形式" className={styles.fieldGap}>
        <Dropdown
          value={KIND_OPTIONS.find((k) => k.value === slot.kind)?.text ?? '纯文字'}
          selectedOptions={[slot.kind]}
          onOptionSelect={(_, data) => onChange({ kind: data.optionValue as SlotKind })}
        >
          {KIND_OPTIONS.map((k) => (
            <Option key={k.value} value={k.value}>
              {k.text}
            </Option>
          ))}
        </Dropdown>
      </Field>

      <Field
        label="AI 可用工具"
        hint={{ children: '勾选后 AI 生成时可主动调用：获取时间（时效内容必选）/ 联网搜索 / 抓网页' } as never}
        className={styles.fieldGap}
      >
        {TOOL_OPTIONS.map(({ id, label, hint }) => (
          <Checkbox
            key={id}
            label={hint ? `${label}（${hint}）` : label}
            checked={(slot.tools ?? []).includes(id)}
            onChange={(_, data) => {
              const current = slot.tools ?? []
              const next = data.checked ? [...current, id] : current.filter((t) => t !== id)
              onChange({ tools: next })
            }}
          />
        ))}
      </Field>

      <WidgetEditor slot={slot} onChange={onChange} />

      {onGenerateSlot && slot.prompt.trim() && (
        <Button
          appearance="primary"
          icon={<WandRegular />}
          onClick={() => onGenerateSlot(slot)}
          style={{ marginTop: '8px' }}
        >
          生成此槽位
        </Button>
      )}

      <SlotSourcesEditor
        slot={slot}
        commonSources={commonSources}
        onAddCommonSources={onAddCommonSources}
        onChange={onChange}
        newSource={newSource}
        setNewSource={setNewSource}
      />

      <Button
        className={styles.deleteBtn}
        icon={<DeleteRegular />}
        appearance="subtle"
        onClick={onRemove}
      >
        删除此槽位（Delete）
      </Button>
    </aside>
  )
}

/** 槽位内联信息源编辑：源是槽位属性（随文档/预设保存）；常用源库可导入/收藏 */
function SlotSourcesEditor({
  slot,
  commonSources,
  onAddCommonSources,
  onChange,
  newSource,
  setNewSource
}: {
  slot: Slot
  commonSources: InfoSource[]
  onAddCommonSources: (srcs: InfoSource[]) => void
  onChange: (patch: Partial<Slot>) => void
  newSource: InfoSource
  setNewSource: (s: InfoSource) => void
}): React.JSX.Element {
  const styles = useStyles()
  const slotSources = slot.sources ?? []

  const setSources = (next: InfoSource[]): void => onChange({ sources: next })

  const addInline = (): void => {
    if (!newSource.name.trim() || !newSource.url.trim()) return
    setSources([...slotSources, { ...newSource, id: crypto.randomUUID(), name: newSource.name.trim(), url: newSource.url.trim() }])
    setNewSource({ id: '', name: '', url: '', note: '' })
  }

  /** 添加本地文件参考源（系统对话框选文件；生成时 AI 经 readSource 工具按需读取） */
  const addFileSource = async (): Promise<void> => {
    const picked = await window.briefy?.pickSourceFile?.()
    if (!picked) return
    setSources([
      ...slotSources,
      { id: crypto.randomUUID(), name: picked.name, url: '', note: '', kind: 'file', path: picked.path }
    ])
  }

  // 常用源是否已被本槽位挂载（同源判定：网页按 name+url，文件按 name+path）
  const sameSource = (a: InfoSource, b: InfoSource): boolean =>
    a.name === b.name && (a.kind === 'file' || b.kind === 'file' ? a.path === b.path : a.url === b.url)
  const isMounted = (src: InfoSource): boolean => slotSources.some((s) => sameSource(s, src))

  const toggleCommon = (src: InfoSource, checked: boolean): void => {
    if (checked) {
      setSources([...slotSources, { ...src }])
    } else {
      setSources(slotSources.filter((s) => !sameSource(s, src)))
    }
  }

  const collectible = slotSources.filter((s) => !commonSources.some((c) => sameSource(c, s)))

  return (
    <Field label={`本槽位信息源（${slotSources.length}）—— 网页源自动抓取；文件源由 AI 按需读取`} className={styles.fieldGap}>
      {slotSources.map((src, i) => (
        <div key={src.id} className={styles.sourceRow}>
          <div className={styles.sourceInfo}>
            <div className={styles.sourceName}>{src.kind === 'file' ? '📄 ' : ''}{src.name}</div>
            <div className={styles.sourceUrl}>{src.kind === 'file' ? src.path : src.url}</div>
          </div>
          <Button
            icon={<DeleteRegular />}
            appearance="subtle"
            size="small"
            aria-label={`移除源 ${src.name}`}
            onClick={() => setSources(slotSources.filter((_, j) => j !== i))}
          />
        </div>
      ))}

      {/* 内联添加新源 */}
      <div className={styles.sourceAddRow}>
        <Input
          size="small"
          placeholder="名称，如 GitHub Trending"
          value={newSource.name}
          onChange={(_, d) => setNewSource({ ...newSource, name: d.value })}
        />
        <Input
          size="small"
          placeholder="网址 https://…"
          value={newSource.url}
          onChange={(_, d) => setNewSource({ ...newSource, url: d.value })}
        />
        <Input
          size="small"
          placeholder="备注：这个源关注什么（可空）"
          value={newSource.note}
          onChange={(_, d) => setNewSource({ ...newSource, note: d.value })}
        />
        <Button size="small" appearance="primary" disabled={!newSource.name.trim() || !newSource.url.trim()} onClick={addInline}>
          添加源
        </Button>
        <Button size="small" onClick={() => void addFileSource()}>
          添加文件源
        </Button>
      </div>

      {/* 常用源库：勾选即导入内联副本 */}
      {commonSources.length > 0 && (
        <div className={styles.commonBox}>
          <div className={styles.hint}>常用信息源（勾选导入本槽位）</div>
          {commonSources.map((src) => (
            <Checkbox
              key={src.id}
              label={src.name}
              checked={isMounted(src)}
              onChange={(_, d) => toggleCommon(src, d.checked === true)}
            />
          ))}
        </div>
      )}

      {/* 把槽位上的新源收藏进常用库 */}
      {collectible.length > 0 && (
        <Button
          size="small"
          appearance="subtle"
          onClick={() => onAddCommonSources(collectible)}
        >
          把本槽位 {collectible.length} 个新源存为常用
        </Button>
      )}
    </Field>
  )
}

/** 控件实例编辑区：列出内容中的控件，展开即表单化改参（用户参与的核心入口） */
function WidgetEditor({
  slot,
  onChange
}: {
  slot: Slot
  onChange: (patch: Partial<Slot>) => void
}): React.JSX.Element | null {
  const styles = useStyles()
  const [openLine, setOpenLine] = useState<number[]>([])
  const content = slot.content ?? ''
  const instances = listWidgetInstances(content)
  if (instances.length === 0) return null

  const updateParam = (lineIndex: number, params: Record<string, string>): void => {
    onChange({ content: updateWidgetInstance(content, lineIndex, params) })
  }

  return (
      <Field
        label={`控件实例（${instances.length}）`}
        hint={{ children: 'AI 输出中检测到的可视化控件，展开即可表单化修改参数' } as never}
        className={styles.fieldGap}
      >
      <Accordion openItems={openLine} onToggle={(_, d) => setOpenLine(d.openItems as number[])}>
        {instances.map(({ lineIndex, id, params }) => {
          const def = WIDGET_REGISTRY[id]
          return (
            <AccordionItem key={lineIndex} value={lineIndex}>
              <AccordionHeader>
                {def?.name ?? id} · {String(params[Object.keys(params)[0] ?? ''] ?? '').slice(0, 12)}
              </AccordionHeader>
              <AccordionPanel>
                {Object.entries(def?.params ?? {}).map(([key, meta]) => (
                  <Field key={key} label={`${key}（${meta.desc}）`} size="small">
                    <Input
                      size="small"
                      value={params[key] ?? ''}
                      placeholder={meta.example}
                      onChange={(_, d) => updateParam(lineIndex, { ...params, [key]: d.value })}
                    />
                  </Field>
                ))}
              </AccordionPanel>
            </AccordionItem>
          )
        })}
      </Accordion>
    </Field>
  )
}

export default PropertiesPanel
