import type * as React from 'react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

/** 头条三段式解析（ROADMAP Q4）：引题行 + # 主标行 + 副题行。
 *  带合理性校验：主标超过 40 字或副题超过 80 字视为 AI 未守格式 → 返回 null 回退普通渲染（无损兜底） */
function parseHeadline(text: string): { kicker: string; title: string; sub: string } | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  // 主标行兼容多级 #（## 也常见）；控件行（:::）不参与
  const titleIdx = lines.findIndex((l) => /^#{1,6} /.test(l) && !l.startsWith(':::'))
  if (titleIdx === -1) return null
  const title = lines[titleIdx].replace(/^#{1,6}\s+/, '').trim()
  const sub = lines.slice(titleIdx + 1).join(' ')
  if (!title || title.length > 40 || sub.length > 80) return null
  return { kicker: lines.slice(0, titleIdx).join(' '), title, sub }
}

/** 区块内容渲染：表格/图表解析为真 table/图表，其余走控件协议流。
 *  纯文字槽也嗅探表格：AI 即使在 text 槽返回了 Markdown 表格（未按 kind 约定）也正常渲染 */
function SlotContent({ kind, content, role }: { kind: string; content: string; role?: string }): React.JSX.Element {
  // 头条特化排版：引题（上，小字距宽）→ 主标（大粗）→ 副题（下，斜体灰）；不守格式则回退普通渲染
  if (role === 'headline') {
    const h = parseHeadline(content)
    if (h) {
      return (
        <div className="headline-block">
          {h.kicker && <div className="headline-kicker">{h.kicker}</div>}
          <div className="headline-title">{h.title}</div>
          {h.sub && <div className="headline-sub">{h.sub}</div>}
        </div>
      )
    }
  }
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
  },
  resizeHandle: {
    position: 'absolute',
    bottom: '-5px',
    right: '-5px',
    width: '10px',
    height: '10px',
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    cursor: 'nwse-resize',
    touchAction: 'none'
  }
})

/** 单个槽位渲染。测量实际渲染高度，超出预估（estHeight+overflow）时回写，
 *  触发上层 flowSlots/paginate 把放不下的槽位自动腾挪到下一页（收敛：overflow 只在再超出时增大） */
function SlotBox({
  slot,
  roleName,
  selected,
  fillHeight,
  onResizeStart,
  onPointerDown,
  onOverflow,
  onFit,
  children
}: {
  slot: Slot
  roleName: string
  selected: boolean
  /** 手动布局：外层已定宽高，槽位填满容器 */
  fillHeight?: boolean
  /** 手动布局：拖角缩放手柄（仅选中时传入） */
  onResizeStart?: (e: React.PointerEvent) => void
  onPointerDown: (e: React.PointerEvent) => void
  onOverflow?: (slotId: string, deltaMm: number) => void
  /** 实测适配状态回写（收敛后的字号比例与是否溢出；质量报告以实测为准） */
  onFit?: (slotId: string, fitScale: number, overflow: boolean) => void
  children: ReactNode
}): React.JSX.Element {
  const styles = useStyles()
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  /** 字号微调（v0.22，双向收敛）：内容略少→增大字号填满槽位（上限 125%）；略多→缩小字号（下限 70%）；
   *  到下限仍装不下才回写 onOverflow 放宽槽位（版面重排）。增长过头会回退一步并锁定，防增/缩来回震荡。
   *  缩放系数经 CSS 变量 --briefy-fit 传递，内容 div 用 calc(字号 * var(--briefy-fit)) 引用 */
  const [fitScale, setFitScale] = useState(1)
  const growingRef = useRef(false)
  const lockedRef = useRef(false)
  useEffect(() => {
    setFitScale(1)
    growingRef.current = false
    lockedRef.current = false
  }, [slot.content])
  // 每次渲染后测量（无依赖数组）：内容/字号变化都重测；达标时不触发 setState，自然收敛。
  // 用 scrollHeight：自动模式（内容撑开）= offsetHeight；手动模式（高度固定+hidden）= 完整内容高
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const actualMm = pxToMm(el.scrollHeight)
    const limit = slot.estHeight + (slot.overflow ?? 0)
    let overflowing = false
    if (actualMm > limit + 1) {
      if (growingRef.current) {
        // 增字号尝试过头：回退一步（上一个安全值）并锁定，不再增长
        growingRef.current = false
        lockedRef.current = true
        setFitScale((s) => Math.max(0.7, s / 1.1))
      } else if (fitScale > 0.71) {
        setFitScale((s) => Math.max(0.7, s * 0.9))
      } else if (onOverflow) {
        onOverflow(slot.id, Math.ceil(actualMm - limit))
        overflowing = true
      }
    } else if (actualMm < limit - 3 && fitScale < 1.24 && !lockedRef.current) {
      // 留白超过 3mm 才增字号（避免小留白抖动），步进 1.1，上限 125%
      growingRef.current = true
      setFitScale((s) => Math.min(1.25, s * 1.1))
    } else {
      growingRef.current = false
    }
    // 实测结果回写（App 端去重，同值不触发重渲染）；生成中不上报（内容未完，无适配意义）
    if (slot.status === 'done') onFit?.(slot.id, fitScale, overflowing)
  })
  return (
    <div
      ref={ref}
      className={`${styles.slot} ${selected ? styles.slotSelected : ''} ${hovered ? styles.slotHover : ''} ${slot.status === 'generating' ? 'slot-generating' : ''}`}
      data-slot-id={slot.id}
      style={{
        ['--briefy-fit' as string]: fitScale,
        ...(fillHeight ? { height: '100%', overflow: 'hidden' } : {})
      } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className={styles.roleBadge}>{roleName}</span>
      {children}
      {selected && onResizeStart && <span className={styles.resizeHandle} onPointerDown={onResizeStart} />}
    </div>
  )
}

