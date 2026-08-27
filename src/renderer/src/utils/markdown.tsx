import type { ReactNode } from 'react'

/**
 * 轻量行内 Markdown 渲染：**加粗** / *斜体* / `代码`。
 * 只处理安全文本（React 自动转义，无 XSS 面），不引第三方库。
 */
export function renderInlineMarkdown(text: string, keyPrefix = ''): ReactNode[] {
  const nodes: ReactNode[] = []
  // 拆分正则：按 **bold**、*italic*、`code` 依次匹配
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  const parts = text.split(pattern)

  parts.forEach((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (!part) return
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(
        <strong key={key} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      )
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code key={key} style={{ fontFamily: 'Consolas, monospace', fontSize: '0.92em' }}>
          {part.slice(1, -1)}
        </code>
      )
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(<em key={key}>{part.slice(1, -1)}</em>)
    } else {
      nodes.push(<span key={key}>{part}</span>)
    }
  })

  return nodes
}

/**
 * 块级渲染：支持 ## 小标题分段 + 首字下沉（仅首段、纯文本段落）。
 * 返回 JSX 列表由调用方放进容器。
 */
export function renderBlockMarkdown(
  text: string,
  options?: { dropCap?: boolean }
): ReactNode[] {
  const blocks = text.split(/\n\n+/) // 按空行分段
  const nodes: ReactNode[] = []
  let paraIndex = 0

  for (const raw of blocks) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    // 小标题：## xxx / ### xxx
    const headingMatch = trimmed.match(/^#{2,3}\s+(.+)$/)
    if (headingMatch) {
      nodes.push(
        <h4 key={`h-${paraIndex}`} className="block-heading">
          {renderInlineMarkdown(headingMatch[1], `h${paraIndex}`)}
        </h4>
      )
      paraIndex++
      continue
    }

    const isFirstPara = options?.dropCap && paraIndex === 0
    if (isFirstPara) {
      // 首字下沉：拆出第一个字符做装饰首字母
      const first = trimmed.charAt(0)
      const rest = trimmed.slice(1)
      nodes.push(
        <p key={`p-${paraIndex}`} className="block-para">
          <span className="drop-cap">{renderInlineMarkdown(first, `dc`)}</span>
          {renderInlineMarkdown(rest, `p${paraIndex}`)}
        </p>
      )
    } else {
      nodes.push(
        <p key={`p-${paraIndex}`} className="block-para">
          {renderInlineMarkdown(trimmed, `p${paraIndex}`)}
        </p>
      )
    }
    paraIndex++
  }

  // 没有分段（短内容）→ 整体作为单段
  if (nodes.length === 0) {
    nodes.push(<span key="single">{renderInlineMarkdown(text, 's')}</span>)
  }
  return nodes
}
