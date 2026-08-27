import {
  Button,
  Dropdown,
  Field,
  SpinButton,
  Textarea,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { DeleteRegular } from '@fluentui/react-icons'
import type { Block, BlockKind } from '../../../shared/layout'

const KIND_OPTIONS = [
  { text: '纯文字', value: 'text' },
  { text: '图文', value: 'text-image' },
  { text: '表格', value: 'table' },
  { text: '图片', value: 'image' }
] as const

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
            <option key={k.value} value={k.value}>
              {k.text}
            </option>
          ))}
        </Dropdown>
      </Field>

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

export default PropertiesPanel
