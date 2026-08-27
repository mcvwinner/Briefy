import { Dropdown, SpinButton, Textarea, makeStyles } from '@fluentui/react-components'
import type { Block, BlockKind } from '../../../shared/layout'

const KIND_OPTIONS = [
  { text: '纯文字', value: 'text' },
  { text: '图文', value: 'text-image' },
  { text: '表格', value: 'table' },
  { text: '图片', value: 'image' }
] as const

const useStyles = makeStyles({
  field: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  label: { fontSize: '12px', color: '#616161' },
  promptArea: { minHeight: '120px' }
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
      <aside className="properties-panel">
        <h2 className="panel-title">属性</h2>
        <p className="panel-hint">选中内容块后在此编辑提示词与样式</p>
      </aside>
    )
  }

  return (
    <aside className="properties-panel">
      <h2 className="panel-title">区块属性</h2>

      <div className={styles.field}>
        <label className={styles.label}>提示词（想让 AI 填什么）</label>
        <Textarea
          className={styles.promptArea}
          placeholder="例：总结今日头条科技新闻，200 字以内"
          value={block.prompt}
          onChange={(_, data) => onChange({ prompt: data.value })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>内容形式</label>
        <Dropdown
          value={KIND_OPTIONS.find((k) => k.value === block.kind)?.text ?? '纯文字'}
          selectedOptions={[block.kind]}
          onOptionSelect={(_, data) => onChange({ kind: data.optionValue as BlockKind })}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.text}
            </option>
          ))}
        </Dropdown>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>尺寸（mm）</label>
        <div style={{ display: 'flex', gap: '8px' }}>
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
      </div>

      <button className="delete-btn" onClick={onRemove} type="button">
        删除此区块（Delete）
      </button>
    </aside>
  )
}

export default PropertiesPanel
