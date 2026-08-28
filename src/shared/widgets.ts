/**
 * 预制控件协议（Widget Protocol）——共享定义
 * AI 提示词、语法解析器、渲染层共用此注册表，保证三端一致。
 */

/** 控件标识（与标记名一致：:::stat → stat） */
export type WidgetId = 'stat' | 'quote' | 'info' | 'timeline' | 'image' | 'qrcode' | 'toc' | 'chart'

/** 控件参数（键值对，渲染组件与用户表单共用） */
export type WidgetParams = Record<string, string>

/** 控件元数据：一个定义管三端 */
export interface WidgetDef {
  id: WidgetId
  /** 中文名（AI 提示词与 UI 展示） */
  name: string
  /** 用途描述（喂给 AI：何时选用此控件） */
  usage: string
  /** 参数表：键 → 说明（AI 按此填值；属性面板按此生成表单） */
  params: Record<string, { desc: string; example: string }>
}

/** 控件注册表（新增控件只需在此登记） */
export const WIDGET_REGISTRY: Record<WidgetId, WidgetDef> = {
  stat: {
    id: 'stat',
    name: '统计卡',
    usage: '展示一个关键数字或指标，配简短说明。适合行情、涨幅、核心数据。',
    params: {
      label: { desc: '指标名称', example: '沪指涨幅' },
      value: { desc: '数值（可含正负号与%）', example: '+1.2%' },
      trend: { desc: '趋势：up/down/flat', example: 'up' },
      note: { desc: '一句话补充说明', example: '创近月新高' }
    }
  },
  quote: {
    id: 'quote',
    name: '引用块',
    usage: '展示人物观点、名言或关键表态，增强权威感与节奏。',
    params: {
      text: { desc: '引语正文', example: '市场底色仍是结构性行情' },
      source: { desc: '来源（人名/机构）', example: '某券商首席' }
    }
  },
  info: {
    id: 'info',
    name: '信息框',
    usage: '提示、警告或补充说明，视觉上与正文区隔。',
    params: {
      tone: { desc: '语气：info/warn/success', example: 'warn' },
      text: { desc: '正文内容', example: '数据截至发稿，可能有后续更新' }
    }
  },
  timeline: {
    id: 'timeline',
    name: '时间线',
    usage: '按时间顺序罗列事件经过，适合新闻脉络复盘。',
    params: {
      items: {
        desc: '事件列表，格式：时间|事件，多条用分号;分隔',
        example: '09:30|沪指高开; 10:15|科技板块拉升; 15:00|收盘涨1.2%'
      }
    }
  },
  image: {
    id: 'image',
    name: '配图',
    usage: '为文章配一张图。你只负责描述想要什么画面（query），系统会自动搜索真实图片——不要自己编造 URL。不确定时不用此控件。',
    params: {
      query: { desc: '图片内容意图（英文或中文关键词，具体画面效果更好）', example: 'press conference technology' },
      caption: { desc: '图注（一句话）', example: '发布会现场' }
    }
  },
  qrcode: {
    id: 'qrcode',
    name: '二维码',
    usage: '把一个网址/文字生成二维码，适合引导读者访问链接（订阅页、活动页等）。',
    params: {
      data: { desc: '二维码内容（网址或文字）', example: 'https://example.com/subscribe' },
      caption: { desc: '二维码下方说明', example: '扫码订阅本报' }
    }
  },
  toc: {
    id: 'toc',
    name: '本期看点',
    usage: '目录式罗列本期最重要条目，适合头版侧栏或头页开篇导读。',
    params: {
      items: {
        desc: '条目列表，格式：标题|一句话提要，多条用分号;分隔',
        example: 'AI 评测大战|四大阵营同日竞速; Rust 新里程碑|协议栈完成审计'
      }
    }
  },
  chart: {
    id: 'chart',
    name: '数据图表',
    usage: '把结构化数据绘成图表（柱状/折线/饼图），适合数据对比与趋势。数据槽位优先使用。',
    params: {
      type: { desc: '图表类型：bar/line/pie', example: 'bar' },
      title: { desc: '图表标题', example: '今日热门仓库新增星数' },
      data: { desc: '数据列表，格式：标签|数值，多条用分号;分隔（数值为纯数字）', example: 'Rust|1397; TS|795; Go|520' }
    }
  }
}

/** 供 AI 提示词使用的控件说明清单 */
export function buildWidgetPromptSection(): string {
  const lines = Object.values(WIDGET_REGISTRY).map((w) => {
    const params = Object.entries(w.params)
      .map(([k, v]) => `${k}:"<${v.desc}>"`)
      .join(', ')
    return `- :::${w.id}{${params}} —— ${w.name}：${w.usage}`
  })
  return [
    '你可以在内容中使用以下预制控件（语法：单独一行 :::控件id{参数:"值", ...}，参数值为双引号字符串）：',
    ...lines,
    '控件行与普通文本混排：控件必须独占一行；普通段落可用 **加粗**、## 小标题。',
    '控件选用克制：每区块 0-3 个为宜，优先保证正文质量。'
  ].join('\n')
}
