import { useRef, useState } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import type { Block, Page } from '../../../shared/layout'
import { mmToPx } from '../utils/units'

const useStyles = makeStyles({
  sheet: {
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    flexShrink: 0
  },
  block: {
    position: 'absolute',
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    cursor: 'move'
  },
  blockSelected: {
    outline: `2px solid ${tokens.colorBrandStroke1}`,
    outlineOffset: '-2px'
  },
  blockLabel: {
    position: 'absolute',
    top: '4px',
    left: '6px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    maxWidth: 'calc(100% - 12px)'
  },
  blockContent: {
    position: 'absolute',
    inset: 0,
    padding: '8px',
    fontSize: tokens.fontSizeBase200,
    lineHeight: '1.5',
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    pointerEvents: 'none',
    userSelect: 'none',
    whiteSpace: 'pre-wrap'
  },
  blockStatus: {
    position: 'absolute',
    bottom: '6px',
    right: '8px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1
  },
  blockError: {
    position: 'absolute',
    inset: 0,
    padding: '8px',
    paddingTop: '26px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    overflow: 'hidden',
    pointerEvents: 'none'
  },
  handle: {
    position: 'absolute',
    width: '10px',
    height: '10px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    borderRadius: '50%',
    zIndex: 10
  },
  marquee: {
    position: 'absolute',
    border: `1.5px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    pointerEvents: 'none'
  }
})

/** 8 个缩放手柄方向 */
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface DragState {
  blockId: string
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
  mode: 'move' | Handle
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface PageCanvasProps {
  page: Page
  selectedBlockId: string | null
  /** 非空时处于"框选添加"模式，回调创建新区块（mm 坐标） */
  drawRect?: (rect: Rect) => void
  onSelectBlock: (id: string | null) => void
  onChangeBlock: (blockId: string, patch: Partial<Block>) => void
}

const HANDLES: { dir: Handle; style: React.CSSProperties; cursor: string }[] = [
  { dir: 'nw', cursor: 'nwse-resize', style: { left: -5, top: -5 } },
  { dir: 'n', cursor: 'ns-resize', style: { left: '50%', top: -5, marginLeft: -5 } },
  { dir: 'ne', cursor: 'nesw-resize', style: { right: -5, top: -5 } },
  { dir: 'e', cursor: 'ew-resize', style: { right: -5, top: '50%', marginTop: -5 } },
  { dir: 'se', cursor: 'nwse-resize', style: { right: -5, bottom: -5 } },
  { dir: 's', cursor: 'ns-resize', style: { left: '50%', bottom: -5, marginLeft: -5 } },
  { dir: 'sw', cursor: 'nesw-resize', style: { left: -5, bottom: -5 } },
  { dir: 'w', cursor: 'ew-resize', style: { left: -5, top: '50%', marginTop: -5 } }
]

function PageView({
  page,
  selectedBlockId,
  drawRect,
  onSelectBlock,
  onChangeBlock
}: PageCanvasProps): JSX.Element {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const styles = useStyles()

  /** 屏幕坐标 → 页面内 mm 坐标 */
  const toMm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = sheetRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: (clientX - rect.left) / PX_PER_MM,
      y: (clientY - rect.top) / PX_PER_MM
    }
  }

  const startMarquee = (e: React.PointerEvent): void => {
    if (!drawRect || e.button !== 0) return
    const start = toMm(e.clientX, e.clientY)
    if (!start) return

    let current = start
    setMarquee({ x: start.x, y: start.y, width: 0, height: 0 })

    const onMove = (ev: PointerEvent): void => {
      current = toMm(ev.clientX, ev.clientY) ?? start
      setMarquee({
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y)
      })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setMarquee(null)
      // 有效拖拽才创建（避免误点）
      if (Math.abs(current.x - start.x) > 3 && Math.abs(current.y - start.y) > 3) {
        drawRect({
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y)
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startDrag = (e: React.PointerEvent, block: Block, mode: DragState['mode']): void => {
    e.stopPropagation()
    if (e.button !== 0) return
    onSelectBlock(block.id)
    dragRef.current = {
      blockId: block.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: block.x,
      origY: block.y,
      origW: block.width,
      origH: block.height,
      mode
    }

    const onMove = (ev: PointerEvent): void => {
      const d = dragRef.current
      if (!d) return
      const dx = (ev.clientX - d.startX) / PX_PER_MM
      const dy = (ev.clientY - d.startY) / PX_PER_MM

      switch (d.mode) {
        case 'move':
          onChangeBlock(d.blockId, { x: d.origX + dx, y: d.origY + dy })
          break
        case 'se':
          onChangeBlock(d.blockId, { width: d.origW + dx, height: d.origH + dy })
          break
        case 'ne':
          onChangeBlock(d.blockId, { y: d.origY + dy, width: d.origW + dx, height: d.origH - dy })
          break
        case 'sw':
          onChangeBlock(d.blockId, { x: d.origX + dx, width: d.origW - dx, height: d.origH + dy })
          break
        case 'nw':
          onChangeBlock(d.blockId, {
            x: d.origX + dx,
            y: d.origY + dy,
            width: d.origW - dx,
            height: d.origH - dy
          })
          break
        case 'n':
          onChangeBlock(d.blockId, { y: d.origY + dy, height: d.origH - dy })
          break
        case 's':
          onChangeBlock(d.blockId, { height: d.origH + dy })
          break
        case 'e':
          onChangeBlock(d.blockId, { width: d.origW + dx })
          break
        case 'w':
          onChangeBlock(d.blockId, { x: d.origX + dx, width: d.origW - dx })
          break
      }
    }
    const onUp = (): void => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={sheetRef}
      className={styles.sheet}
      style={{ width: mmToPx(210), height: mmToPx(297) }}
      onPointerDown={startMarquee}
    >
      {page.blocks.map((block) => (
        <div
          key={block.id}
          className={`${styles.block} ${selectedBlockId === block.id ? styles.blockSelected : ''}`}
          style={{
            left: mmToPx(block.x),
            top: mmToPx(block.y),
            width: mmToPx(block.width),
            height: mmToPx(block.height)
          }}
          onPointerDown={(e) => startDrag(e, block, 'move')}
        >
          {/* 有正文时隐藏左上角标签，避免与生成内容重叠 */}
          {!(block.status === 'done' && block.content) && (
            <span className={styles.blockLabel}>
              {block.prompt ? block.prompt.slice(0, 20) : '空白区块'}
            </span>
          )}
          {block.status === 'generating' && <div className={styles.blockStatus}>生成中…</div>}
          {block.status === 'error' && <div className={styles.blockError}>{block.content}</div>}
          {block.status === 'done' && block.content && (
            <div className={styles.blockContent}>{block.content}</div>
          )}
          {selectedBlockId === block.id &&
            HANDLES.map(({ dir, style, cursor }) => (
              <div
                key={dir}
                className={styles.handle}
                style={{ ...style, cursor }}
                onPointerDown={(e) => startDrag(e, block, dir)}
              />
            ))}
        </div>
      ))}
      {marquee && <div className={styles.marquee} style={{ left: mmToPx(marquee.x), top: mmToPx(marquee.y), width: mmToPx(marquee.width), height: mmToPx(marquee.height) }} />}
    </div>
  )
}

export default PageView

const PX_PER_MM = 3.7795
