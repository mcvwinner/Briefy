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

/** 配图：AI 只给意图（query），生成后由主进程用 Tavily 图搜回填真实 URL。
 *  未回填（无 url）时显示占位提示，不渲染破图 */
function ImageBlock({ params }: { params: Record<string, string> }): ReactNode {
  if (!params.url) {
    return <div className="widget-image-pending">📷 配图待获取：{renderInlineMarkdown(params.query ?? params.caption ?? '')}</div>
  }
  return (
    <figure className="widget-image">
      <img src={params.url} alt={params.caption ?? ''} loading="lazy" />
      {params.caption && <figcaption>{renderInlineMarkdown(params.caption)}</figcaption>}
    </figure>
  )
}

/** 二维码：qrserver 免费服务生成（导出打印时需联网加载） */
function QrCode({ params }: { params: Record<string, string> }): ReactNode {
  if (!params.data) return null
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(params.data)}`
  return (
    <div className="widget-qrcode">
      <img src={src} alt={params.caption ?? 'QR'} loading="lazy" />
      {params.caption && <div className="widget-qrcode-caption">{renderInlineMarkdown(params.caption)}</div>}
    </div>
  )
}

/** 本期看点：目录式导读列表 */
function TocList({ params }: { params: Record<string, string> }): ReactNode {
  const items = (params.items ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [title, ...rest] = s.split('|')
      return { title: title?.trim() ?? '', desc: rest.join('|').trim() }
    })
  return (
    <ul className="widget-toc">
      {items.map((it, i) => (
        <li key={i} className="widget-toc-item">
          <span className="widget-toc-title">{renderInlineMarkdown(it.title, `tt${i}`)}</span>
          {it.desc && <span className="widget-toc-desc">{renderInlineMarkdown(it.desc, `td${i}`)}</span>}
        </li>
      ))}
    </ul>
  )
}

/** 数据图表：纯 SVG 自绘（柱/折/饼，零外部依赖，ROADMAP Q3） */
function Chart({ params }: { params: Record<string, string> }): ReactNode {
  const rows = (params.data ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [label, ...rest] = s.split('|')
      return { label: (label ?? '').trim(), value: Number(rest.join('|').trim()) || 0 }
    })
    .filter((r) => r.label)
  if (rows.length === 0) return null
  const type = params.type === 'line' || params.type === 'pie' ? params.type : 'bar'
  const W = 320
  const H = 180
  const pad = 28
  const max = Math.max(...rows.map((r) => r.value), 1)
  const palette = ['#0f6cbd', '#c50f1f', '#0e700e', '#6b3fa0', '#8a6142', '#ca5010']
  const color = (i: number): string => palette[i % palette.length]
  const title = params.title ? <div className="widget-chart-title">{renderInlineMarkdown(params.title)}</div> : null

  if (type === 'pie') {
    const total = rows.reduce((s, r) => s + r.value, 0) || 1
    let acc = -Math.PI / 2
    const slices = rows.map((r, i) => {
      const ang = (r.value / total) * Math.PI * 2
      const x1 = Math.cos(acc)
      const y1 = Math.sin(acc)
      acc += ang
      const x2 = Math.cos(acc)
      const y2 = Math.sin(acc)
      const large = ang > Math.PI ? 1 : 0
      return {
        d: `M 0 0 L ${x1 * 70} ${y1 * 70} A 70 70 0 ${large} 1 ${x2 * 70} ${y2 * 70} Z`,
        color: color(i),
        label: r.label,
        pct: Math.round((r.value / total) * 100)
      }
    })
    return (
      <div className="widget-chart">
        {title}
        <div className="widget-chart-body">
          <svg viewBox="-80 -80 160 160" width={130} height={130}>
            {slices.map((s, i) => (
              <path key={i} d={s.d} fill={s.color} />
            ))}
          </svg>
          <div className="widget-chart-legend">
            {slices.map((s, i) => (
              <div key={i} className="widget-chart-legend-item">
                <span style={{ backgroundColor: s.color }} />
                {s.label} {s.pct}%
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (type === 'line') {
    const step = rows.length > 1 ? (W - pad * 2) / (rows.length - 1) : 0
    const pts = rows.map((r, i) => [pad + i * step, H - pad - (r.value / max) * (H - pad * 2)])
    return (
      <div className="widget-chart">
        {title}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
          {rows.map((r, i) => (
            <g key={i}>
              <circle cx={pts[i][0]} cy={pts[i][1]} r={3} fill={color(i)} />
              <text x={pts[i][0]} y={H - pad + 12} fontSize={8} textAnchor="middle" fill="#666">
                {r.label}
              </text>
              <text x={pts[i][0]} y={pts[i][1] - 8} fontSize={8} textAnchor="middle" fill="#333">
                {r.value}
              </text>
            </g>
          ))}
          <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#0f6cbd" strokeWidth={2} />
        </svg>
      </div>
    )
  }

  // bar（默认）
  const bw = (W - pad * 2) / rows.length
  return (
    <div className="widget-chart">
      {title}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
        {rows.map((r, i) => {
          const h = (r.value / max) * (H - pad * 2)
          return (
            <g key={i}>
              <rect x={pad + i * bw + bw * 0.15} y={H - pad - h} width={bw * 0.7} height={h} fill={color(i)} rx={2} />
              <text x={pad + i * bw + bw / 2} y={H - pad - h - 5} fontSize={8} textAnchor="middle" fill="#333">
                {r.value}
              </text>
              <text x={pad + i * bw + bw / 2} y={H - pad + 12} fontSize={8} textAnchor="middle" fill="#666">
                {r.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const WIDGET_RENDERERS: Record<WidgetId, (p: { params: Record<string, string> }) => ReactNode> = {
  stat: StatCard,
  quote: QuoteBlock,
  info: InfoBox,
  timeline: Timeline,
  image: ImageBlock,
  qrcode: QrCode,
  toc: TocList,
  chart: Chart
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
        // 控件自适应（v0.24.2）：zoom 联动槽位字号缩放系数 --briefy-fit（SlotBox 提供），
        // 图片/图表/时间线等占版体积随字号一起缩放，估算不精确时由渲染层实测收敛兜底。
        // 控件内部字号均为固定 pt，zoom 为单次缩放，无叠加问题
        return (
          <div key={i} style={{ zoom: 'var(--briefy-fit, 1)' }}>
            <Renderer params={node.params} />
          </div>
        )
      }
    }
  })
}
