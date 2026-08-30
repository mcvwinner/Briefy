import { z } from 'zod'
import type { AiSettings } from '../shared/settings'
import type { ToolId } from '../shared/layout'
import { ROLE_DEFS, type SlotRole } from '../shared/layout'
import { tavilySearch, tavilyImageSearch, fetchPageText } from './tools'
import { buildWidgetPromptSection } from '../shared/widgets'

/**
 * 流式请求超时控制（v0.30 用户需求）：只要还在输出就不中断——
 * 空闲 90s 无数据才断，总时长封顶 600s。tick() 在每读到一块数据时调用续命。
 * 计时器残留最长 600s 且到点仅 abort 已完成的 controller，无功能影响。
 */
function streamAbort(signal?: AbortSignal): {
  signal: AbortSignal
  tick: () => void
} {
  const ctrl = new AbortController()
  const IDLE_MS = 90_000
  const TOTAL_MS = 600_000
  let idle: NodeJS.Timeout | undefined
  const arm = (): void => {
    clearTimeout(idle)
    idle = setTimeout(() => ctrl.abort(new Error('AI 输出空闲超过 90s，已中止')), IDLE_MS)
  }
  arm()
  const total = setTimeout(() => ctrl.abort(new Error('AI 生成总时长超过 600s 上限，已中止')), TOTAL_MS)
  const onOuterAbort = (): void => ctrl.abort(signal?.reason)
  signal?.addEventListener('abort', onOuterAbort)
  ctrl.signal.addEventListener('abort', () => {
    clearTimeout(idle)
    clearTimeout(total)
    signal?.removeEventListener('abort', onOuterAbort)
  })
  return { signal: ctrl.signal, tick: arm }
}

/** 语篇上下文：整份报纸的槽位大纲（App 层构建，含角色名与职责） */
export interface DocContext {
  title: string
  outline: { position: string; role: string; duty: string; prompt: string }[]
}

/** 本地工具实现（脱离 ai 包类型，直接转为 OpenAI function 格式） */
interface LocalTool {
  description: string
  inputSchema: z.ZodType
  execute: (args: unknown) => Promise<unknown>
}

/** 按槽位配置动态组装工具集。
 * 时间不在提示词里硬编码，而是作为工具提供——需要时 AI 自己查询。
 */
/** 文件参考源（已读取的全文），供 readSource 工具分块按需读取 */
export interface FileSourceContent {
  name: string
  note: string
  text: string
}

