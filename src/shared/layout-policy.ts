import type { LayoutDoc, Slot } from './layout'

/** 面向用户的版式策略；底层继续复用 v2 的 manual/auto，避免设计文件升级。 */
export type LayoutPolicy = 'fixed' | 'flow'

export function resolveLayoutPolicy(doc: Pick<LayoutDoc, 'layoutMode'>): LayoutPolicy {
  return doc.layoutMode === 'manual' ? 'fixed' : 'flow'
}

export interface GeometrySnapshot {
  pageIds: string[]
  slots: {
    id: string
    pageId: string
    x: number
    y: number
    width: number
    estHeight: number
    overflow: number
  }[]
}

/** 固定版式的权威几何快照：内容与状态变化不参与比较。 */
export function snapshotGeometry(doc: LayoutDoc): GeometrySnapshot {
  return {
    pageIds: doc.pages.map((page) => page.id),
    slots: doc.pages.flatMap((page) =>
      page.slots.map((slot) => ({
        id: slot.id,
        pageId: page.id,
        x: slot.region.x,
        y: slot.region.y,
        width: slot.region.width,
        estHeight: slot.estHeight,
        overflow: slot.overflow ?? 0
      }))
    )
  }
}

export function geometryEquals(a: GeometrySnapshot, b: GeometrySnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 固定版式保险丝：若异步测量或旧逻辑意外改了几何，用生成前骨架恢复，
 * 同时保留最新内容、状态、提示词等非几何字段。
 */
export function enforceFixedGeometry(before: LayoutDoc, latest: LayoutDoc): LayoutDoc {
  const currentSlots = new Map(latest.pages.flatMap((page) => page.slots).map((slot) => [slot.id, slot]))
  return {
    ...latest,
    layoutMode: 'manual',
    pages: before.pages.map((page) => ({
      ...page,
      slots: page.slots.map((original) => {
        const current = currentSlots.get(original.id) ?? original
        return {
          ...current,
          region: { ...original.region },
          estHeight: original.estHeight,
          ...(original.overflow === undefined ? { overflow: undefined } : { overflow: original.overflow })
        }
      })
    }))
  }
}

/** 内容指纹用于拒绝上一稿留下的过期渲染测量。 */
export function contentKey(content?: string): string {
  const value = content ?? ''
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`
}

export function slotHeight(slot: Pick<Slot, 'estHeight' | 'overflow'>): number {
  return slot.estHeight + (slot.overflow ?? 0)
}
