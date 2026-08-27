import type { WidgetId, WidgetParams } from '../../../shared/widgets'
import { WIDGET_REGISTRY } from '../../../shared/widgets'

/**
 * 控件编辑工具集：定位区块内容中的控件实例，表单化改参后回写文本。
 * 这是"用户参与"的核心：改参数不写代码。
 */

export interface WidgetInstance {
  /** 控件行序号（内容中第几个 ::: 行） */
  lineIndex: number
  id: WidgetId
  params: WidgetParams
}

/** 列出内容中全部控件实例（供属性面板展示） */
export function listWidgetInstances(content: string): WidgetInstance[] {
  const instances: WidgetInstance[] = []
  content.split('\n').forEach((rawLine, lineIndex) => {
    const line = rawLine.trim()
    if (!line.startsWith(':::')) return
    const match = line.match(/^:::(\w+)\{(.*)\}\s*$/)
    if (!match || !WIDGET_REGISTRY[match[1] as WidgetId]) return
    const params: WidgetParams = {}
    const pairPattern = /(\w+)\s*:\s*"([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = pairPattern.exec(match[2])) !== null) params[m[1]] = m[2]
    instances.push({ lineIndex, id: match[1] as WidgetId, params })
  })
  return instances
}

/** 把控件实例渲染回标记行 */
function serializeWidgetLine(id: WidgetId, params: WidgetParams): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}:"${String(v).replace(/"/g, "'")}"`)
  return `:::${id}{${pairs.join(', ')}}`
}

/** 修改第 lineIndex 行控件的参数，返回新内容；该行不是控件则原样返回 */
export function updateWidgetInstance(
  content: string,
  lineIndex: number,
  newParams: WidgetParams
): string {
  const lines = content.split('\n')
  const line = lines[lineIndex]?.trim() ?? ''
  const match = line.match(/^:::(\w+)\{/)
  if (!match || !WIDGET_REGISTRY[match[1] as WidgetId]) return content
  lines[lineIndex] = serializeWidgetLine(match[1] as WidgetId, newParams)
  return lines.join('\n')
}