function buildTools(settings: AiSettings, enabled: ToolId[], fileSources: FileSourceContent[] = []) {
  const tools: Record<string, LocalTool> = {}

  if (enabled.includes('getCurrentTime')) {
    tools.getCurrentTime = {
      description:
        '获取当前的日期和时间（用户本地时区）。当内容涉及"今天/最新/近期"等时间概念时必须先调用此工具。',
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date()
        const weekDays = ['日', '一', '二', '三', '四', '五', '六']
        return {
          date: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
          weekday: `星期${weekDays[now.getDay()]}`,
          time: now.toLocaleTimeString('zh-CN', { hour12: false })
        }
      }
    }
  }

  if (enabled.includes('webSearch')) {
    if (!settings.tavilyKey) throw new Error('使用了搜索工具但未在设置中配置 Tavily Key')
    tools.webSearch = {
      description:
        '联网搜索最新信息。输入中文或英文关键词，返回前几条结果（标题/链接/摘要）。需要事实性、时效性内容时优先使用。',
      inputSchema: z.object({ query: z.string().describe('搜索关键词') }),
      execute: async (args) => {
        const { query } = args as { query: string }
        const results = await tavilySearch(settings.tavilyKey, query)
        return results.map((r) => ({ title: r.title, url: r.url, summary: r.content }))
      }
    }
  }

  if (enabled.includes('fetchPage')) {
    tools.fetchPage = {
      description:
        '抓取指定网页的正文文本。用于深入了解 webSearch 结果中某条链接的完整内容。',
      inputSchema: z.object({ url: z.string().url().describe('要抓取的网页地址') }),
      execute: async (args) => {
        const { url } = args as { url: string }
        return fetchPageText(url)
      }
    }
  }

  // 文件参考源（v0.25）：不预注入，AI 经 readSource 工具按需分块读取；每源限 3 次，促使一次读全、珍惜上下文
  if (fileSources.length > 0) {
    const CHUNK = 4000
    const MAX_READS = 3
    const blocks = new Map<string, { chunks: string[]; total: number; reads: number }>()
    for (const f of fileSources) {
      const chunks: string[] = []
      for (let i = 0; i < f.text.length; i += CHUNK) chunks.push(f.text.slice(i, i + CHUNK))
      blocks.set(f.name, { chunks, total: Math.max(1, chunks.length), reads: 0 })
    }
    const listDesc = [...blocks.entries()].map(([n, b]) => `「${n}」共 ${b.total} 块${b.total > 1 ? '（建议按 1→2→3 顺序读）' : ''}`).join('、')
    tools.readSource = {
      description: `读取本地参考文件的一段内容（每次约 4000 字）。可用文件源：${listDesc}。每个文件最多读取 ${MAX_READS} 次，请珍惜次数：先读第 1 块判断价值，再决定是否继续。`,
      inputSchema: z.object({
        source: z.string().describe('文件源名称'),
        part: z.number().int().min(1).describe('第几块（从 1 开始）')
      }),
      execute: async (args) => {
        const { source, part } = args as { source: string; part: number }
        const b = blocks.get(source)
        if (!b) return { error: `未找到文件源「${source}」`, available: [...blocks.keys()] }
        if (b.reads >= MAX_READS) return { error: `该文件的读取次数已用完（${MAX_READS} 次），请基于已读内容写作，不要再次读取` }
        b.reads += 1
        const idx = Math.min(Math.max(1, part), b.total) - 1
        return {
          part: idx + 1,
          totalParts: b.total,
          remainingReads: MAX_READS - b.reads,
          text: b.chunks[idx]
        }
      }
    }
  }

  return tools
}

/** 把文档大纲转成 AI 可读的版面说明（语篇意识：全报结构 + 各槽位角色职责 + 自己的位置） */
function buildOutlineSection(context?: DocContext, currentIndex = -1): string {
  if (!context || context.outline.length === 0) return ''
  const lines = context.outline.map((o, i) => {
    const marker = i === currentIndex ? ' ← 本槽位' : ''
    return `  ${i + 1}. [${o.role}] ${o.prompt || '（未填提示词）'}${marker}`
  })
  return [
    `整份《${context.title}》共 ${context.outline.length} 个槽位，版面结构如下：`,
    ...lines,
    '语篇要求：你的稿件是其中一环。注意与相邻槽位分工不重叠、详略得当；如果是头条/首块要能镇住版面，后续槽位避免重复前文已述事实并做好承接过渡；全文风格统一（同一份报纸应像同一个人写的）。'
  ].join('\n')
}

/** 拼装单个槽位的生成提示词：全局规则 + 版面大纲 + 内容形式要求 + 用户提示词。
 *  settings 提供 P6b 增强；enabledTools 用于时效锚定（ROADMAP Q1） */
