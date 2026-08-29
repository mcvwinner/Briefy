import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createEmptyDoc,
  createEmptyPage,
  createSlot,
  flowSlots,
  migrateSlotSources,
  paginate,
  regionFor,
  resolveGeometry,
  DEFAULT_SLOT_HEIGHT,
  type LayoutDoc,
  type LayoutGeometry,
  type Page,
  type Slot,
  type SlotRole,
  type WidthMode
} from '../../../shared/layout'
import type { InfoSource, LayoutPrefs } from '../../../shared/settings'
import { parseLayoutDoc } from '../../../shared/layout'

/** 排版文档的全部操作：槽位增删改、多页管理、文档级操作。
 *  prefs：版式偏好（页边距/栏距），缺省 = 内置默认 */
export function useLayout(prefs?: LayoutPrefs) {
  const [doc, setDoc] = useState<LayoutDoc>(createEmptyDoc)
  /** 最新文档引用：异步任务（订阅出刊/生成）跨渲染读最新 doc，避免闭包过期 */
  const docRef = useRef(doc)
  docRef.current = doc
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [currentPageId, setCurrentPageId] = useState<string>(() => doc.pages[0].id)
  const geo = useMemo<LayoutGeometry>(() => resolveGeometry(prefs), [prefs?.marginMM, prefs?.gapMM])

  const updatePage = useCallback((pageId: string, updater: (page: Page) => Page) => {
    setDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? updater(p) : p))
    }))
  }, [])

  /** 全文档摊平重排：所有槽位按顺序贪心装满每页，消除腾挪/调整产生的碎片空白页。
   *  首页 id 保留（当前页不跳变），新页由 paginate 生成 */
  const repaginateAll = useCallback((pages: Page[]): Page[] => {
    const flat = pages.flatMap((p) => p.slots)
    return paginate([{ id: pages[0]?.id ?? crypto.randomUUID(), slots: flat }], geo)
  }, [geo])

  /** 添加槽位：选角色 + 宽度模式，自动流式排布 + 自动分页（手动模式下直接放入当前页不重排）。
   *  分页可能把新槽位挤到新页，添加后自动切到它实际所在的页并选中（否则用户以为没生效） */
  const addSlot = useCallback(
    (pageId: string, role: SlotRole, widthMode: WidthMode, prompt = '', customRoleName?: string): void => {
      const region = { ...regionFor(widthMode, geo), y: geo.marginMM }
      const slot = createSlot(role, region, DEFAULT_SLOT_HEIGHT[role])
      if (prompt) slot.prompt = prompt
      if (customRoleName) slot.customRoleName = customRoleName
      // 单次 setDoc：摊平重排（贪心装满，避免碎片空白页）；手动模式直接追加，位置由用户拖拽调整
      if (doc.layoutMode === 'manual') {
        updatePage(pageId, (page) => ({ ...page, slots: [...page.slots, slot] }))
        setSelectedSlotId(slot.id)
        return
      }
      const pages = doc.pages.map((p) =>
        p.id === pageId ? { ...p, slots: [...p.slots, slot] } : p
      )
      const nextPages = repaginateAll(pages)
      setDoc({ ...doc, layoutMode: 'auto', pages: nextPages })
      // 定位新槽位实际所在页（可能因溢出被分到新页）并选中
      const target = nextPages.find((p) => p.slots.some((s) => s.id === slot.id))
      if (target) setCurrentPageId(target.id)
      setSelectedSlotId(slot.id)
    },
    [doc, geo, repaginateAll, updatePage]
  )

  /** 更新槽位（全文档按 slotId 定位）：生成期间溢出重排可能把槽位挪页，
   *  不能用旧 pageId 查找，否则内容写丢失 → UI 永远卡在"生成中" */
  const updateSlot = useCallback((slotId: string, patch: Partial<Slot>): void => {
    setDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.slots.some((s) => s.id === slotId)
          ? { ...p, slots: p.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) }
          : p
      )
    }))
  }, [])

  /** 改宽度模式：重推导 region + 重新流式排布 + 自动分页（手动模式下只改 region 不重排）。
   *  宽度改变可能引发分页移动，改后自动切到该槽位实际所在的页 */
  const setSlotWidth = useCallback(
    (pageId: string, slotId: string, widthMode: WidthMode): void => {
      const region = regionFor(widthMode, geo)
      if (doc.layoutMode === 'manual') {
        updatePage(pageId, (page) => ({
          ...page,
          slots: page.slots.map((s) => (s.id === slotId ? { ...s, region: { ...s.region, ...region } } : s))
        }))
        return
      }
      const pages = doc.pages.map((p) => {
        if (p.id !== pageId) return p
        const slots = p.slots.map((s) =>
          s.id === slotId ? { ...s, region: { ...s.region, ...region } } : s
        )
        return { ...p, slots: slots }
      })
      const nextPages = repaginateAll(pages)
      setDoc({ ...doc, pages: nextPages })
      const target = nextPages.find((p) => p.slots.some((s) => s.id === slotId))
      if (target) setCurrentPageId(target.id)
    },
    [doc, geo, repaginateAll, updatePage]
  )

  /** 槽位实际渲染高度超出预估时回写 overflow（PageView 测量触发）。
   *  自动模式：摊平重排贪心装满；手动模式：只加 overflow 拉高本槽，不动其他槽位 */
  const growSlotOverflow = useCallback(
    (slotId: string, deltaMm: number): void => {
      const pages = doc.pages.map((p) => {
        if (!p.slots.some((s) => s.id === slotId)) return p
        const slots = p.slots.map((s) =>
          s.id === slotId ? { ...s, overflow: (s.overflow ?? 0) + deltaMm } : s
        )
        return { ...p, slots }
      })
      if (doc.layoutMode === 'manual') {
        setDoc({ ...doc, pages })
        return
      }
      const nextPages = repaginateAll(pages)
      setDoc({ ...doc, pages: nextPages })
      // 当前页可能被合并：失效时回退到第一页
      if (!nextPages.some((p) => p.id === currentPageId) && nextPages[0]) {
        setCurrentPageId(nextPages[0].id)
      }
    },
    [doc, currentPageId, geo, repaginateAll]
  )

  /** 切换布局模式：manual = 固化当前自动排布结果（region.y 已含排布坐标），之后用户自由拖拽；
   *  auto = 回到流式排布并重新分页（手动位置放弃） */
  const setMode = useCallback(
    (mode: 'auto' | 'manual'): void => {
      if (mode === doc.layoutMode) return
      if (mode === 'auto') {
        const nextPages = repaginateAll(doc.pages)
        setDoc({ ...doc, layoutMode: 'auto', pages: nextPages })
        if (!nextPages.some((p) => p.id === currentPageId) && nextPages[0]) {
          setCurrentPageId(nextPages[0].id)
        }
        return
      }
      setDoc({ ...doc, layoutMode: 'manual' })
    },
    [doc, currentPageId, repaginateAll]
  )

  /** 手动模式拖拽移动：绝对定位 x/y；拖出本页底部/顶部 → 掉到下一页/上一页（无则钳回本页） */
  const moveSlot = useCallback(
    (slotId: string, x: number, y: number, cross?: 'prev' | 'next'): void => {
      const usable = geo.pageHeightMM - geo.marginMM
      const idx = doc.pages.findIndex((p) => p.slots.some((s) => s.id === slotId))
      if (idx < 0) return
      const slot = doc.pages[idx].slots.find((s) => s.id === slotId)
      if (!slot) return
      const h = slot.estHeight + (slot.overflow ?? 0)
      // 目标页与落点：显式 cross 优先；未带 cross 时拖出页底仍掉下一页
      let targetIdx = idx
      let ty = y
      if (cross === 'prev' && idx > 0) {
        targetIdx = idx - 1
        ty = Math.max(geo.marginMM, usable - h) // 上一页底部
      } else if (cross === 'next' || y + h > usable) {
        targetIdx = idx + 1
        ty = geo.marginMM
      }
      if (targetIdx === idx) {
        updateSlot(slotId, { region: { ...slot.region, x, y } })
        return
      }
      // 跨页：移入目标页（必要时新建）
      const pages = [...doc.pages]
      if (!pages[targetIdx]) pages.push({ id: crypto.randomUUID(), slots: [] })
      const nextPages = pages.map((p, i) => {
        if (i === idx) return { ...p, slots: p.slots.filter((s) => s.id !== slotId) }
        if (i === targetIdx)
          return { ...p, slots: [...p.slots, { ...slot, region: { ...slot.region, x, y: ty } }] }
        return p
      })
      setDoc({ ...doc, pages: nextPages })
      setCurrentPageId(pages[targetIdx].id)
    },
    [doc, geo, updateSlot]
  )

  /** 手动模式拖角缩放：改宽度/高度，钳制在页面物理范围内 */
  const resizeSlot = useCallback(
    (slotId: string, width: number, estHeight: number): void => {
      const slot = doc.pages.flatMap((p) => p.slots).find((s) => s.id === slotId)
      if (!slot) return
      const maxW = 210 - geo.marginMM * 2
      const w = Math.min(maxW, Math.max(40, Math.round(width)))
      const x = Math.min(210 - geo.marginMM - w, Math.max(geo.marginMM, slot.region.x))
      const h = Math.min(geo.pageHeightMM - geo.marginMM * 2, Math.max(15, Math.round(estHeight)))
      // 拖角重新定高后 overflow 清零，字号微调按新高度重新收敛
      updateSlot(slotId, { region: { ...slot.region, x, width: w }, estHeight: h, overflow: 0 })
    },
    [doc, geo, updateSlot]
  )

  const removeSlot = useCallback(
    (pageId: string, slotId: string): void => {
      if (doc.layoutMode === 'manual') {
        updatePage(pageId, (page) => ({ ...page, slots: page.slots.filter((s) => s.id !== slotId) }))
        setSelectedSlotId(null)
        return
      }
      updatePage(pageId, (page) => {
        const slots = flowSlots(page.slots.filter((s) => s.id !== slotId))
        return { ...page, slots }
      })
      setSelectedSlotId(null)
    },
    [doc.layoutMode, updatePage]
  )

  const addPage = useCallback((): void => {
    const page = createEmptyPage()
    setDoc((prev) => ({ ...prev, pages: [...prev.pages, page] }))
    setCurrentPageId(page.id)
  }, [])

  const removePage = useCallback(
    (pageId: string): void => {
      if (doc.pages.length <= 1) return // 至少保留一页
      const idx = doc.pages.findIndex((p) => p.id === pageId)
      const pages = doc.pages.filter((p) => p.id !== pageId)
      setDoc({ ...doc, pages })
      const next = pages[Math.min(idx, pages.length - 1)]
      setCurrentPageId(next.id)
    },
    [doc]
  )

  /** 调整页面顺序：与相邻页交换（dir -1 = 前移，1 = 后移） */
  const movePage = useCallback(
    (pageId: string, dir: -1 | 1): void => {
      const idx = doc.pages.findIndex((p) => p.id === pageId)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= doc.pages.length) return
      const pages = [...doc.pages]
      ;[pages[idx], pages[next]] = [pages[next], pages[idx]]
      setDoc({ ...doc, pages })
    },
    [doc]
  )

  /** 新建文档（清空为单页） */
  const newDoc = useCallback((): void => {
    const fresh = createEmptyDoc()
    setDoc(fresh)
    setCurrentPageId(fresh.pages[0].id)
    setSelectedSlotId(null)
  }, [])

  /** 加载文档（接受 v2 doc 或旧 v1 JSON 字符串，内部统一迁移；
   *  传入常用源库时，旧 sourceIds 会解析为槽位内联源副本） */
  const loadDoc = useCallback((docOrRaw: LayoutDoc | string, sourceLibrary: InfoSource[] = []): void => {
    const next =
      typeof docOrRaw === 'string'
        ? parseLayoutDoc(docOrRaw, sourceLibrary)
        : {
            ...docOrRaw,
            pages: docOrRaw.pages.map((p) => ({
              ...p,
              slots: p.slots.map((s) => migrateSlotSources(s, sourceLibrary))
            }))
          }
    setDoc(next)
    setCurrentPageId(next.pages[0]?.id ?? '')
    setSelectedSlotId(null)
  }, [])

  /** 当前选中的槽位及其所属页（供属性面板使用） */
  const selection = useMemo(() => {
    for (const page of doc.pages) {
      const slot = page.slots.find((s) => s.id === selectedSlotId)
      if (slot) return { page, slot }
    }
    return null
  }, [doc, selectedSlotId])

  return {
    doc,
    docRef,
    selection,
    selectedSlotId,
    currentPageId,
    setCurrentPageId,
    selectSlot: setSelectedSlotId,
    addSlot,
    updateSlot,
    setSlotWidth,
    removeSlot,
    growSlotOverflow,
    setMode,
    moveSlot,
    resizeSlot,
    addPage,
    removePage,
    movePage,
    newDoc,
    loadDoc
  }
}
