import type { CustomRole, EditorialPrefs, LayoutPrefs, ThemeMode } from './settings'
import type { LayoutDoc } from './layout'
/**
 * 订阅（v0.26）：把一份 .briefy 设计固化为可反复出刊的模板。
 * 模板固化布局/模型/主题/角色等（不含 API Key 等敏感项，出刊时用当前配置的 Key）；
 * 期与期之间有分层记忆（最近 3 期详细摘要 + 更早滚动总览），支持「继续昨天」与不重复。
 */

/** 期摘要（出刊后零成本截断生成：头条首行 + 各槽要点；结构稳定，可升级 AI 提炼） */
export interface IssueSummary {
  issuedAt: string
  /** 头条（首个非空槽）首行 */
  headline: string
  /** 各槽要点：角色名 + 内容首 ~80 字 */
  points: string[]
}

/** 期记录：一次出刊的全部产物信息 */
export interface IssueRecord {
  id: string
  issuedAt: string
  pdfPath: string
  /** 出刊质检：不合格槽位经 2 轮自动重生成仍存在的瑕疵 */
  quality: { passed: boolean; issues: string[]; repaired: number }
  summary: IssueSummary
  /** 上期各槽全文（连载线直通：提示词含「继续/连载/昨天」的槽位注入上期全文续写） */
  slots: { role: string; content: string }[]
}

/** 订阅模板：严格固化的出刊配置（敏感项除外） */
export interface SubscriptionTemplate {
  doc: LayoutDoc
  /** 版式（字号/黑白/主题色/页眉页脚/分栏） */
  layout?: LayoutPrefs
  baseUrl: string
  model: string
  theme: ThemeMode
  stylePrompt?: string
  roleDuties?: Partial<Record<string, string>>
  customRoles?: CustomRole[]
  editorial?: EditorialPrefs
}

/** 订阅 */
export interface Subscription {
  id: string
  name: string
  createdAt: string
  template: SubscriptionTemplate
  /** 分层记忆：recent 最近 3 期详细摘要；digest 更早期的滚动总览 */
  memory: { recent: IssueSummary[]; digest: string }
  issues: IssueRecord[]  /** 实验性（v0.31）：手动布局出刊时自动适配版面——调整槽位高度/纵向位置与字号以贴合内容。
   *  默认关闭：保持用户模板几何完全不变（超容内容裁剪+质检标记）。 */
  experimentalLayoutFit?: boolean}

/** 记忆短期层容量：超过则最旧一期并入 digest */
export const RECENT_MEMORY_LIMIT = 3

/** 从文档构建期摘要（零成本截断：头条首行 + 各槽首 ~80 字） */
export function buildIssueSummary(doc: LayoutDoc, issuedAt: string): IssueSummary {
  const slots = doc.pages.flatMap((p) => p.slots).filter((s) => s.status === 'done' && s.content?.trim())
  const first = slots[0]?.content?.split('\n').find((l) => l.trim()) ?? ''
  return {
    issuedAt,
    headline: first.replace(/[*#]/g, '').trim().slice(0, 60),
    points: slots.map((s) => `${s.role}：${(s.content ?? '').replace(/[*#]/g, '').replace(/\s+/g, '').slice(0, 80)}`)
  }
}

/** 记忆滚动：recent 超 3 期则最旧一期并入 digest（首版字符串合并，预留 AI 合并升级） */
export function rollMemory(memory: Subscription['memory'], summary: IssueSummary): Subscription['memory'] {
  const recent = [...memory.recent, summary]
  if (recent.length <= RECENT_MEMORY_LIMIT) return { recent, digest: memory.digest }
  const overflow = recent.slice(0, recent.length - RECENT_MEMORY_LIMIT)
  const kept = recent.slice(recent.length - RECENT_MEMORY_LIMIT)
  const merged = overflow
    .map((s) => `【${s.issuedAt}】${s.headline}；${s.points.join('；')}`)
    .join('\n')
  const digest = memory.digest ? `${memory.digest}\n${merged}` : merged
  return { recent: kept, digest }
}

/** 组装记忆前缀（注入每槽 prompt）：往期总览 + 最近摘要 + 去重指令；无记忆返回空串 */
export function buildMemoryBlock(memory: Subscription['memory']): string {
  if (memory.recent.length === 0 && !memory.digest) return ''
  const parts: string[] = ['===== 往期内容提要（订阅记忆） =====']
  if (memory.digest.trim()) parts.push(`【往期总览（更早各期）】\n${memory.digest.trim()}`)
  memory.recent.forEach((s, i) => {
    parts.push(`【最近第 ${memory.recent.length - i} 期 · ${s.issuedAt}】头条：${s.headline}\n${s.points.join('\n')}`)
  })
  parts.push('出刊要求：本期内容不得重复往期已报道的角度与事实，需提供新的信息或视角；若提示词要求「继续/连载」，则在往期基础上自然延续。')
  parts.push('===== 往期提要结束 =====')
  return parts.join('\n') + '\n\n'
}

/** 连载线检测：提示词含续写意图关键词 */
export function isSerialPrompt(prompt: string): boolean {
  return /继续|连载|昨天|上次|上一期/.test(prompt)
}
