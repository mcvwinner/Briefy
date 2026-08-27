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
  SpinButton,
  Textarea,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { DeleteRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import type { Block, BlockKind, ToolId } from '../../../shared/layout'
import { listWidgetInstances, updateWidgetInstance } from '../utils/widget-edit'
import { WIDGET_REGISTRY } from '../../../shared/widgets'

/** 工具勾选选项（与主进程 ai.ts 的 buildTools 一一对应） */
const TOOL_OPTIONS: { id: ToolId; label: string; hint?: string }[] = [
  { id: 'getCurrentTime', label: '当前时间' },
  { id: 'webSearch', label: '联网搜索', hint: '需在设置中配置 Tavily Key' },
  { id: 'fetchPage', label: '网页抓取' }
]

/** 内窑形式选项（image/text-image 已移除：无生图服务，占位无意义） */
const KIND_OPTIONS: { text: string; value: BlockKind }[] = [
  { text: '纯文字', value: 'text' },
  { text: '表格', value: 'table' }
]

const useStyles = makeStyles({
  panel: {
    width: '280px',
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0
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
  sizeRow: { display: 'flex', gap: '8px' },
  deleteBtn: {
    marginTop: '12px',
    color: tokens.colorPaletteRedForeground1
  }
})

interface PropertiesPanelProps {
  block: Block | null
  onChange: (patch: Partial<Block>) => void
  onRemove: () => void
}

/** 右侧属性面板：编辑选中区块的提示词、形式、尺寸 */
function PropertiesPanel({ block, onChange, onRemove }: PropertiesPanelProps): JSX.Element {
  const styles = useStyles()

  if (!block) {
    return (
      <aside className={styles.panel}>
        <h2 className={styles.title}>属性</h2>
        <p className={styles.hint}>选中内容块后在此编辑提示词与样式</p>
      </aside>
    )
  }

  return (
    <aside className={styles.panel}>
      <h2 className={styles.title}>区块属性</h2>

      <Field label="提示词（想让 AI 填什么）" className={styles.fieldGap}>
        <Textarea
          className={styles.promptArea}
          placeholder="例：总结今日头条科技新闻，200 字以内"
          value={block.prompt}
          onChange={(_, data) => onChange({ prompt: data.value })}
        />
      </Field>

      <Field label="内容形式" className={styles.fieldGap}>
        <Dropdown
          value={KIND_OPTIONS.find((k) => k.value === block.kind)?.text ?? '纯文字'}
          selectedOptions={[block.kind]}
          onOptionSelect={(_, data) => onChange({ kind: data.optionValue as BlockKind })}
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
            checked={(block.tools ?? []).includes(id)}
            onChange={(_, data) => {
              const current = block.tools ?? []
              const next = data.checked ? [...current, id] : current.filter((t) => t !== id)
              onChange({ tools: next })
            }}
          />
        ))}
      </Field>

      <WidgetEditor block={block} onChange={onChange} />

      <Field label="尺寸（mm）" className={styles.fieldGap}>
        <div className={styles.sizeRow}>
          <SpinButton
            value={Math.round(block.width)}
            min={15}
            max={210}
            step={1}
            contentAfter="宽"
            onChange={(_, data) => {
              if (data.value !== undefined) onChange({ width: Number(data.value) })
            }}
          />
          <SpinButton
            value={Math.round(block.height)}
            min={15}
            max={297}
            step={1}
            contentAfter="高"
            onChange={(_, data) => {
              if (data.value !== undefined) onChange({ height: Number(data.value) })
            }}
          />
        </div>
      </Field>

      <Button
        className={styles.deleteBtn}
        icon={<DeleteRegular />}
        appearance="subtle"
        onClick={onRemove}
      >
        删除此区块（Delete）
      </Button>
    </aside>
  )
}

/** 控件实例编辑区：列出内容中的控件，展开即表单化改参（用户参与的核心入口） */
function WidgetEditor({
  block,
  onChange
}: {
  block: Block
  onChange: (patch: Partial<Block>) => void
}): JSX.Element | null {
  const [openLine, setOpenLine] = useState<number | null>(null)
  const content = block.content ?? ''
  const instances = listWidgetInstances(content)
  if (instances.length === 0) return null

  const updateParam = (lineIndex: number, params: Record<string, string>): void => {
    onChange({ content: updateWidgetInstance(content, lineIndex, params) })
  }

  return (
    <Field label={`控件实例（${instances.length}）`} className={styles.fieldGap}>
      <Accordion openItems={openLine} onToggle={(_, d) => setOpenLine(d.openItems as number)}>
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
