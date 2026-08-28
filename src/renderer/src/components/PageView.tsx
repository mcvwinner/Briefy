import type * as React from 'react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import type { Page, Slot } from '../../../shared/layout'
import { resolveRoleName } from '../../../shared/layout'
import type { CustomRole, LayoutPrefs } from '../../../shared/settings'
import { renderInlineMarkdown } from '../utils/markdown'
import { parseContent } from '../../../shared/parse'
import { renderContentNodes } from '../utils/widgets-render'
import { pxToMm } from '../utils/units'

/** 解析 Markdown 表格为行列数组；非表格内容返回 null */
function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'))
  if (lines.length < 3) return null
  const rows = lines.map((l) => l.slice(1, -1).split('|').map((cell) => cell.trim()))
  const isSeparator = (cells: string[]) => cells.every((c) => /^:?-+:?$/.test(c))
  if (rows.length < 2 || !isSeparator(rows[1])) return null
  return [rows[0], ...rows.slice(2)]
}

/** 行列数组渲染为真 table（单元格支持行内强调） */
function renderTable(rows: string[][]): React.JSX.Element {
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

/** 区块内容渲染：表格类解析为真 table，其余走控件协议流。
 *  纯文字槽也嗅探表格：AI 即使在 text 槽返回了 Markdown 表格（未按 kind 约定）也正常渲染 */
function SlotContent({ kind, content }: { kind: string; content: string }): React.JSX.Element {
  const isTableLike =
    kind === 'table' || content.split('\n').filter((l) => l.trim().startsWith('|')).length >= 3
  if (isTableLike) {
    const rows = parseMarkdownTable(content)
    if (rows) return renderTable(rows)
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
    // 物理纸张极限：A4 高度固定，内容永不突破纸张（超出部分被裁剪，
    // 同时 SlotBox 测量回写 overflow 触发分页腾挪，正常情况下内容会被自动移到下一页）
    height: '297mm',
    padding: '15mm',
    overflow: 'hidden'
  },
  columnsRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
    marginBottom: '8px'
  },
  column: {
    flex: 1,
    minWidth: 0
  },
  slot: {
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground2,
    // 更柔和的边框层级：暗色下不刺眼，亮色下仍清晰
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer'
  },
  slotHover: {
    borderTopColor: tokens.colorNeutralStroke1Hover,
    borderRightColor: tokens.colorNeutralStroke1Hover,
    borderBottomColor: tokens.colorNeutralStroke1Hover,
    borderLeftColor: tokens.colorNeutralStroke1Hover
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
  sheetHeader: {
    position: 'absolute',
    top: '6mm',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderTopWidth: '0',
    borderRightWidth: '0',
    borderBottomWidth: '0.5mm',
    borderLeftWidth: '0',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: 'transparent',
    paddingBottom: '2mm',
    fontSize: '9pt',
    color: tokens.colorNeutralForeground2,
    pointerEvents: 'none'
  },
  sheetHeaderTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: '11pt',
    color: tokens.colorNeutralForeground1
  },
  sheetFooter: {
    position: 'absolute',
    bottom: '5mm',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: '8.5pt',
    color: tokens.colorNeutralForeground3,
    pointerEvents: 'none'
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

/** 单个槽位渲染。测量实际渲染高度，超出预估（estHeight+overflow）时回写，
 *  触发上层 flowSlots/paginate 把放不下的槽位自动腾挪到下一页（收敛：overflow 只在再超出时增大） */
function SlotBox({
  slot,
  roleName,
  selected,
  onPointerDown,
  onOverflow,
  children
}: {
  slot: Slot
  roleName: string
  selected: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onOverflow?: (slotId: string, deltaMm: number) => void
  children: ReactNode
}): React.JSX.Element {
  const styles = useStyles()
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  // 每次渲染后测量（无依赖数组）：内容/宽度变化都重测；不超限时不触发 setState，自然收敛
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !onOverflow) return
    const actualMm = pxToMm(el.offsetHeight)
    const limit = slot.estHeight + (slot.overflow ?? 0)
    if (actualMm > limit + 1) onOverflow(slot.id, Math.ceil(actualMm - limit))
  })
  return (
    <div
      ref={ref}
      className={`${styles.slot} ${selected ? styles.slotSelected : ''} ${hovered ? styles.slotHover : ''}`}
      data-slot-id={slot.id}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className={styles.roleBadge}>{roleName}</span>
      {children}
    </div>
  )
}

interface PageViewProps {
  page: Page
  selectedSlotId: string | null
  onSelectSlot: (id: string | null) => void
  /** 槽位实际高度超出预估时回写（触发重新流式排布与分页）；打印视图不传 */
  onOverflow?: (slotId: string, deltaMm: number) => void
  /** 版式偏好（页边距/栏距/字体/字号/行距/黑白优先/页眉页脚）；缺省 = 内置默认 */
  prefs?: LayoutPrefs
  /** 自定义角色库（徽章显示自定义角色名） */
  customRoles?: CustomRole[]
  /** 报头文字（页眉开启 title 时显示，取 doc.title） */
  docTitle?: string
  /** 页码（页脚 pageNo 开启时显示：第 X 页 · 共 N 页） */
  pageNo?: number
  totalPages?: number
}

/**
 * 槽位分列：按 region.x 归入左列/右列（宽度>150 的全宽槽位独立占一行）。
 * 左右两列真实并排——宽度模式才有实际意义。
 */
