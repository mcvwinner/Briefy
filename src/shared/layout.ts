import type { AiSettings, InfoSource } from './settings'

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
  /** 本槽位挂载的信息源（内联副本，随文档/预设保存；生成时主进程直接抓取） */
  sources: InfoSource[]
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
    sources: [],
    status: 'empty'
  }
}

// ---------- 版式规则：区域推导 ----------

/** A4 页边距与内容宽度（内置默认；用户版式偏好可通过 resolveGeometry 覆盖） */
export const MARGIN_MM = 15
export const CONTENT_WIDTH_MM = 210 - MARGIN_MM * 2 // 180
export const PAGE_HEIGHT_MM = 297
export const SLOT_GAP_MM = 8

/** 槽位宽度类型（用户一键切换） */
export type WidthMode = 'full' | 'half-left' | 'half-right' | 'sidebar'

/** 版式几何：由用户偏好解析出的流式排布/分页常量（P6a） */
export interface LayoutGeometry {
  marginMM: number
  gapMM: number
  contentWidthMM: number
  pageHeightMM: number
}

/** 由版式偏好解析几何（缺省 = 内置默认，保证既有稳定体验）；越界值回落默认 */
export function resolveGeometry(prefs?: { marginMM?: number; gapMM?: number }): LayoutGeometry {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
  const margin = prefs?.marginMM !== undefined ? clamp(prefs.marginMM, 10, 25) : MARGIN_MM
  const gap = prefs?.gapMM !== undefined ? clamp(prefs.gapMM, 4, 12) : SLOT_GAP_MM
  return {
    marginMM: margin,
    gapMM: gap,
    contentWidthMM: 210 - margin * 2,
    pageHeightMM: PAGE_HEIGHT_MM
  }
}

/** 由宽度模式推导 region.x / region.width（可传入几何以适配自定义页边距） */
export function regionFor(
  widthMode: WidthMode,
  geo: LayoutGeometry = resolveGeometry()
): { x: number; width: number } {
  const margin = geo.marginMM
  const content = geo.contentWidthMM
  switch (widthMode) {
    case 'half-left':
      return { x: margin, width: content / 2 - 4 }
    case 'half-right':
      return { x: margin + content / 2 + 4, width: content / 2 - 4 }
    case 'sidebar':
      return { x: 210 - margin - 55, width: 55 }
    case 'full':
    default:
      return { x: margin, width: content }
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
 * geo 缺省 = 内置默认几何。返回更新后的槽位数组（原数组不修改）。
 */
export function flowSlots(slots: Slot[], geo: LayoutGeometry = resolveGeometry()): Slot[] {
  const columnTails = new Map<number, number>() // 列标识 → 底部 y
  const columnKey = (s: Slot): number => Math.round(s.region.x / 10) // 10mm 精度同列
  return slots.map((slot) => {
    const key = columnKey(slot)
    const prevTail = columnTails.get(key)
    const y = prevTail !== undefined ? prevTail + geo.gapMM : geo.marginMM
    const bottom = y + slot.estHeight + (slot.overflow ?? 0)
    columnTails.set(key, bottom)
    return { ...slot, region: { ...slot.region, y } }
  })
}

/**
 * 列内装填：按顺序逐槽尝试放进当前列（列尾 + 高度不超页则入本页并推进列尾）。
 * 放不下的槽位进 overflow，但**不推进列尾**——后续同列更小的槽位仍有机会装入本页，
 * 消除"一个大槽位堵住整列"造成的碎片空白（报纸装填语义：小条目先排，大文章跨页）。
 */
function packSlots(
  slots: Slot[],
  geo: LayoutGeometry
): { kept: Slot[]; overflow: Slot[] } {
  const tails = new Map<number, number>()
  const kept: Slot[] = []
  const overflow: Slot[] = []
  const limit = geo.pageHeightMM - geo.marginMM
  for (const slot of slots) {
    const key = Math.round(slot.region.x / 10)
    const y = tails.get(key) ?? geo.marginMM
    const h = slot.estHeight + (slot.overflow ?? 0)
    if (y + h <= limit || kept.length === 0) {
      kept.push({ ...slot, region: { ...slot.region, y } })
      tails.set(key, y + h)
    } else {
      overflow.push(slot)
    }
  }
  return { kept, overflow }
}

/**
 * 自动分页：把页面装不下的槽位搬到新页。
 * 使用列内装填（packSlots）：放不下的大槽位不阻塞同列后续小槽位装入本页。
 * 搬入新页后重新流式排布；若新页仍溢出则继续拆分（收敛循环，保底轮次防意外）。
 */
export function paginate(pages: Page[], geo: LayoutGeometry = resolveGeometry()): Page[] {
  const result: Page[] = []
  for (const page of pages) {
    let current: Page = { ...page, slots: page.slots }
    for (let round = 0; round < 50; round++) {
      const { kept, overflow } = packSlots(current.slots, geo)
      if (overflow.length === 0) {
        result.push({ ...current, slots: kept })
        break
      }
      result.push({ ...current, slots: kept })
      current = { id: crypto.randomUUID(), slots: flowSlots(overflow, geo) }
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
    sources: [],
    status: 'empty'
  }
}

/** 信息源归一化：新格式（内联 sources）原样保留；旧格式槽位的 sourceIds 从常用源库解析为内联副本（失效 id 丢弃） */
export function migrateSlotSources<T extends Slot>(slot: T, library: InfoSource[]): T {
  if (Array.isArray((slot as { sources?: unknown }).sources)) return slot
  const ids = (slot as unknown as { sourceIds?: string[] }).sourceIds ?? []
  const sources = ids
    .map((id) => library.find((s) => s.id === id))
    .filter((s): s is InfoSource => Boolean(s))
  return { ...slot, sources }
}

/** 解析 .briefy 文件内容：v2 直读（sourceIds 旧字段从常用源库迁移），v1 迁移 */
export function parseLayoutDoc(raw: string, sourceLibrary: InfoSource[] = []): LayoutDoc {
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error('不是有效的 Briefy 设计文件')
  const doc = data as { version?: number; title?: string; pages?: unknown[] }
  if (!Array.isArray(doc.pages)) throw new Error('设计文件缺少页面数据')

  if (doc.version === 2) {
    return {
      version: 2,
      title: doc.title ?? '未命名报纸',
      pages: (doc.pages as Page[]).map((p) => ({
        ...p,
        slots: (p.slots ?? []).map((s) => migrateSlotSources(s, sourceLibrary))
      }))
    }
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
