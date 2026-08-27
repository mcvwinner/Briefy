import { useCallback, useMemo, useState } from 'react'
import {
  createBlock,
  createEmptyDoc,
  createEmptyPage,
  type Block,
  type LayoutDoc,
  type Page
} from '../../../shared/layout'

/** A4 页面尺寸（mm） */
export const PAGE_WIDTH_MM = 210
export const PAGE_HEIGHT_MM = 297

/** 最小区块尺寸（mm），防止拖出不可见区块 */
const MIN_BLOCK_MM = 15

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 排版文档的全部操作：增删改区块、多页管理 */
export function useLayout() {
  const [doc, setDoc] = useState<LayoutDoc>(createEmptyDoc)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [currentPageId, setCurrentPageId] = useState<string>(() => doc.pages[0].id)

  const updatePage = useCallback((pageId: string, updater: (page: Page) => Page) => {
    setDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? updater(p) : p))
    }))
  }, [])

  const addBlock = useCallback(
    (pageId: string, x: number, y: number, width: number, height: number): void => {
      const block = createBlock(
        clamp(x, 0, PAGE_WIDTH_MM - MIN_BLOCK_MM),
        clamp(y, 0, PAGE_HEIGHT_MM - MIN_BLOCK_MM),
        clamp(width, MIN_BLOCK_MM, PAGE_WIDTH_MM),
        clamp(height, MIN_BLOCK_MM, PAGE_HEIGHT_MM)
      )
      updatePage(pageId, (page) => ({ ...page, blocks: [...page.blocks, block] }))
      setSelectedBlockId(block.id)
    },
    [updatePage]
  )

  const updateBlock = useCallback(
    (pageId: string, blockId: string, patch: Partial<Block>): void => {
      updatePage(pageId, (page) => ({
        ...page,
        blocks: page.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b))
      }))
    },
    [updatePage]
  )

  const removeBlock = useCallback(
    (pageId: string, blockId: string): void => {
      updatePage(pageId, (page) => ({
        ...page,
        blocks: page.blocks.filter((b) => b.id !== blockId)
      }))
      setSelectedBlockId(null)
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
      // 若删除的是当前页，跳到相邻页
      const next = pages[Math.min(idx, pages.length - 1)]
      setCurrentPageId(next.id)
      return { ...prev, pages }
    })
  }, [])

  /** 当前选中的区块及其所属页（供属性面板使用） */
  const selection = useMemo(() => {
    for (const page of doc.pages) {
      const block = page.blocks.find((b) => b.id === selectedBlockId)
      if (block) return { page, block }
    }
    return null
  }, [doc, selectedBlockId])

  /** 新建文档（清空为单页） */
  const newDoc = useCallback((): void => {
    const fresh = createEmptyDoc()
    setDoc(fresh)
    setCurrentPageId(fresh.pages[0].id)
    setSelectedBlockId(null)
  }, [])

  /** 加载文档（打开 .briefy 文件后整体替换） */
  const loadDoc = useCallback((next: LayoutDoc): void => {
    setDoc(next)
    setCurrentPageId(next.pages[0]?.id ?? '')
    setSelectedBlockId(null)
  }, [])

  return {
    doc,
    selection,
    selectedBlockId,
    currentPageId,
    setCurrentPageId,
    selectBlock: setSelectedBlockId,
    addBlock,
    updateBlock,
    removeBlock,
    addPage,
    removePage,
    newDoc,
    loadDoc
  }
}
