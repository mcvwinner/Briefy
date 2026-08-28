import { useCallback, useMemo, useState } from 'react'
import {
  createEmptyDoc,
  createEmptyPage,
  createSlot,
  flowSlots,
  paginate,
  regionFor,
  MARGIN_MM,
  DEFAULT_SLOT_HEIGHT,
  type LayoutDoc,
  type Page,
  type Slot,
  type SlotRole,
  type WidthMode
} from '../../../shared/layout'
import { parseLayoutDoc } from '../../../shared/layout'

/** 排版文档的全部操作：槽位增删改、多页管理、文档级操作 */
export function useLayout() {
  const [doc, setDoc] = useState<LayoutDoc>(createEmptyDoc)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [currentPageId, setCurrentPageId] = useState<string>(() => doc.pages[0].id)

  const updatePage = useCallback((pageId: string, updater: (page: Page) => Page) => {
    setDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? updater(p) : p))
    }))
  }, [])

  /** 添加槽位：选角色 + 宽度模式，自动流式排布 + 自动分页 */
  const addSlot = useCallback(
    (pageId: string, role: SlotRole, widthMode: WidthMode, prompt = ''): void => {
      updatePage(pageId, (page) => {
        const region = { ...regionFor(widthMode), y: MARGIN_MM }
        const slot = createSlot(role, region, DEFAULT_SLOT_HEIGHT[role])
        slot.prompt = prompt
        const flowed = flowSlots([...page.slots, slot])
        return { ...page, slots: flowed }
      })
      // 触发全局自动分页整理
      setDoc((prev) => ({ ...prev, pages: paginate(prev.pages) }))
    },
    [updatePage]
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

  /** 改宽度模式：重推导 region + 重新流式排布 */
  const setSlotWidth = useCallback(
    (pageId: string, slotId: string, widthMode: WidthMode): void => {
      updatePage(pageId, (page) => {
        const region = regionFor(widthMode)
        const slots = page.slots.map((s) =>
          s.id === slotId ? { ...s, region: { ...s.region, ...region } } : s
        )
        return { ...page, slots: flowSlots(slots) }
      })
      setDoc((prev) => ({ ...prev, pages: paginate(prev.pages) }))
    },
    [updatePage]
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
    setDoc((prev) => {
      const page = createEmptyPage()
      setCurrentPageId(page.id)
      return { ...prev, pages: [...prev.pages, page] }
    })
  }, [])

  const removePage = useCallback((pageId: string): void => {
    setDoc((prev) => {
      if (prev.pages.length <= 1) return prev // 至少保留一页
      const idx = prev.pages.findIndex((p) => p.id === pageId)
      const pages = prev.pages.filter((p) => p.id !== pageId)
      const next = pages[Math.min(idx, pages.length - 1)]
      setCurrentPageId(next.id)
      return { ...prev, pages }
    })
  }, [])

  /** 新建文档（清空为单页） */
  const newDoc = useCallback((): void => {
    const fresh = createEmptyDoc()
    setDoc(fresh)
    setCurrentPageId(fresh.pages[0].id)
    setSelectedSlotId(null)
  }, [])

  /** 加载文档（接受 v2 doc 或旧 v1 JSON 字符串，内部统一迁移） */
  const loadDoc = useCallback((docOrRaw: LayoutDoc | string): void => {
    const next =
      typeof docOrRaw === 'string' ? parseLayoutDoc(docOrRaw) : docOrRaw
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
    addPage,
    removePage,
    newDoc,
    loadDoc
  }
}
