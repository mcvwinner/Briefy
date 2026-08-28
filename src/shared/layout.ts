import type { AiSettings } from './settings'

/**
 * 槽位化数据模型（v2）——Block 体系的替代者。
 * 版面 = 槽位声明表；槽位有角色职责，高度自适应，AI 按角色领任务。
 */

/** 区块槽位角色：AI 按角色理解职责 */
export type SlotRole = 'headline' | 'body' | 'stats' | 'briefs' | 'notice' | 'custom'

/** 各角色的职责描述（喂给 AI 的单一事实源） */
export const ROLE_DEFS: Record<SlotRole, { name: string; duty: string }> = {
  headline: { name: '头条', duty: '全宽镇版头条：写最有分量的导语，克制而有力，不要细节堆砌。' },
  body: { name: '正文', duty: '深度正文：可用 ## 小标题分段展开，与头条内容承接但不重复。' },
  stats: { name: '数据', duty: '数据窗口：优先用 :::stat 统计卡呈现 2-3 个关键数字，少写散文。' },
  briefs: { name: '快讯', duty: '快讯栏：每条一句话，用 **日期/主体** 开头，短促密集。' },
  notice: { name: '提示框', duty: '整格提示/声明：适合 :::info 控件，语气单一明确。' },
  custom: { name: '自定义', duty: '' }
}

/** 槽位内容形式 */
export type SlotKind = 'text' | 'table'

/** 内容生成状态 */
export type SlotStatus = 'empty' | 'generating' | 'done' | 'error'

/** 本轮内置的 AI 工具标识 */
export type ToolId = 'getCurrentTime' | 'webSearch' | 'fetchPage'

/** 槽位：版面上一个有职责的区域 */
export interface Slot {
  id: string
  role: SlotRole
  /** 版面位置（mm）。宽度参与版式推导，高度仅作预估（内容自适应） */
  region: { x: number; y: number; width: number }
  /** 预估高度（mm），用于流式排布与分页计算；内容溢出时生成后写回 overflow */
  estHeight: number
  kind: SlotKind
  /** 槽位级提示词：这一格"要什么" */
  prompt: string
  /** 允许此槽位使用的 AI 工具 */
  tools: ToolId[]
  /** 关联的信息源 ID 列表（生成时主进程抓取源内容注入提示词） */
  sourceIds: string[]
  /** AI 产出：控件协议文本 */
  content?: string
  status: SlotStatus
  /** AI 内容超出预估高度的延展量（mm），生成后写回 */
  overflow?: number
}

/** 一页 A4：槽位声明表 */
export interface Page {
  id: string
  slots: Slot[]
}

/** 设计文档 v2（保存即 .briefy 文件内容） */
export interface LayoutDoc {
  version: 2
  title: string
  pages: Page[]
}

/** 全局应用状态文档：设置 + 排版 */
export interface BriefyDoc {
  settings: AiSettings
  layout: LayoutDoc
}

// ---------- 工厂 ----------

export function createEmptyPage(): Page {
  return { id: crypto.randomUUID(), slots: [] }
}

export function createEmptyDoc(): LayoutDoc {
  return { version: 2, title: '未命名报纸', pages: [createEmptyPage()] }
}

export function createSlot(role: SlotRole, region: Slot['region'], estHeight: number): Slot {
  return {
    id: crypto.randomUUID(),
    role,
    region,
    estHeight,
    kind: 'text',
    prompt: '',
    tools: ['getCurrentTime'],
    sourceIds: [],
    status: 'empty'
  }
}

// ---------- 版式规则：区域推导 ----------

/** A4 页边距与内容宽度 */
export const MARGIN_MM = 15
export const CONTENT_WIDTH_MM = 210 - MARGIN_MM * 2 // 180
export const PAGE_HEIGHT_MM = 297
export const SLOT_GAP_MM = 8

/** 槽位宽度类型（用户一键切换） */
export type WidthMode = 'full' | 'half-left' | 'half-right' | 'sidebar'

/** 由宽度模式推导 region.x / region.width */
export function regionFor(widthMode: WidthMode): { x: number; width: number } {
  switch (widthMode) {
    case 'half-left':
      return { x: MARGIN_MM, width: CONTENT_WIDTH_MM / 2 - 4 }
    case 'half-right':
      return { x: MARGIN_MM + CONTENT_WIDTH_MM / 2 + 4, width: CONTENT_WIDTH_MM / 2 - 4 }
    case 'sidebar':
      return { x: 210 - MARGIN_MM - 55, width: 55 }
    case 'full':
    default:
      return { x: MARGIN_MM, width: CONTENT_WIDTH_MM }
  }
}

