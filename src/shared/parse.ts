import type { WidgetId, WidgetParams } from './widgets'
import { WIDGET_REGISTRY } from './widgets'

/** 图形型控件等效高度（mm）：按占版面积估高，与槽位容量（estHeight×4.5 字/mm）同一口径折算成等效字数 */
const WIDGET_HEIGHT_MM: Partial<Record<WidgetId, (params: WidgetParams) => number>> = {
  stat: () => 15, // 统计卡（数值+标签+注释）
  timeline: (p) => 8 * splitCount(p.items), // 每事件一行
  image: () => 32, // 图 + 图注
  qrcode: () => 26, // 码 + 说明
  toc: (p) => 10 * splitCount(p.items), // 每条目标题+提要
  chart: (p) => 40 + 3 * splitCount(p.data) // 标题+绘图区+图例，数据点多再加高
}

/** 数一数分号分隔的条目数（timeline/toc/chart 的 items/data） */
function splitCount(value?: string): number {
  if (!value) return 0
  return value.split(';').filter((s) => s.trim()).length
}

/** 表格行等效高度（mm）：block-table 9pt 固定字号 + 内边距，实测每行 ≈5.5mm（v0.34.3 修正：
 *  此前表格按字符计数，6 行表只折算 ~11mm 而实际渲染 ≈32mm，低估 3 倍导致体积评估失真） */
const TABLE_ROW_MM = 5.5

/** 段落间距（mm）：block-para margin-bottom 6px */
const PARAGRAPH_GAP_MM = 1.6
/** 小标题附加高度（mm）：block-heading 11pt 加粗 + 下边框 + 上下 margin */
const HEADING_EXTRA_MM = 8
/** 槽位内容区内边距（mm）：slotContent padding 8px 上下（v0.34.5 校准实测补充） */
const SLOT_INNER_PAD_MM = 4.2
/** 首段首字下沉附加高度（mm）：drop-cap 34pt 浮字占位（v0.34.5 校准实测补充，约 +10mm） */
const DROP_CAP_MM = 10

/**
 * 体积估算的排版参数（v0.34.5）：与渲染层实际样式对齐。宽度是密度模型的核心——
 * 旧口径恒定 4.5 字/mm 只对半栏宽度（~87mm）成立，全宽槽（180mm）实际密度 ~9.6 字/mm，
 * 相差 2 倍，是"字数预测不能对应槽位大小"的主因。
 */
export interface QuotaOptions {
  /** 槽位内容宽度 mm（全宽 180 / 半栏 ~87）；缺省 87（历史经验口径） */
  widthMM?: number
  /** 正文字号 pt（默认 10，范围 8–14） */
  fontSizePt?: number
  /** 正文行距（默认 1.5） */
  lineHeight?: number
  /** 分栏数（body 多栏流式，默认 1；分栏使每栏变窄、总高度约减半） */
  columns?: number
}

/** 由排版参数推导密度指标：每行字数 / 行高 mm / 字每 mm */
export function quotaMetrics(opts?: QuotaOptions): { charsPerLine: number; lineHMM: number; charsPerMm: number } {
  const fontSizePx = (opts?.fontSizePt ?? 10) * (4 / 3)
  const cols = Math.min(3, Math.max(1, Math.round(opts?.columns ?? 1)))
  const COLUMN_GAP_MM = 6 // 渲染层 columnGap 6mm
  const widthMM = Math.min(210, Math.max(20, opts?.widthMM ?? 87))
  const colWidthMM = (widthMM - COLUMN_GAP_MM * (cols - 1)) / cols
  const charsPerLine = Math.max(4, (colWidthMM * 3.7795) / fontSizePx)
  const lineHMM = (fontSizePx * (opts?.lineHeight ?? 1.5)) / 3.7795
  return { charsPerLine, lineHMM, charsPerMm: charsPerLine / lineHMM }
}

/**
 * 槽位字数容量（v0.34.5）：estHeight mm 按实际排版密度折算成字数——
 * 与 estimateQuota 同密度口径，替代旧 estHeight×4.5 恒定假设。
 */
export function slotWordCapacity(estHeightMM: number, opts?: QuotaOptions): number {
  return Math.max(40, Math.round(estHeightMM * quotaMetrics(opts).charsPerMm))
}

/**
 * 控件/表格的等效字数成本说明（喂给 AI，v0.34.3）：生成时字数上限只算了总容量，
 * 不告知控件占版成本的话，AI 会在写满上限之外再插控件 → 实际体积超限 → 被迫缩字号。
 * 数字从 WIDGET_HEIGHT_MM 同源折算（高度mm×密度），与 estimateQuota 评估口径严格一致。
 */