interface PageViewProps {
  page: Page
  selectedSlotId: string | null
  onSelectSlot: (id: string | null) => void
  /** 槽位实际高度超出预估时回写（触发重新流式排布与分页）；打印视图不传 */
  onOverflow?: (slotId: string, deltaMm: number) => void
  /** 手动布局模式：槽位绝对定位，可拖拽移动/缩放；缺省 = 自动流式排布 */
  manual?: boolean
  /** 手动模式：拖拽结束提交位置（跨页方向 prev/next 由上层处理） */
  onMoveSlot?: (slotId: string, x: number, y: number, cross?: 'prev' | 'next') => void
  /** 手动模式：拖角结束提交尺寸 */
  onResizeSlot?: (slotId: string, width: number, estHeight: number) => void
  /** 实测适配状态回写（字号比例/溢出；质量报告以实测为准）；打印视图不传 */
  onFit?: (slotId: string, fitScale: number, overflow: boolean) => void
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

/** A4 页面：全宽槽位纵向流 + 左右半栏真实并排；手动布局模式下槽位绝对定位可拖拽 */
function PageView({ page, selectedSlotId, onSelectSlot, onOverflow, onFit, manual, onMoveSlot, onResizeSlot, prefs, customRoles, docTitle, pageNo, totalPages }: PageViewProps): React.JSX.Element {
  const styles = useStyles()
  const { full, left, right } = groupColumns(page.slots)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  /** 拖拽预览（未释放前仅视觉偏移，释放时一次性提交） */
  const [preview, setPreview] = useState<null | { id: string; x: number; y: number; w: number; h: number; cross?: 'prev' | 'next' | null }>(null)
  const drag = useRef<null | { id: string; mode: 'move' | 'resize'; sx: number; sy: number; bx: number; by: number; bw: number; bh: number; last: { x: number; y: number; w: number; h: number; cross?: 'prev' | 'next' | null } }>(null)

  // 版式偏好（缺省 = 现有稳定体验）；灰阶用 CSS filter，字体字号行距用内联样式
  const margin = prefs?.marginMM !== undefined ? `${Math.min(25, Math.max(10, prefs.marginMM))}mm` : '15mm'
  const gap = prefs?.gapMM !== undefined ? `${Math.min(12, Math.max(4, prefs.gapMM))}mm` : '8mm'
  const font = prefs?.fontFamily
  const fontSize = prefs?.fontSizePt !== undefined ? `${Math.min(14, Math.max(8, prefs.fontSizePt))}pt` : undefined
  const lineHeight = prefs?.lineHeight !== undefined ? `${Math.min(2, Math.max(1.2, prefs.lineHeight))}` : undefined
  const filter = prefs?.grayscale ? 'grayscale(1)' : undefined
  // 多栏正文流（ROADMAP Q3）：正文槽位文字分栏（1–3 栏，默认 1 = 单栏）
  const columns = prefs?.columns !== undefined ? Math.min(3, Math.max(1, Math.round(prefs.columns))) : 1
  const marginNum = prefs?.marginMM !== undefined ? Math.min(25, Math.max(10, prefs.marginMM)) : 15

  // ---- 手动布局：拖拽移动 / 拖角缩放（mm 与 px 互转基于 sheet 实际宽度）----
  const mmPerPx = (): number => 210 / (sheetRef.current?.clientWidth ?? 794)
  const startDrag = (e: React.PointerEvent, slot: Slot, mode: 'move' | 'resize'): void => {
    if (!manual) return
    e.preventDefault()
    e.stopPropagation()
    // 合成测试事件/指针已失效时 capture 会抛异常，忽略（不影响拖拽逻辑本身）
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const h = slot.estHeight + (slot.overflow ?? 0)
    drag.current = { id: slot.id, mode, sx: e.clientX, sy: e.clientY, bx: slot.region.x, by: slot.region.y, bw: slot.region.width, bh: h, last: { x: slot.region.x, y: slot.region.y, w: slot.region.width, h } }
    setPreview({ id: slot.id, x: slot.region.x, y: slot.region.y, w: slot.region.width, h })
  }
  const onDragMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const k = mmPerPx()
    const dx = (e.clientX - d.sx) * k
    const dy = (e.clientY - d.sy) * k
    if (d.mode === 'move') {
      // 双向跨页检测：拖出页底 → 下一页；拖出页顶 → 上一页（预览钳在页内，释放时提交）
      const usable = 297 - marginNum
      const ny = d.by + dy
      const cross = ny + d.bh > usable ? ('next' as const) : ny < marginNum - 12 ? ('prev' as const) : null
      const py = cross === 'prev' ? marginNum : Math.min(Math.max(marginNum, ny), usable - d.bh)
      d.last = { ...d.last, x: d.bx + dx, y: cross ? d.last.y : py, cross }
      setPreview((p) => p && { ...p, x: d.bx + dx, y: cross ? p.y : py, cross })
    } else {
      d.last = { ...d.last, w: d.bw + dx, h: Math.max(15, d.bh + dy) }
      setPreview((p) => p && { ...p, w: d.last.w, h: d.last.h })
    }
  }
  const endDrag = (): void => {
    const d = drag.current
    drag.current = null
    setPreview(null)
    if (!d) return
    // 用 ref 里的最新预览提交（state 闭包可能过期，同步事件序列中 setPreview 尚未提交渲染）
    if (d.mode === 'move') {
      const x = Math.min(210 - marginNum - 30, Math.max(marginNum, d.last.x))
      onMoveSlot?.(d.id, x, d.last.y, d.last.cross ?? undefined)
    } else {
      onResizeSlot?.(d.id, d.last.w, d.last.h)
    }
  }