function buildSlotPrompt(
  prompt: string,
  role: string,
  kind: string,
  context?: DocContext,
  index = -1,
  estHeight = 45,
  settings?: AiSettings,
  enabledTools: ToolId[] = []
): string {
  const kindRules: Record<string, string> = {
    text: [
      '输出文本内容，可用以下表现力手段：',
      '- **加粗** 强调关键数字与主体、*斜体* 做轻强调；',
      '- "## 小标题" 分段（较长内容时），小标题要短而有力；',
      '- 首段首字会自动下沉放大，请把最重要的导语放开头；',
      '- 表达节奏：长短句交错；关键结论前置，细节展开在后；',
      '- 数字优先于形容词：能写 "+1.2%" 就不要写 "小幅上涨"；',
      buildWidgetPromptSection(),
      '- 有信息源时必须忠于源内容，重要事实需在源中可查证；',
      '- 不要使用其他 Markdown 语法（列表/引用/链接等）。'
    ].join('\n'),
    table: '输出一个表格。使用 | 分隔的 Markdown 表格语法，首行为表头；单元格内可用 **加粗** 强调关键数字。'
  }
  // 头条专属：引题/主标/副题三段式（ROADMAP Q4 报纸细节，渲染层按此结构特化排版）
  const headlineFormat = [
    '本槽是报纸头条，输出格式（严格遵循，共 2-3 行，每行独占一行）：',
    '第一行：引题——铺垫背景的短句，15 字内，结尾不加标点；',
    '第二行：# 主标题——全报最有力的那句话，25 字内（保留开头的 # 和空格）；',
    '第三行（可选）：副题——一句补充说明，40 字内。',
    '不要输出其他任何内容（不要加粗、不要小标题、不要控件、不要正文）。',
    '',
    '输出示例（严格模仿此结构）：',
    '全球算力竞赛进入能耗时代',
    '# 算力成为新的通用货币',
    '推理成本年降九成，平台话语权随电价重写'
  ].join('\n')
  const roleDef = Object.values(ROLE_DEFS).find((d) => d.name === role)
  // P6b：角色职责可被用户自定义覆盖（settings.roleDuties 以角色 key 存储默认生效）
  const roleKey = (Object.entries(ROLE_DEFS).find(([, v]) => v.name === role)?.[0] ?? role) as SlotRole
  const customDuty = settings?.roleDuties?.[roleKey]
  // 用户反馈：自定义角色库——role 名不在内置六角色时，从 customRoles 查职责
  const libraryDuty = settings?.customRoles?.find((c) => c.name === role)?.duty
  const roleSection = customDuty?.trim()
    ? `槽位职责（用户自定义）：${customDuty.trim()}`
    : libraryDuty?.trim()
      ? `槽位职责（自定义角色）：${libraryDuty.trim()}`
      : roleDef?.duty
        ? `槽位职责：${roleDef.duty}`
        : roleDef
          ? ''
          : `槽位职责（自定义角色）：你是报纸上的「${role}」栏目作者，按栏目定位写作。`
  const styleSection = settings?.stylePrompt?.trim()
    ? `本报风格（全局调性，所有内容需符合）：${settings.stylePrompt.trim()}`
    : ''
  // 容量换算：经验值约 4.5 字/mm（报纸字号），给出硬性字数上限防溢出破版
  const wordLimit = Math.max(40, Math.round(estHeight * 4.5))
  // 时效锚定（ROADMAP Q1）：未启用联网工具时禁止时效性事实陈述
  const canFetchFacts = enabledTools.includes('webSearch') || enabledTools.includes('fetchPage')
  const timelyAnchor = canFetchFacts
    ? '时效要求：本槽涉及今日事实（新闻/数据/发布）时，必须先调用搜索或抓取工具获取真实信息，再基于工具结果写作；禁止凭记忆编造日期与数字。'
    : '时效约束：本槽未启用联网工具，禁止陈述“今日/最新/刚刚发布”等时效性事实与具体当日数据；只写背景性、常识性或分析性内容。'
  const sections = [
    '你是一份个性化报纸的内容作者。请根据要求撰写该槽位内容。',
    buildOutlineSection(context, index),
    styleSection,
    roleSection,
    timelyAnchor,
    `控件建议：${ROLE_WIDGET_HINTS[roleKey] ?? '按栏目定位选用合适控件（见上方控件清单）'}`,
    `要求：内容紧凑、信息密度高、符合报纸文风。全文严格控制在 ${wordLimit} 字以内——这是版面物理容量的硬性上限，超出会被裁切；宁可精炼勿冗长，写完即止。`,
    `内容形式：${kind === 'headline' ? headlineFormat : kindRules[kind] ?? kindRules.text}`,
    `槽位主题要求：${prompt}`,
    // 头条三段式是硬性格式约束，置于提示词末尾以最强权重（AI 对末尾指令遵循率最高）
    ...(kind === 'headline' ? ['【重要】再强调一次输出格式：只输出 2-3 行——第一行引题、第二行“# 主标题”、第三行可选副题。不要输出小标题、控件或正文段落。'] : [])
  ]
  return sections.filter(Boolean).join('\n')
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface GenerateResult {
  content: string
  /** 本次生成的 token 用量（多次工具调用请求累加；ROADMAP Q5 度量） */
  usage?: TokenUsage
}

/**
 * 调用 OpenAI 兼容接口为单个槽位生成内容（按槽位工具配置动态启用工具）。
 * 失败时抛出异常，由调用方决定重试策略。
 */
export async function generateSlotContent(
  settings: AiSettings,
  prompt: string,
  role: string,
  kind: string,
  enabledTools: ToolId[],
  docContext?: DocContext,
  slotIndex = -1,
  sourceContents: { name: string; note: string; text: string }[] = [],
  signal?: AbortSignal,
  estHeight = 45,
  onTick?: (delta: string) => void,
  fileSources: FileSourceContent[] = []
): Promise<GenerateResult> {
  if (!settings.apiKey) throw new Error('未配置 API Key')
  if (!settings.model) throw new Error('未配置模型名')

  // 手动实现工具调用循环（对各家 OpenAI 兼容端点兼容性最稳）：
  const url = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions'
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }
  const toolDefs = buildTools(settings, enabledTools, fileSources)
  const openaiTools = Object.entries(toolDefs).map(([name, t]) => ({
    type: 'function' as const,
    function: {
      name,
      description: (t as { description?: string }).description,
      // inputSchema 是 zod schema，需转 JSON Schema；zod v4 提供 z.toJSONSchema
      parameters: z.toJSONSchema((t as { inputSchema: z.ZodType }).inputSchema)
    }
  }))
  const messages: unknown[] = [
    {
      role: 'user',
      content: [
        buildSlotPrompt(prompt, role, kind, docContext, slotIndex, estHeight, settings, enabledTools),
        // 信息源注入：AI 基于真实抓取内容写作，而非凭记忆
        ...(sourceContents.length > 0
          ? [
              '\n===== 信息源（今日真实内容摘录，请以此为主要事实依据，不要编造） =====',
              ...sourceContents.map(
                (s) => `[源：${s.name}${s.note ? `（${s.note}）` : ''}]\n${s.text.slice(0, 2000)}`
              ),
              '===== 信息源结束 ====='
            ]
          : [])
      ].join('\n')
    }
  ]

  /** 本次生成的 token 用量（多次工具调用请求累加；ROADMAP Q5 度量） */
  let usage: TokenUsage | undefined

  // 上限放宽到 12：一轮可能并行发多个 tool_calls，每次请求算一步。
  // 流式输出：正文增量通过 onTick 回调心跳（ROADMAP 用户反馈：长等待需可见变化）
  for (let step = 0; step < 12; step++) {
    // 超时机制（v0.30 用户需求）：只要还在输出就不中断——空闲 90s 无数据才断，总上限 600s
    const sa = streamAbort(signal)
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: settings.model, messages, tools: openaiTools, stream: true, stream_options: { include_usage: true } }),
      signal: sa.signal
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`AI 接口错误 ${res.status}: ${errText.slice(0, 200)}`)
    }
    if (!res.body) throw new Error('AI 返回了空响应流')

    // 解析 SSE：累积正文（心跳回调）与工具调用增量（按 index 拼装分片）
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let content = ''
    const toolAcc: { id: string; function: { name: string; arguments: string } }[] = []
    let finished = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      sa.tick() // 有数据流动：重置空闲计时（长文生成不中断）
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') {
          if (payload === '[DONE]') finished = true
          continue
        }
        let chunk: {
          choices?: {
            delta?: {
              content?: string
              tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]
            }
          }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        }
        try {
          chunk = JSON.parse(payload)
        } catch {
          continue
        }
        const delta = chunk.choices?.[0]?.delta
        if (chunk.usage) {
          usage = {
            promptTokens: (usage?.promptTokens ?? 0) + (chunk.usage.prompt_tokens ?? 0),
            completionTokens: (usage?.completionTokens ?? 0) + (chunk.usage.completion_tokens ?? 0),
            totalTokens: (usage?.totalTokens ?? 0) + (chunk.usage.total_tokens ?? 0)
          }
        }
        if (!delta) continue
        if (delta.content) {
          content += delta.content
          onTick?.(delta.content)
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            toolAcc[idx] ??= { id: '', function: { name: '', arguments: '' } }
            if (tc.id) toolAcc[idx].id = tc.id
            if (tc.function?.name) toolAcc[idx].function.name = tc.function.name
            if (tc.function?.arguments) toolAcc[idx].function.arguments += tc.function.arguments
          }
        }
      }
    }
    void finished
    const msg = {
      role: 'assistant' as const,
      content,
      ...(toolAcc.length > 0
        ? { tool_calls: toolAcc.filter((t) => t.function.name).map((t) => ({ type: 'function' as const, ...t })) }
        : {})
    }
    if (!msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) throw new Error('AI 返回了空响应')

    // 无工具调用 → 拿到正文，结束
    if (!msg.tool_calls?.length) {
      return { content, usage }
    }

    // 有工具调用 → 本地执行 → 回传结果继续
    messages.push(msg)
    for (const tc of msg.tool_calls) {
      const impl = toolDefs[tc.function.name]
      let result: unknown
      if (!impl) {
        result = { error: `未知工具 ${tc.function.name}` }
      } else {
        try {
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
          result = await impl.execute(args)
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) }
        }
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result ?? {}) })
    }
  }

  // 步数耗尽：强制让模型基于已有工具结果直接写出正文（不再提供工具）
  const finalRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: settings.model, messages }),
    signal: AbortSignal.any([AbortSignal.timeout(600_000), ...(signal ? [signal] : [])])
  })
  if (!finalRes.ok) throw new Error(`AI 接口错误 ${finalRes.status}`)
  const finalData = (await finalRes.json()) as {
    choices?: { message?: { content?: unknown } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  if (finalData.usage) {
    usage = {
      promptTokens: (usage?.promptTokens ?? 0) + (finalData.usage.prompt_tokens ?? 0),
      completionTokens: (usage?.completionTokens ?? 0) + (finalData.usage.completion_tokens ?? 0),
      totalTokens: (usage?.totalTokens ?? 0) + (finalData.usage.total_tokens ?? 0)
    }
  }
  const finalContent = finalData.choices?.[0]?.message?.content
  return {
    content:
      typeof finalContent === 'string' && finalContent.trim()
        ? finalContent
        : '（生成中断：模型连续调用工具未能完成内容，请重试或减少该槽位的工具）',
    usage
  }
}

// ---------- 编辑部三段式（ROADMAP Q2）：选题 / 审稿 ----------

/** 从模型输出中提取 JSON 对象（容忍 ```json 围栏与前后缀文本） */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('输出中未找到 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

/** SSE 流式请求：累积正文增量并逐段回调心跳（ROADMAP 用户反馈：长等待需可见变化）。
 *  返回完整正文；不处理工具调用。 */
async function streamChatText(
  settings: AiSettings,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onTick?: (delta: string) => void
): Promise<string> {
  const url = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions'
  // 流式：空闲 90s 无输出才断，总上限 600s（v0.30）
  const sa = streamAbort(signal)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ ...body, stream: true }),
    signal: sa.signal
  })
  if (!res.ok) throw new Error(`AI 接口错误 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  if (!res.body) throw new Error('AI 返回了空响应流')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let content = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const delta = (JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta
        if (delta?.content) {
          content += delta.content
          onTick?.(delta.content)
        }
      } catch {
        // 忽略无法解析的行（心跳容错）
      }
    }
  }
  if (!content.trim()) throw new Error('AI 返回了空响应')
  return content
}

/** 单次无工具对话（编辑部阶段专用）：流式输出，onTick 逐段回调心跳 */
async function chatOnce(
  settings: AiSettings,
  messages: { role: 'system' | 'user'; content: string }[],
  signal?: AbortSignal,
  modelOverride?: string,
  onTick?: (delta: string) => void
): Promise<string> {
  return streamChatText(
    settings,
    { model: modelOverride || settings.model, messages },
    signal,
    onTick
  )
}

const PLAN_SCHEMA = z.object({
  assignments: z
    .array(
      z.object({
        index: z.coerce.number().int().catch(-1),
        angle: z.string().catch(''),
        quota: z.coerce.number().int().optional().catch(undefined),
        avoid: z.string().optional().catch(undefined)
      })
    )
    .min(1)
})

/** 按槽位角色推荐控件组合（ROADMAP Q3 控件使用引导）：用户无需知道控件语法，AI 自动选用 */
const ROLE_WIDGET_HINTS: Record<string, string> = {
  头条: '本槽一般不用控件；如需现场画面可配一张 :::image',
  正文: '可用 :::quote 引用关键观点、:::info 补充背景说明、:::image 配一张相关图；数据对比处可插入 :::chart',
  数据: '优先用 :::chart（bar/line/pie）呈现数据对比与趋势，关键数字用 :::stat 统计卡，少写散文',
  快讯: '每条快讯中的关键数字可配 :::stat 统计卡，密集呈现',
  提示框: '用 :::info 呈现提示/声明（tone 可选 info/warn/success）',
  自定义: '按栏目定位选用合适控件（见上方控件清单）'
}

const REVIEW_SCHEMA = z.object({
  comments: z.array(
    z.object({
      index: z.coerce.number().int().catch(-1),
      problem: z.string().catch(''),
      instruction: z.string().catch('')
    })
  )
})

/** 选题单条目 */
export interface IssueAssignment {
  index: number
  angle: string
  quota?: number
  avoid?: string
}

/** 审稿意见条目 */
export interface ReviewComment {
  index: number
  problem: string
  instruction: string
}

/**
 * 配图闭环（ROADMAP Q3）：把 AI 输出的 :::image{query:"意图"} 用 Tavily 图搜回填真实 URL。
 * 逐个处理：搜到 → url=首图；搜不到/无 Key → 移除该控件行（宁缺毋滥，不留破图占位）。
 * 失败不抛异常（配图是增强项，失败不影响正文）。
 */
export async function resolveImageQueries(content: string, tavilyKey: string): Promise<string> {
  if (!tavilyKey || !content.includes(':::image')) return content
  const lines = content.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    const match = /^:::image\{(.*)\}$/.exec(trimmed)
    if (!match) {
      out.push(line)
      continue
    }
    // 解析控件参数（k:"v" 键值对）
    const params: Record<string, string> = {}
    const kv = /(\w+):"((?:[^"\\]|\\.)*)"/g
    let m: RegExpExecArray | null
    while ((m = kv.exec(match[1])) !== null) params[m[1]] = m[2].replace(/\\"/g, '"')
    const query = params.query?.trim()
    if (!query) continue // 无意图：丢弃该行
    try {
      const images = await tavilyImageSearch(tavilyKey, query)
      const url = images[0]
      if (url) {
        const caption = params.caption ? ` caption:"${params.caption}"` : ''
        out.push(`:::image{url:"${url}"${caption}}`)
      }
      // 搜不到图：丢弃该行（宁缺毋滥）
    } catch {
      // 搜索失败：丢弃该行，不影响正文
    }
  }
  return out.join('\n')
}

/**
 * 选题：编辑通览全部槽位与信息源摘要，为每槽定选题/角度/字数配额，保证互不重复。
 * 失败抛异常，由调用方降级为旧流程。
 */
export async function planIssue(
  settings: AiSettings,
  outline: { index: number; role: string; prompt: string }[],
  sourceDigests: { name: string; text: string }[],
  signal?: AbortSignal,
  onTick?: (delta: string) => void
): Promise<IssueAssignment[]> {
  const messages = [
    {
      role: 'system' as const,
      content: [
        '你是一家个性化报纸的选题编辑。请通览全部版面槽位与信息源摘要，为每个槽位分配互不重复的选题角度。',
        '规则：头条给最有分量的选题；数据槽专注数字；快讯覆盖未被头条与正文使用的小事件；相邻槽位角度必须错开。',
        '只输出 JSON，格式：{"assignments":[{"index":槽位序号,"angle":"一句话选题（含切入角度）","quota":建议字数,"avoid":"需与哪个槽位错开什么"}]}',
        'index 必须覆盖全部槽位，一字不差。'
      ].join('\n')
    },
    {
      role: 'user' as const,
      content: [
        `报纸标题：${settings.stylePrompt?.trim() ? `（本报调性：${settings.stylePrompt.trim()}）` : ''}`,
        '槽位清单：',
        ...outline.map((o) => `${o.index}. [${o.role}] ${o.prompt.slice(0, 80)}`),
        '',
        '信息源摘要（今日真实内容，选题必须从中取材）：',
        ...sourceDigests.map((s) => `[${s.name}]\n${s.text.slice(0, 1200)}`)
      ].join('\n')
    }
  ]
  const raw = await chatOnce(settings, messages, signal, settings.editorial?.reviewModel, onTick)
  const parsed = PLAN_SCHEMA.parse(extractJson(raw))
  return parsed.assignments
}

/**
 * 审稿：通读全部成品，查重复/超限/断裂，输出修改指令（不直接改文）。
 * 无问题时返回空数组；失败抛异常，由调用方忽略。
 */
export async function reviewIssue(
  settings: AiSettings,
  articles: { index: number; role: string; content: string }[],
  signal?: AbortSignal,
  onTick?: (delta: string) => void
): Promise<ReviewComment[]> {
  const messages = [
    {
      role: 'system' as const,
      content: [
        '你是报纸主编，正在审阅一期报纸的全部稿件。检查：槽位间内容重复、明显事实断裂、与槽位职责不符。',
        '只输出 JSON，格式：{"comments":[{"index":槽位序号,"problem":"问题一句话","instruction":"给该槽位作者的重写指令（含应保留什么、避开什么）"}]}',
        '没有需要修改的稿件时输出 {"comments":[]}。宁缺毋滥：只指出确凿的问题。'
      ].join('\n')
    },
    {
      role: 'user' as const,
      content: ['全部稿件：', ...articles.map((a) => `【${a.index}. ${a.role}】\n${a.content.slice(0, 1500)}`)].join('\n\n')
    }
  ]
  const raw = await chatOnce(settings, messages, signal, settings.editorial?.reviewModel, onTick)
  const parsed = REVIEW_SCHEMA.parse(extractJson(raw))
  return parsed.comments
}

/** 摘要结构（宽容解析） */
const SUMMARY_SCHEMA = z.object({
  headline: z.string(),
  points: z.array(z.string())
})

/**
 * 出刊归档：AI 把本期各栏内容提炼成记忆摘要（下期防重复 + 连载承接的关键事实载体）。
 * 保留关键事实（数字/名称/事件/进度），去掉修饰与评论；points 须覆盖全部栏目。
 * 失败抛异常，由调用方降级为零成本截断摘要。
 */
export async function summarizeIssue(
  settings: AiSettings,
  articles: { role: string; content: string }[],
  signal?: AbortSignal,
  onTick?: (delta: string) => void
): Promise<{ headline: string; points: string[] }> {
  const messages = [
    {
      role: 'system' as const,
      content: [
        '你是一家个性化报纸的档案员，负责把每期内容提炼成供下期使用的记忆摘要（用途：避免重复报道、支持连载延续）。',
        '规则：headline 给一句本期头条；points 为每栏一条 1~2 句的要点（保留关键事实：数字、名称、事件、进展），不要修饰语与评论。',
        '只输出 JSON，格式：{"headline":"本期头条","points":["栏目：要点", ...]}。points 必须覆盖全部栏目，顺序与输入一致。'
      ].join('\n')
    },
    {
      role: 'user' as const,
      content: ['本期全部栏目：', ...articles.map((a) => `[${a.role}]\n${a.content.slice(0, 1200)}`)].join('\n\n')
    }
  ]
  const raw = await chatOnce(settings, messages, signal, settings.editorial?.reviewModel, onTick)
  return SUMMARY_SCHEMA.parse(extractJson(raw))
}
