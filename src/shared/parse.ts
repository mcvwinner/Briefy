import type { WidgetId, WidgetParams } from './widgets'
import { WIDGET_REGISTRY } from './widgets'

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
