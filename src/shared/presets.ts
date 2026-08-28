import type { LayoutDoc, Page, Slot, SlotRole, ToolId } from './layout'
import {
  DEFAULT_SLOT_HEIGHT,
  flowSlots,
  regionFor,
  type WidthMode
} from './layout'

/** 槽位模板定义（预设的一格） */
interface SlotSpec {
  role: SlotRole
  width: WidthMode
  prompt: string
  kind?: 'text' | 'table'
  tools?: ToolId[]
  estHeight?: number
}

/** 内置排版预设：槽位化模板（v2） */
export interface Preset {
  id: string
  name: string
  description: string
  slots: SlotSpec[]
}

/** 各角色默认工具：内容类需要联网取事实，提示/自定义仅时间即可 */
export function defaultToolsFor(role: SlotRole): ToolId[] {
  switch (role) {
    case 'headline':
    case 'body':
    case 'briefs':
      return ['getCurrentTime', 'webSearch', 'fetchPage']
    case 'stats':
      return ['getCurrentTime', 'webSearch']
    default:
      return ['getCurrentTime']
  }
}

function buildSlots(specs: SlotSpec[]): Slot[] {
  const slots: Slot[] = specs.map((spec) => {
    const region = { ...regionFor(spec.width), y: 0 } // y 由 flowSlots 统一计算
    const role = spec.role
    return {
      id: crypto.randomUUID(),
      role,
      region,
      estHeight: spec.estHeight ?? DEFAULT_SLOT_HEIGHT[role],
      kind: spec.kind ?? 'text',
      prompt: spec.prompt,
      tools: spec.tools ?? defaultToolsFor(role),
      sources: [],
      status: 'empty' as const
    }
  })
  return flowSlots(slots)
}

function buildPages(specs: SlotSpec[]): Page[] {
  return [{ id: crypto.randomUUID(), slots: buildSlots(specs) }]
}

export const PRESETS: Preset[] = [
  {
    id: 'tech-daily',
    name: '每日科技报',
    description: '头条 + 数据 + 正文双栏 + 快讯，适合每天追踪科技动态',
    slots: [
      { role: 'headline', width: 'full', prompt: '今日最重要的科技新闻头条，突出事件本身与影响，200 字' },
      { role: 'stats', width: 'full', prompt: '今日科技行业 2-3 个关键数据（融资额/涨幅/发布量等）' },
      { role: 'body', width: 'half-left', prompt: '今日 AI 领域最新进展综述，包含两家以上公司动态，250 字' },
      { role: 'body', width: 'half-right', prompt: '今日科技政策或行业大事件深度解读，250 字' },
      { role: 'briefs', width: 'full', prompt: '今日科技圈五条快讯，每条一句话', estHeight: 50 }
    ]
  },
  {
    id: 'finance-daily',
    name: '财经日报',
    description: '市场概览双栏 + 行情表 + 深度解读',
    slots: [
      { role: 'headline', width: 'full', prompt: '今日全球市场定调：一句话概括美/港/A 股主线，150 字' },
      { role: 'stats', width: 'half-left', prompt: '今日人民币汇率、金价、原油三个关键价格' },
      { role: 'body', width: 'half-right', prompt: '今日人民币汇率与金价走势简评，120 字' },
      { role: 'body', width: 'full', prompt: '今日领涨领跌板块统计表（板块/涨跌幅/代表个股）', kind: 'table', estHeight: 60 },
      { role: 'body', width: 'full', prompt: '一则值得关注的财经大事深度解读，250 字' }
    ]
  },
  {
    id: 'weekly-personal',
    name: '个人周报',
    description: '本周回顾 + 下周计划 + 学习笔记，适合个人复盘',
    slots: [
      { role: 'headline', width: 'full', prompt: '本周总结导语：一句话定调这一周，80 字' },
      { role: 'body', width: 'half-left', prompt: '本周完成事项回顾总结，列表式呈现，150 字' },
      { role: 'body', width: 'half-right', prompt: '下周计划安排，按优先级排列，130 字' },
      { role: 'briefs', width: 'full', prompt: '本周学到的三个新知识/技能，每条一句话', estHeight: 45 },
      { role: 'notice', width: 'full', prompt: '给下周自己的一句提醒或鼓励', estHeight: 20 }
    ]
  }
]

/** 由预设构建完整 LayoutDoc（v2） */
export function buildDocFromPreset(preset: Preset): LayoutDoc {
  const pages: Page[] = buildPages(preset.slots)
  return { version: 2, title: preset.name, pages }
}

// 保留类型导出，供 App 里类型标注
export type { Slot }