/** 各角色的默认预估高度（mm） */
export const DEFAULT_SLOT_HEIGHT: Record<SlotRole, number> = {
  headline: 45,
  body: 90,
  stats: 35,
  briefs: 60,
  notice: 25,
  custom: 45
}

/**
 * 把槽位按列分组并纵向流式排布：同列的下一个槽位 y = 上一个 y + 实际高度 + 间距。
 * 返回更新后的槽位数组（原数组不修改）。
 */
export function flowSlots(slots: Slot[]): Slot[] {
  const columnTails = new Map<number, number>() // 列标识 → 底部 y
  const columnKey = (s: Slot): number => Math.round(s.region.x / 10) // 10mm 精度同列
  return slots.map((slot) => {
    const key = columnKey(slot)
    const prevTail = columnTails.get(key)
    const y = prevTail !== undefined ? prevTail + SLOT_GAP_MM : MARGIN_MM
    const bottom = y + slot.estHeight + (slot.overflow ?? 0)
    columnTails.set(key, bottom)
    return { ...slot, region: { ...slot.region, y } }
  })
}

/**
 * 自动分页：把底部（y + 高度）超出页面可容纳范围的槽位搬到新页。
 * 槽位的 y 由 flowSlots 按列排布，多栏下各列 y 独立流动，
 * 因此直接用槽位自身 bottom 判断溢出，而不是单栏游标累加（后者会误判另一栏的槽位）。
 * 搬入新页后重新流式排布；若新页仍溢出则继续拆分（收敛循环，保底轮次防意外）。
 */
export function paginate(pages: Page[]): Page[] {
  const result: Page[] = []
  const limit = PAGE_HEIGHT_MM - MARGIN_MM
  for (const page of pages) {
    let current: Page = { ...page, slots: flowSlots(page.slots) }
    for (let round = 0; round < 50; round++) {
      const kept: Slot[] = []
      const overflow: Slot[] = []
      for (const slot of current.slots) {
        const bottom = slot.region.y + slot.estHeight + (slot.overflow ?? 0)
        if (bottom <= limit || kept.length === 0) {
          kept.push(slot)
        } else {
          overflow.push(slot)
        }
      }
      if (overflow.length === 0) {
        result.push(current)
        break
      }
      result.push({ ...current, slots: kept })
      current = { id: crypto.randomUUID(), slots: flowSlots(overflow) }
      if (round === 49) result.push(current) // 保底：达到轮次上限直接收尾
    }
  }
  return result
}

// ---------- 旧格式迁移 ----------

/** 旧版 Block（v1）最小结构 */
interface LegacyBlock {
  id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  prompt?: string
  kind?: string
  tools?: string[]
}

/** 从旧版 .briefy（v1 blocks）迁移为 v2 Slot */
function migrateBlock(b: LegacyBlock): Slot {
  const height = typeof b.height === 'number' ? b.height : 45
  return {
    id: b.id ?? crypto.randomUUID(),
    role: 'custom',
    region: {
      x: typeof b.x === 'number' ? b.x : MARGIN_MM,
      y: typeof b.y === 'number' ? b.y : MARGIN_MM,
      width: typeof b.width === 'number' ? b.width : CONTENT_WIDTH_MM
    },
    estHeight: height,
    kind: b.kind === 'table' ? 'table' : 'text',
    prompt: typeof b.prompt === 'string' ? b.prompt : '',
    tools: Array.isArray(b.tools) ? (b.tools.filter((t) => t !== 'readReference') as ToolId[]) : ['getCurrentTime'],
    sourceIds: [],
    status: 'empty'
  }
}

/** 解析 .briefy 文件内容：v2 直读，v1 迁移 */
export function parseLayoutDoc(raw: string): LayoutDoc {
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error('不是有效的 Briefy 设计文件')
  const doc = data as { version?: number; title?: string; pages?: unknown[] }
  if (!Array.isArray(doc.pages)) throw new Error('设计文件缺少页面数据')

  if (doc.version === 2) {
    return { version: 2, title: doc.title ?? '未命名报纸', pages: doc.pages as Page[] }
  }
  if (doc.version === 1) {
    // v1: pages[].blocks[] → v2: pages[].slots[]
    return {
      version: 2,
      title: doc.title ?? '未命名报纸',
      pages: (doc.pages as { blocks?: LegacyBlock[] }[]).map((p) => ({
        id: crypto.randomUUID(),
        slots: Array.isArray(p.blocks) ? p.blocks.map(migrateBlock) : []
      }))
    }
  }
  throw new Error('设计文件版本不受支持')
}
