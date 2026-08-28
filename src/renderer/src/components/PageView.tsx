import type * as React from 'react'
import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import type { Page, Slot } from '../../../shared/layout'
import { renderInlineMarkdown } from '../utils/markdown'
import { parseContent } from '../../../shared/parse'
import { renderContentNodes } from '../utils/widgets-render'

/** 解析 Markdown 表格为行列数组；非表格内容返回 null */
function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'))
  if (lines.length < 3) return null
  const rows = lines.map((l) => l.slice(1, -1).split('|').map((cell) => cell.trim()))
  const isSeparator = (cells: string[]) => cells.every((c) => /^:?-+:?$/.test(c))
  if (rows.length < 2 || !isSeparator(rows[1])) return null
  return [rows[0], ...rows.slice(2)]
}

/** 区块内容渲染：表格类解析为真 table（单元格支持行内强调），其余走控件协议流 */
function SlotContent({ kind, content }: { kind: string; content: string }): React.JSX.Element {
  if (kind === 'table') {
    const rows = parseMarkdownTable(content)
    if (rows) {
      return (
        <table className="block-table">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) =>
                  ri === 0 ? (
                    <th key={ci}>{renderInlineMarkdown(cell, `th${ri}${ci}`)}</th>
                  ) : (
                    <td key={ci}>{renderInlineMarkdown(cell, `td${ri}${ci}`)}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
  }
  const nodes = parseContent(content)
  return <>{renderContentNodes(nodes)}</>
}

const useStyles = makeStyles({
  sheet: {
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    flexShrink: 0,
    width: '210mm',
    minHeight: '297mm',
    padding: '15mm'
  },
  slot: {
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: '8px',
    cursor: 'pointer'
  },
  slotSelected: {
    outline: `2px solid ${tokens.colorBrandStroke1}`,
    outlineOffset: '-1px'
  },
  roleBadge: {
    position: 'absolute',
    top: '-8px',
    left: '8px',
    fontSize: tokens.fontSizeBase100,
    padding: '0 6px',
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    borderRadius: tokens.borderRadiusSmall,
    pointerEvents: 'none'
  },
  slotEmpty: {
    padding: '12px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200
  },
  slotContent: {
    padding: '8px 10px',
    fontSize: tokens.fontSizeBase200,
    lineHeight: '1.5',
    color: tokens.colorNeutralForeground1,
    pointerEvents: 'none',
    userSelect: 'none'
  },
  slotStatus: {
    position: 'absolute',
    bottom: '4px',
    right: '8px',
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorBrandForeground1
  },
  slotError: {
    padding: '8px 10px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    pointerEvents: 'none'
  }
})

/** 单个槽位渲染（高度随内容自然流式撑开——CSS 文档流天然自适应，无需 JS 测量） */
function SlotBox({
  slot,
  selected,
  onPointerDown,
  children
}: {
  slot: Slot
  selected: boolean
  onPointerDown: (e: React.PointerEvent) => void
  children: ReactNode
}): React.JSX.Element {
  const styles = useStyles()
  return (
    <div
      className={`${styles.slot} ${selected ? styles.slotSelected : ''}`}
      data-slot-id={slot.id}
      onPointerDown={onPointerDown}
    >
      <span className={styles.roleBadge}>{slot.role}</span>
      {children}
    </div>
  )
}

interface PageViewProps {
  page: Page
  selectedSlotId: string | null
  onSelectSlot: (id: string | null) => void
}

/** A4 页面：按文档流渲染槽位（流式排布已在数据层完成） */
function PageView({ page, selectedSlotId, onSelectSlot }: PageViewProps): React.JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.sheet}>
      {page.slots.map((slot) => (
        <SlotBox
          key={slot.id}
          slot={slot}
          selected={selectedSlotId === slot.id}
          onPointerDown={() => onSelectSlot(slot.id)}
        >
          {slot.status === 'done' && slot.content ? (
            <div className={styles.slotContent}>
              <SlotContent kind={slot.kind} content={slot.content} />
            </div>
          ) : slot.status === 'generating' ? (
            <div className={styles.slotEmpty}>生成中…</div>
          ) : slot.status === 'error' ? (
            <div className={styles.slotError}>{slot.content}</div>
          ) : (
            <div className={styles.slotEmpty}>
              {slot.prompt ? slot.prompt.slice(0, 40) : '空槽位（在右侧填写提示词）'}
            </div>
          )}
          {slot.status === 'generating' && <span className={styles.slotStatus}>⟳</span>}
        </SlotBox>
      ))}
    </div>
  )
}

export default PageView