export function widgetQuotaHint(opts?: QuotaOptions): string {
  const perMm = quotaMetrics(opts).charsPerMm
  const q = (mm: number): number => Math.round(mm * perMm)
  return [
    '字数上限指全文总体积（正文+控件折算）：若插入占版控件，需按以下等效字数从上限中扣除——',
    `配图≈${q(32)}字/张、二维码≈${q(26)}字/个、图表≈${q(40)}字+每个数据点≈${q(3)}字、统计卡≈${q(15)}字/个、时间线≈${q(8)}字/条、目录≈${q(10)}字/条、表格每行≈${q(5.5)}字；`,
    '控件越大越多，正文就要写得越少，总体积不得超上限。'
  ].join(' ')
}

/**
 * 统计内容的等效字数（体积协调口径，v0.34.5 行数模型）：
 * 与渲染层 parseContent 同构解析（空行分段 / ## 小标题 / 可解析单行控件 / 表格行），按
 * 「段字数 → 每行字数 → 行数（向上取整）→ 行高」逐段折算 mm——自然涵盖段落尾部半行、段距、
 * 小标题附加高度的冗余。控件占版 mm 与宽度无关，按当前密度折算等效字数。
 * 无参 ::: 行按普通文字计（渲染层就是段落，v0.34.4 口径，永不吞正文）。
 */
export function estimateQuota(content: string, opts?: QuotaOptions): number {
  if (!content.trim()) return 0
  const { charsPerLine, lineHMM, charsPerMm } = quotaMetrics(opts)
  let totalMM = 0
  /** 当前段落累积的行（空行/控件/标题触发结算） */
  let paraLines: string[] = []
  /** 是否已过首段（首段首字下沉，占位更大） */
  let firstTextParaSeen = false

  const paraMM = (text: string): number => {
    const chars = text.replace(/\s+/g, '').length
    return chars === 0 ? 0 : Math.ceil(chars / charsPerLine) * lineHMM + PARAGRAPH_GAP_MM
  }
  const flushPara = (): void => {
    if (paraLines.length === 0) return
    // 段内区分表格行（| 开头，每行独立 5.5mm）与文字行（累积后按段折行）
    const tableLines = paraLines.filter((l) => l.startsWith('|'))
    const textBlock = paraLines.filter((l) => !l.startsWith('|')).join('')
    let mm = tableLines.length * TABLE_ROW_MM + paraMM(textBlock)
    // 首个文字段首字下沉（渲染层 drop-cap 34pt 浮字，实测约 +10mm）
    if (!firstTextParaSeen && textBlock.trim()) {
      firstTextParaSeen = true
      mm += DROP_CAP_MM
    }
    totalMM += mm
    paraLines = []
  }

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      continue
    }
    if (line.startsWith(':::')) {
      const w = parseWidgetLine(line)
      if (w) {
        flushPara()
        const est = WIDGET_HEIGHT_MM[w.id]
        if (est) {
          totalMM += est(w.params) // 图形型控件：占版 mm（与宽度无关）
        } else {
          // 文字型控件（quote/info）：底高 + 参数文字折行
          const base = w.id === 'quote' ? 12 : 10
          const chars = Object.values(w.params).join('').replace(/\s+/g, '').length
          totalMM += base + Math.ceil(chars / charsPerLine) * lineHMM
        }
        continue
      }
      // 无参 ::: 行：渲染层按普通段落文字渲染，估计同口径（落入段落缓冲）
    }
    if (/^#{2,3}\s+/.test(line)) {
      flushPara()
      const text = line.replace(/^#{2,3}\s+/, '').replace(/\s+/g, '')
      totalMM += Math.ceil(text.length / charsPerLine) * lineHMM + HEADING_EXTRA_MM
      continue
    }
    paraLines.push(line)
  }
  flushPara()
  // 槽位内容区上下 padding（slotContent 8px×2）——框高的固定组成部分
  totalMM += SLOT_INNER_PAD_MM

  return Math.round(totalMM * charsPerMm)
}

/**
 * 统计内容的有效文字数：剥离可解析的单行控件行，只计正文文字。
 * v0.34.4 口径对齐渲染层：无参 ::: 行（渲染为普通段落）也计入文字——
 * 此前的"多行块剥离"会把未闭合块后的正文全部剥掉，字数计 0 → 被误判为纯控件/空内容。
 */
export function countContentChars(content: string): number {
  let count = 0
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith(':::') && parseWidgetLine(line)) continue // 可解析的单行控件行不计
    count += raw.replace(/\s+/g, '').length
  }
  return count
}

/**
 * 字数合格区间（v0.34.4）：小槽位按比例（85%~115%，用户约定下限自 80% 提升）；
 * 大槽位（上限 >600 字）改用固定字数冗余——比例冗余在大槽位上失真（2000 字槽的 ±15% = ±300 字，
 * AI 偏差被放大），固定冗余（-100/+150）让超大槽位的字数下限不再滑坡。
 * 长度协调退稿判断与质量报告合格判定共用此口径（单一事实源）。
 */
