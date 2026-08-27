import { useCallback, useMemo, useState } from 'react'
import {
  createBlock,
  createEmptyDoc,
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
    setDoc((prev) => ({ ...prev, pages: [...prev.pages, createEmptyPage()] }))
  }, [])

  const removePage = useCallback((pageId: string): void => {
    setDoc((prev) => {
      if (prev.pages.length <= 1) return prev // 至少保留一页
      return { ...prev, pages: prev.pages.filter((p) => p.id !== pageId) }
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

  return {
    doc,
    selection,
    selectedBlockId,
    selectBlock: setSelectedBlockId,
    addBlock,
    updateBlock,
    removeBlock,
    addPage,
    removePage
  }
}