  const renderSlot = (slot: Slot): React.JSX.Element => (
    <SlotBox
      key={slot.id}
      slot={slot}
      roleName={resolveRoleName(slot, customRoles)}
      selected={selectedSlotId === slot.id}
      fillHeight={manual}
      onResizeStart={manual && selectedSlotId === slot.id ? (e) => startDrag(e, slot, 'resize') : undefined}
      onPointerDown={() => onSelectSlot(slot.id)}
      onOverflow={onOverflow}
      onFit={onFit}
    >
      {slot.status === 'done' && slot.content ? (
        <div
          className={styles.slotContent}
          style={{
            fontFamily: font,
            lineHeight,
            // 自适应缩字号：字号乘以 SlotBox 提供的 --briefy-fit 系数（装不下就缩小，不砍内容）
            fontSize: `calc(${fontSize ?? '10pt'} * var(--briefy-fit, 1))`,
            ...(slot.role === 'body' && slot.kind === 'text' && columns > 1
              ? { columnCount: columns, columnGap: '6mm', columnRule: '1px solid #ddd' }
              : {})
          }}
        >
          <SlotContent kind={slot.kind} content={slot.content} role={slot.role} />
          {/* 来源署名（ROADMAP Q1）：挂在槽位上的源即视为本期事实依据 */}
          {(slot.sources?.length ?? 0) > 0 && (
            <div className="slot-sources">来源：{slot.sources.map((s) => s.name).join('、')}</div>
          )}
        </div>
      ) : slot.status === 'generating' ? (
        <div className={styles.slotEmpty}>
          生成中<span className="slot-empty-dots" />
        </div>
      ) : slot.status === 'error' ? (
        <div className={styles.slotError}>{slot.content}</div>
      ) : (
        <div className={styles.slotEmpty}>
          {slot.prompt ? slot.prompt.slice(0, 40) : '空槽位（在右侧填写提示词）'}
        </div>
      )}
      {slot.status === 'generating' && <span className={`${styles.slotStatus} slot-status-spin`}>⟳</span>}
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

  // 手动布局：槽位绝对定位（拖拽预览实时生效），跳过自动流式排布
  const manualNodes: React.JSX.Element[] | null = manual
    ? page.slots.map((slot) => {
        const p = preview?.id === slot.id ? preview : null
        const x = p?.x ?? slot.region.x
        const y = p?.y ?? slot.region.y
        const w = p?.w ?? slot.region.width
        const h = p?.h ?? slot.estHeight + (slot.overflow ?? 0)
        return (
          <div
            key={slot.id}
            style={{
              position: 'absolute',
              left: `${x}mm`,
              top: `${y}mm`,
              width: `${w}mm`,
              height: `${h}mm`,
              touchAction: 'none',
              zIndex: preview?.id === slot.id ? 10 : undefined
            }}
            onPointerDown={(e) => startDrag(e, slot, 'move')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {renderSlot(slot)}
          </div>
        )
      })
    : null

  // 页眉页脚（P6c）：绘制在页边距区（absolute），不占内容高、不影响分页计算
  const header = prefs?.header
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className={styles.sheet} style={{ padding: margin, filter }} ref={sheetRef}>
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
      {manualNodes ?? rows}
      {/* 跨页松手反馈：拖出页顶/页底时提示落点，避免用户一脸懵 */}
      {preview?.cross && (
        <div
          className="cross-hint"
          style={preview.cross === 'prev' ? { top: '10mm' } : { bottom: '10mm' }}
        >
          {preview.cross === 'prev' ? '↑ 松手移动到上一页' : '↓ 松手移动到下一页'}
        </div>
      )}
    </div>
  )
}

export default PageView