export function quotaRange(limit: number): { min: number; max: number } {
  if (limit > 600) return { min: limit - 100, max: limit + 150 }
  return { min: Math.round(limit * 0.85), max: Math.round(limit * 1.15) }
}

/** 解析后的内容节点流：段落 / 小标题 / 控件 */
export type ContentNode =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'widget'; id: WidgetId; params: WidgetParams }

/**
 * 富媒体内容嗅探（v0.34.2）：内容含图形型控件（图片/二维码/图表）或 Markdown 表格。
 * 这些元素随槽位字号缩放联动（zoom/占版面积），字号放大会让图片变糊、图表占版失衡——
 * 字号自适应的"增字号填充"分支须对这类槽位跳过（缩小方向不受影响）。
 */
export function hasRichMedia(content?: string): boolean {
  if (!content) return false
  if (/:::(image|qrcode|chart)\{/.test(content)) return true
  // Markdown 表格：≥3 行以 | 开头（含分隔行）
  const tableLines = content.split('\n').filter((l) => l.trim().startsWith('|'))
  return tableLines.length >= 3
}

/** 解析 :::id{key:"value", ...} 控件标记行 */
function parseWidgetLine(line: string): { id: WidgetId; params: WidgetParams } | null {
  const match = line.match(/^:::(\w+)\{(.*)\}\s*$/)
  if (!match) return null
  const id = match[1] as WidgetId
  if (!WIDGET_REGISTRY[id]) return null

  // 解析参数：key:"value", key2:"value2"（值内不允许双引号，AI 按约定转义为单引号）
  const params: WidgetParams = {}
  const body = match[2]
  const pairPattern = /(\w+)\s*:\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = pairPattern.exec(body)) !== null) {
    params[m[1]] = m[2]
  }
  return { id, params }
}

/**
 * 把 AI 输出的区块文本解析为节点流：
 * - `## x` → heading
 * - `:::xxx{...}` → widget
 * - 其他非空行按空行分组为段落
 */
export function parseContent(text: string): ContentNode[] {
  const nodes: ContentNode[] = []
  let paraBuffer: string[] = []

  const flushPara = (): void => {
    if (paraBuffer.length > 0) {
      nodes.push({ type: 'paragraph', text: paraBuffer.join('\n') })
      paraBuffer = []
    }
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flushPara()
      continue
    }

    const headingMatch = line.match(/^#{2,3}\s+(.+)$/)
    if (headingMatch) {
      flushPara()
      nodes.push({ type: 'heading', text: headingMatch[1] })
      continue
    }

    if (line.startsWith(':::')) {
      const widget = parseWidgetLine(line)
      if (widget) {
        flushPara()
        nodes.push({ type: 'widget', ...widget })
        continue
      }
    }

    paraBuffer.push(line)
  }
  flushPara()

  return nodes
}

/** 有效字数：去空白、去控件行（控件不计入版面字数） */
function contentLength(text: string): number {
  return text
    .split('\n')
    .filter((l) => !l.trim().startsWith(':::'))
    .join('')
    .replace(/\s+/g, '').length
}

/**
 * 长度工程（ROADMAP 用户反馈"版面被撑爆/留白"）：
 * 内容超出版面字数上限时，按**段落边界**重组（从尾部丢弃整段，不腰斩句子），
 * 控件行（:::chart 等）永保留且不计长度；单段超长时按句切分兜底。
 * 返回重组后的文本与是否发生了删节。
 */
export function enforceLength(content: string, maxChars: number): { text: string; truncated: boolean } {
  if (contentLength(content) <= maxChars) return { text: content, truncated: false }

  // 把内容拆为块：控件行独立成块（永保留），其余按空行分段
  const blocks = content.split(/\n\n+/)
  const kept: string[] = []
  let len = 0
  let truncated = false

  for (const block of blocks) {
    const isWidget = block
      .split('\n')
      .some((l) => l.trim().startsWith(':::'))
    if (isWidget) {
      kept.push(block)
      continue
    }
    const blockLen = contentLength(block)
    if (len + blockLen <= maxChars || kept.filter((k) => !k.includes(':::')).length === 0) {
      // 还装得下，或这是第一个文本块（至少保留一块）
      kept.push(block)
      len += blockLen
    } else {
      truncated = true
    }
  }

  let text = kept.join('\n\n')
  // 单段仍超长（极长段落）：按句切分兜底，从尾部丢句
  if (contentLength(text) > maxChars) {
    const sentences = text.split(/(?<=[。！？；])/)
    const keptSentences: string[] = []
    let sLen = 0
    for (const s of sentences) {
      const sl = s.replace(/\s+/g, '').length
      if (sLen + sl > maxChars && keptSentences.length > 0) {
        truncated = true
        break
      }
      keptSentences.push(s)
      sLen += sl
    }
    text = keptSentences.join('')
  }

  if (truncated) text += '\n\n（因版面所限，本段内容有删节）'
  return { text, truncated }
}