function groupColumns(slots: Slot[]): { full: Slot[]; left: Slot[]; right: Slot[] } {
  const full: Slot[] = []
  const left: Slot[] = []
  const right: Slot[] = []
  for (const slot of slots) {
    if (slot.region.width > 150) full.push(slot)
    else if (slot.region.x < 60) left.push(slot)
    else right.push(slot)
  }
  return { full, left, right }
}

/** A4 页面：全宽槽位纵向流 + 左右半栏真实并排 */
function PageView({ page, selectedSlotId, onSelectSlot, onOverflow, prefs, customRoles, docTitle, pageNo, totalPages }: PageViewProps): React.JSX.Element {
  const styles = useStyles()
  const { full, left, right } = groupColumns(page.slots)

  // 版式偏好（缺省 = 现有稳定体验）；灰阶用 CSS filter，字体字号行距用内联样式
  const margin = prefs?.marginMM !== undefined ? `${Math.min(25, Math.max(10, prefs.marginMM))}mm` : '15mm'
  const gap = prefs?.gapMM !== undefined ? `${Math.min(12, Math.max(4, prefs.gapMM))}mm` : '8mm'
  const font = prefs?.fontFamily
  const fontSize = prefs?.fontSizePt !== undefined ? `${Math.min(14, Math.max(8, prefs.fontSizePt))}pt` : undefined
  const lineHeight = prefs?.lineHeight !== undefined ? `${Math.min(2, Math.max(1.2, prefs.lineHeight))}` : undefined
  const filter = prefs?.grayscale ? 'grayscale(1)' : undefined

  const renderSlot = (slot: Slot): React.JSX.Element => (
    <SlotBox
      key={slot.id}
      slot={slot}
      roleName={resolveRoleName(slot, customRoles)}
      selected={selectedSlotId === slot.id}
      onPointerDown={() => onSelectSlot(slot.id)}
      onOverflow={onOverflow}
    >
      {slot.status === 'done' && slot.content ? (
        <div className={styles.slotContent} style={{ fontFamily: font, fontSize, lineHeight }}>
          <SlotContent kind={slot.kind} content={slot.content} />
          {/* 来源署名（ROADMAP Q1）：挂在槽位上的源即视为本期事实依据 */}
          {(slot.sources?.length ?? 0) > 0 && (
            <div className="slot-sources">来源：{slot.sources.map((s) => s.name).join('、')}</div>
          )}
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
  )
  // 有左右栏时：full 槽位按序渲染；遇到首个半栏槽位时进入"双栏区"，双栏区结束后继续 full 流。
  // 注意：双栏区的开启条件必须包含右栏（只看左栏时，"左栏空、右栏有孤立槽位、full 已耗尽"
  // 会导致循环体不推进任何游标 → 无限渲染循环 → 页面卡死）
  const rows: React.JSX.Element[] = []
  let fi = 0
  let li = 0
  let ri = 0
  let inColumns = false
  while (fi < full.length || li < left.length || ri < right.length) {
    const progress = fi + li + ri
    if (!inColumns && (li < left.length || ri < right.length)) {
      // 开启双栏区
      inColumns = true
      rows.push(
        <div key={`cols-${li}-${ri}`} className={styles.columnsRow} style={{ gap }}>
          <div className={styles.column}>{left[li] ? renderSlot(left[li++]) : null}</div>
          <div className={styles.column}>{right[ri] ? renderSlot(right[ri++]) : null}</div>
        </div>
      )
      continue
    }
    if (inColumns && (li < left.length || ri < right.length)) {
      rows.push(
        <div key={`cols-${li}-${ri}`} className={styles.columnsRow} style={{ gap }}>
          <div className={styles.column}>{left[li] ? renderSlot(left[li++]) : null}</div>
          <div className={styles.column}>{right[ri] ? renderSlot(right[ri++]) : null}</div>
        </div>
      )
      continue
    }
    if (inColumns && li >= left.length && ri >= right.length) inColumns = false
    if (fi < full.length) rows.push(renderSlot(full[fi++]))
    // 防御：本轮未推进任何游标则退出，保证渲染必然终止（双栏状态机兜底）
    if (fi + li + ri === progress) break
  }
  // 无半栏槽位时的兜底：只渲染 full 流
  if (rows.length === 0) full.forEach((s) => rows.push(renderSlot(s)))

  // 页眉页脚（P6c）：绘制在页边距区（absolute），不占内容高、不影响分页计算
  const header = prefs?.header
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className={styles.sheet} style={{ padding: margin, filter }}>
      {header?.title && (docTitle || header.text) && (
        <div className={styles.sheetHeader} style={{ left: margin, right: margin }}>
          <span className={styles.sheetHeaderTitle}>{header.text?.trim() || docTitle}</span>
          {header?.date && <span>{today}</span>}
        </div>
      )}
      {!header?.title && header?.date && (
        <div className={styles.sheetHeader} style={{ left: margin, right: margin }}>
          <span>{today}</span>
        </div>
      )}
      {header?.pageNo && pageNo !== undefined && (
        <div className={styles.sheetFooter}>
          {totalPages !== undefined ? `第 ${pageNo} 页 · 共 ${totalPages} 页` : `第 ${pageNo} 页`}
        </div>
      )}
      {rows}
    </div>
  )
}

export default PageView
