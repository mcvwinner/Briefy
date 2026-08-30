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

/** 记忆滚动：recent 超 3 期则最旧一期并入 digest（compressedDigest 传入时用 AI 压缩结果，否则降级拼接） */
export function rollMemory(
  memory: Subscription['memory'],
  summary: IssueSummary,
  compressedDigest?: string
): Subscription['memory'] {
  const recent = [...memory.recent, summary]
  if (recent.length <= RECENT_MEMORY_LIMIT)
    return { recent, digest: compressedDigest ?? memory.digest }
  const overflow = recent.slice(0, recent.length - RECENT_MEMORY_LIMIT)
  const kept = recent.slice(recent.length - RECENT_MEMORY_LIMIT)
  const merged = overflow
    .map((s) => `【${s.issuedAt}】${s.headline}；${s.points.join('；')}`)
    .join('\n')
  const digest = compressedDigest ?? (memory.digest ? `${memory.digest}\n${merged}` : merged)
  return { recent: kept, digest }
}

/** 组装记忆前缀（注入每槽 prompt）：往期总览 + 最近摘要 + 相关片段（差异化）+ 去重指令；无记忆返回空串。
 *  relatedPast：与该槽主题相关的往期片段（出刊前检索），注入差异化要求。 */
export function buildMemoryBlock(
  memory: Subscription['memory'],
  relatedPast?: { issuedAt: string; role: string; snippet: string }[]
): string {
  if (memory.recent.length === 0 && !memory.digest && (!relatedPast || relatedPast.length === 0)) return ''
  const parts: string[] = ['===== 往期内容提要（订阅记忆） =====']
  if (memory.digest.trim()) parts.push(`【往期总览（更早各期）】\n${memory.digest.trim()}`)
  memory.recent.forEach((s, i) => {
    parts.push(`【最近第 ${memory.recent.length - i} 期 · ${s.issuedAt}】头条：${s.headline}\n${s.points.join('\n')}`)
  })
  if (relatedPast && relatedPast.length > 0) {
    parts.push('【相关往期内容（与本栏主题相关，本期必须差异化，不得复述）】')
    for (const r of relatedPast) parts.push(`【${r.issuedAt}·${r.role}】${r.snippet}`)
  }
  parts.push('出刊要求：本期内容不得重复往期已报道的角度与事实，需提供新的信息或视角；若提示词要求「继续/连载」，则在往期基础上自然延续。')
  parts.push('===== 往期提要结束 =====')
  return parts.join('\n') + '\n\n'
}

/** 连载线检测：提示词含续写意图关键词 */
export function isSerialPrompt(prompt: string): boolean {
  return /继续|连载|昨天|上次|上一期/.test(prompt)
}

/** 3-gram 集合（防重复/相关性检索共用口径） */
export function gramSet(text: string): Set<string> {
  const s = text.replace(/\s+/g, '')
  const set = new Set<string>()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}

/** 字面相似度（3-gram 覆盖度：a 的 gram 在 b 中的占比，0~1） */
export function similarity(a: string, b: string): number {
  const ga = gramSet(a)
  if (ga.size === 0) return 0
  const gb = gramSet(b)
  let hit = 0
  for (const g of ga) if (gb.has(g)) hit++
  return hit / ga.size
}

export interface RelatedPast {
  issuedAt: string
  role: string
  snippet: string
  score: number
}

/**
 * 相关往期检索：本期槽提示词在往期全文中找最相关片段（注入后要求差异化，防重复更精准）。
 * 长文按 200 字窗口/100 字步长切块评分；同 issue+role 只留最高分；返回按分数降序前 topK。
 * excludeIssueId：排除上一期（连载线已注入其全文，避免重复注入）。
 */
export function retrieveRelevantPast(
  prompt: string,
  issues: IssueRecord[],
  excludeIssueId: string | undefined,
  topK = 2
): RelatedPast[] {
  const grams = gramSet(prompt)
  if (grams.size === 0) return []
  const WIN = 200
  const STEP = 100
  const scored: RelatedPast[] = []
  for (const issue of issues) {
    if (issue.id === excludeIssueId) continue
    for (const s of issue.slots) {
      if (!s.content.trim()) continue
      const windows: string[] =
        s.content.length <= WIN
          ? [s.content]
          : (() => {
              const arr: string[] = []
              for (let i = 0; i + WIN <= s.content.length; i += STEP) arr.push(s.content.slice(i, i + WIN))
              if (arr.length === 0) arr.push(s.content)
              return arr
            })()
      let best = 0
      let bestSnippet = ''
      for (const w of windows) {
        const score = similarity(prompt, w)
        if (score > best) {
          best = score
          bestSnippet = w
        }
      }
      if (best > 0.08) scored.push({ issuedAt: issue.issuedAt, role: s.role, snippet: bestSnippet.slice(0, 200), score: best })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const result: RelatedPast[] = []
  for (const r of scored) {
    const k = r.issuedAt + '|' + r.role
    if (seen.has(k)) continue
    seen.add(k)
    result.push(r)
    if (result.length >= topK) break
  }
  return result
}

/** 降级拼接：digest 溢出合并（AI 压缩失败时的兜底） */
export function mergeDigestFallback(oldDigest: string, overflow: IssueSummary[]): string {
  const merged = overflow.map((s) => `【${s.issuedAt}】${s.headline}；${s.points.join('；')}`).join('\n')
  return oldDigest ? `${oldDigest}\n${merged}` : merged
}
