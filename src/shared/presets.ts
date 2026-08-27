import type { LayoutDoc, Page } from './layout'
import { createEmptyPage } from './layout'

/** 单个预设区块定义（mm 坐标） */
interface PresetBlock {
  prompt: string
  kind: 'text' | 'text-image' | 'table' | 'image'
  x: number
  y: number
  width: number
  height: number
}

/** 排版预设：一键套用的报纸模板 */
export interface Preset {
  id: string
  name: string
  description: string
  /** 提示词里的 {date} 由生成时的工具结果替换说明占位——这里只放主题描述 */
  pages: PresetBlock[][]
}

function buildPage(blocks: PresetBlock[]): Page {
  const page = createEmptyPage()
  page.blocks = blocks.map((b) => ({
    id: crypto.randomUUID(),
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    prompt: b.prompt,
    kind: b.kind,
    status: 'empty' as const
  }))
  return page
}

export const PRESETS: Preset[] = [
  {
    id: 'tech-daily',
    name: '每日科技报',
    description: '头条 + 深度 + 快讯列表，适合每天追踪科技动态',
    pages: [
      [
        { prompt: '今日最重要的科技新闻头条，突出事件本身与影响，200 字', kind: 'text', x: 15, y: 15, width: 120, height: 55 },
        { prompt: '配一张体现该新闻主题的新闻感插图', kind: 'image', x: 140, y: 15, width: 55, height: 55 },
        { prompt: '今日 AI 领域最新进展综述，包含两家以上公司动态，250 字', kind: 'text', x: 15, y: 80, width: 180, height: 70 },
        { prompt: '近三天热门科技公司财报或产品发布汇总表（公司/事件/要点三列）', kind: 'table', x: 15, y: 160, width: 180, height: 60 },
        { prompt: '今日科技圈三条快讯，每条一句话', kind: 'text', x: 15, y: 230, width: 180, height: 50 }
      ]
    ]
  },
  {
    id: 'finance-daily',
    name: '财经日报',
    description: '市场概览 + 板块行情表 + 个股点评',
    pages: [
      [
        { prompt: '今日全球主要股市表现概览（美/港/A股），150 字', kind: 'text', x: 15, y: 15, width: 90, height: 65 },
        { prompt: '今日人民币汇率与金价走势简评，120 字', kind: 'text', x: 110, y: 15, width: 85, height: 65 },
        { prompt: '今日领涨领跌板块统计表（板块/涨跌幅/代表个股）', kind: 'table', x: 15, y: 90, width: 180, height: 70 },
        { prompt: '一则值得关注的财经大事深度解读，250 字', kind: 'text', x: 15, y: 170, width: 120, height: 110 },
        { prompt: '一张体现当前市场情绪的概念图', kind: 'image', x: 140, y: 170, width: 55, height: 110 }
      ]
    ]
  },
  {
    id: 'weekly-personal',
    name: '个人周报',
    description: '本周回顾 + 下周计划 + 学习笔记，适合个人复盘',
    pages: [
      [
        { prompt: '本周完成事项回顾总结，列表式呈现，150 字', kind: 'text', x: 15, y: 15, width: 87, height: 80 },
        { prompt: '下周计划安排，按优先级排列，130 字', kind: 'text', x: 108, y: 15, width: 87, height: 80 },
        { prompt: '本周学到的一个新知识或技能笔记，200 字', kind: 'text', x: 15, y: 105, width: 180, height: 75 },
        { prompt: '记录一件本周值得记住的事，带一点感性表达，150 字', kind: 'text', x: 15, y: 190, width: 120, height: 90 },
        { prompt: '一张代表本周心情的治愈系插画', kind: 'image', x: 140, y: 190, width: 55, height: 90 }
      ]
    ]
  }
]

/** 由预设构建完整 LayoutDoc */
export function buildDocFromPreset(preset: Preset): LayoutDoc {
  return {
    version: 1,
    title: preset.name,
    pages: preset.pages.map(buildPage)
  }
}
