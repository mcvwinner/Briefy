import { useCallback, useMemo, useState } from 'react'
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

  /** 添加槽位：选角色 + 宽度模式，自动流式排布 + 自动分页。
   *  分页可能把新槽位挤到新页，添加后自动切到它实际所在的页并选中（否则用户以为没生效） */
  const addSlot = useCallback(
    (pageId: string, role: SlotRole, widthMode: WidthMode, prompt = ''): void => {
      const region = { ...regionFor(widthMode, geo), y: geo.marginMM }
      const slot = createSlot(role, region, DEFAULT_SLOT_HEIGHT[role])
      if (prompt) slot.prompt = prompt
      // 单次 setDoc：摊平重排（贪心装满，避免碎片空白页）
      const pages = doc.pages.map((p) =>
        p.id === pageId ? { ...p, slots: [...p.slots, slot] } : p
      )
      const nextPages = repaginateAll(pages)
      setDoc({ ...doc, pages: nextPages })
      // 定位新槽位实际所在页（可能因溢出被分到新页）并选中
      const target = nextPages.find((p) => p.slots.some((s) => s.id === slot.id))
      if (target) setCurrentPageId(target.id)
      setSelectedSlotId(slot.id)
    },
    [doc, geo, repaginateAll]
  )

  const updateSlot = useCallback(
    (pageId: string, slotId: string, patch: Partial<Slot>): void => {
      updatePage(pageId, (page) => ({
        ...page,
        slots: page.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s))
      }))
    },
    [updatePage]
  )

  /** 改宽度模式：重推导 region + 重新流式排布 + 自动分页。
   *  宽度改变可能引发分页移动，改后自动切到该槽位实际所在的页 */
  const setSlotWidth = useCallback(
    (pageId: string, slotId: string, widthMode: WidthMode): void => {
      const region = regionFor(widthMode, geo)
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
    [doc, geo, repaginateAll]
  )

  /** 槽位实际渲染高度超出预估时回写 overflow（PageView 测量触发），
   *  摊平重排贪心装满：内容总量装得下 N 页就仍排 N 页，不再产生碎片空白页 */
  const growSlotOverflow = useCallback(
    (slotId: string, deltaMm: number): void => {
      const pages = doc.pages.map((p) => {
        if (!p.slots.some((s) => s.id === slotId)) return p
        const slots = p.slots.map((s) =>
          s.id === slotId ? { ...s, overflow: (s.overflow ?? 0) + deltaMm } : s
        )
        return { ...p, slots }
      })
      const nextPages = repaginateAll(pages)
      setDoc({ ...doc, pages: nextPages })
      // 当前页可能被合并：失效时回退到第一页
      if (!nextPages.some((p) => p.id === currentPageId) && nextPages[0]) {
        setCurrentPageId(nextPages[0].id)
      }
    },
    [doc, currentPageId, geo, repaginateAll]
  )

  const removeSlot = useCallback(
    (pageId: string, slotId: string): void => {
      updatePage(pageId, (page) => {
        const slots = flowSlots(page.slots.filter((s) => s.id !== slotId))
        return { ...page, slots }
      })
      setSelectedSlotId(null)
    },
    [updatePage]
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
    addPage,
    removePage,
    newDoc,
    loadDoc
  }
}
