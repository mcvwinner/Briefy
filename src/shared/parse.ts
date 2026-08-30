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

/**
 * 控件/表格的等效字数成本说明（喂给 AI，v0.34.3）：生成时字数上限只算了总容量，
 * 不告知控件占版成本的话，AI 会在写满上限之外再插控件 → 实际体积超限 → 被迫缩字号。
 * 数字从 WIDGET_HEIGHT_MM 同源折算（高度mm×4.5字/mm），与 estimateQuota 评估口径严格一致。
 */
export function widgetQuotaHint(): string {
  const q = (mm: number): number => Math.round(mm * 4.5)
  return [
    '字数上限指全文总体积（正文+控件折算）：若插入占版控件，需按以下等效字数从上限中扣除——',
    `配图≈${q(32)}字/张、二维码≈${q(26)}字/个、图表≈${q(40)}字+每个数据点≈${q(3)}字、统计卡≈${q(15)}字/个、时间线≈${q(8)}字/条、目录≈${q(10)}字/条、表格每行≈${q(5.5)}字；`,
    '控件越大越多，正文就要写得越少，总体积不得超上限。'
  ].join(' ')
}

/**
 * 统计内容的等效字数（体积协调口径）：正文文字照计；图形型控件按占版面积折算（高度mm×4.5字/mm），
 * 文字型控件（quote/info）参数文字照计并加底高——让字数重新反映槽位体积，控件不再"隐形"。
 * 多行块（AI 非标准写法 :::id 无参数）按 40mm 底座 + 块内文字容错估算。
 */
export function estimateQuota(content: string): number {
  const CHAR_PER_MM = 4.5
  let total = 0
  let blockLines: string[] | null = null
  const closeBlock = (): void => {
    if (blockLines) {
      total += Math.round(40 * CHAR_PER_MM) + blockLines.join('').replace(/\s+/g, '').length
      blockLines = null
    }
  }
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith(':::')) {
      closeBlock()
      const w = parseWidgetLine(line)
      if (w) {
        const est = WIDGET_HEIGHT_MM[w.id]
        if (est) {
          total += Math.round(est(w.params) * CHAR_PER_MM)
        } else {
          // 文字型控件（quote/info）：底高 + 参数文字
          const base = w.id === 'quote' ? 12 : 10
          total += Math.round(base * CHAR_PER_MM) + Object.values(w.params).join('').replace(/\s+/g, '').length
        }
        continue
      }
      if (/^:::\w/.test(line)) blockLines = [] // 非标准多行块：开块容错
      continue
    }
    if (blockLines) {
      blockLines.push(raw)
      continue
    }
    // 表格行按行折算（v0.34.3）：9pt 固定字号+内边距，行高 ≈5.5mm，与渲染实测一致；
    // 按字符计数会低估 3 倍（| 名称 | 数值 | 去空白仅 ~8 字，渲染却是 5.5mm 高的一行）
    if (line.startsWith('|')) {
      total += Math.round(TABLE_ROW_MM * CHAR_PER_MM)
      continue
    }
    total += raw.replace(/\s+/g, '').length
  }
  closeBlock()
  return total
}

/**
 * 统计内容的有效文字数：完整剥离 ::: 控件块（含块内数据行，如图表数据、时间线条目），
 * 只计正文文字——字数协调/质量报告反映的是文字体积，控件自身体积由渲染层实测适配。
 * 带参数的单行控件（如 :::stat{...}）不开启剥离块；无参数的 :::id 视为开块，直到 :::/下一个控件行闭合。
 */
export function countContentChars(content: string): number {
  let inBlock = false
  let count = 0
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith(':::')) {
      const singleLine = /^:::\w+\s*\{/.test(line)
      if (inBlock) {
        inBlock = singleLine ? false : line !== ':::' // 块内：纯 ':::' 闭合；':::xxx' 异常结束并开新块
      } else {
        inBlock = !singleLine
      }
      continue
    }
    if (inBlock) continue
    count += raw.replace(/\s+/g, '').length
  }
  return count
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
