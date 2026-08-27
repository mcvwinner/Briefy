import type { ReactNode } from 'react'
import type { ContentNode } from '../../../shared/parse'
import type { WidgetId } from '../../../shared/widgets'
import { renderInlineMarkdown } from './markdown'

/** 各控件-tone 对应的配色 */
const INFO_TONES: Record<string, { border: string; bg: string }> = {
  info: { border: '#0f6cbd', bg: '#eff6fc' },
  warn: { border: '#c50f1f', bg: '#fdf3f4' },
  success: { border: '#0e700e', bg: '#f1faf1' }
}

function StatCard({ params }: { params: Record<string, string> }): ReactNode {
  const trendColor =
    params.trend === 'up' ? '#0e700e' : params.trend === 'down' ? '#c50f1f' : '#616161'
  const trendArrow = params.trend === 'up' ? '▲' : params.trend === 'down' ? '▼' : '—'
  return (
    <div className="widget-stat">
      <div className="widget-stat-label">{renderInlineMarkdown(params.label ?? '')}</div>
      <div className="widget-stat-value" style={{ color: trendColor }}>
        {params.value ?? ''}
        <span style={{ fontSize: '0.6em', marginLeft: 4 }}>{trendArrow}</span>
      </div>
      {params.note && <div className="widget-stat-note">{renderInlineMarkdown(params.note)}</div>}
    </div>
  )
}

function QuoteBlock({ params }: { params: Record<string, string> }): ReactNode {
  return (
    <blockquote className="widget-quote">
      <div className="widget-quote-text">“{renderInlineMarkdown(params.text ?? '')}”</div>
      {params.source && <div className="widget-quote-source">—— {renderInlineMarkdown(params.source)}</div>}
    </blockquote>
  )
}

function InfoBox({ params }: { params: Record<string, string> }): ReactNode {
  const tone = INFO_TONES[params.tone ?? 'info'] ?? INFO_TONES.info
  return (
    <div className="widget-info" style={{ borderLeftColor: tone.border, background: tone.bg }}>
      {renderInlineMarkdown(params.text ?? '')}
    </div>
  )
}

function Timeline({ params }: { params: Record<string, string> }): ReactNode {
  const items = (params.items ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [time, ...rest] = s.split('|')
      return { time: time?.trim() ?? '', event: rest.join('|').trim() }
    })
  return (
    <div className="widget-timeline">
      {items.map((it, i) => (
        <div key={i} className="widget-timeline-item">
          <span className="widget-timeline-time">{it.time}</span>
          <span className="widget-timeline-event">{renderInlineMarkdown(it.event, `t${i}`)}</span>
        </div>
      ))}
    </div>
  )
}

const WIDGET_RENDERERS: Record<WidgetId, (p: { params: Record<string, string> }) => ReactNode> = {
  stat: StatCard,
  quote: QuoteBlock,
  info: InfoBox,
  timeline: Timeline
}

/** 内容节点流 → React 节点（段落走行内 MD，控件走注册表） */
export function renderContentNodes(nodes: ContentNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'heading':
        return (
          <h4 key={i} className="block-heading">
            {renderInlineMarkdown(node.text, `h${i}`)}
          </h4>
        )
      case 'paragraph':
        return (
          <p key={i} className="block-para">
            {renderInlineMarkdown(node.text, `p${i}`)}
          </p>
        )
      case 'widget': {
        const Renderer = WIDGET_RENDERERS[node.id]
        return <Renderer key={i} params={node.params} />
      }
    }
  })
}
