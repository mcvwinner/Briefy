import type * as React from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Button,
  Checkbox,
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
import { ROLE_DEFS } from '../../../shared/layout'
import type { InfoSource } from '../../../shared/settings'
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

      <Field label="槽位角色（决定 AI 的职责）" className={styles.fieldGap}>
        <Dropdown
          value={ROLE_DEFS[slot.role].name}
          selectedOptions={[slot.role]}
          onOptionSelect={(_, data) => onChange({ role: data.optionValue as SlotRole })}
        >
          {Object.entries(ROLE_DEFS).map(([value, def]) => (
            <Option key={value} value={value} text={def.name}>
              {def.name}
            </Option>
          ))}
        </Dropdown>
      </Field>

      <Field label="提示词（这一格要什么）" className={styles.fieldGap}>
        <Textarea
          className={styles.promptArea}
          placeholder="例：总结今日头条科技新闻，200 字以内"
          value={slot.prompt}
          onChange={(_, data) => onChange({ prompt: data.value })}
        />
      </Field>

      <Field label="宽度（版式自动重排）" className={styles.fieldGap}>
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

      <Field label="AI 可用工具" className={styles.fieldGap}>
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

  // 常用源是否已被本槽位挂载（按 name+url 匹配，内联副本/自建源同源判同）
  const isMounted = (src: InfoSource): boolean =>
    slotSources.some((s) => s.name === src.name && s.url === src.url)

  const toggleCommon = (src: InfoSource, checked: boolean): void => {
    if (checked) {
      setSources([...slotSources, { ...src }])
    } else {
      setSources(slotSources.filter((s) => !(s.name === src.name && s.url === src.url)))
    }
  }

  const collectible = slotSources.filter((s) => !commonSources.some((c) => c.name === s.name && c.url === s.url))

  return (
    <Field label={`本槽位信息源（${slotSources.length}）—— 生成时抓取内容作事实依据`} className={styles.fieldGap}>
      {slotSources.map((src, i) => (
        <div key={src.id} className={styles.sourceRow}>
          <div className={styles.sourceInfo}>
            <div className={styles.sourceName}>{src.name}</div>
            <div className={styles.sourceUrl}>{src.url}</div>
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
    <Field label={`控件实例（${instances.length}）`} className={styles.fieldGap}>
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
