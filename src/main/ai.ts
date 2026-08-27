import { tool } from 'ai'
import { z } from 'zod'
import type { AiSettings } from '../shared/settings'
import type { ToolId } from '../shared/layout'
import { tavilySearch, fetchPageText } from './tools'

/**
 * 按区块配置动态组装工具集。
 * 时间不在提示词里硬编码，而是作为工具提供——需要时 AI 自己查询。
 */
function buildTools(settings: AiSettings, enabled: ToolId[]) {
  const tools: Record<string, ReturnType<typeof tool>> = {}

  if (enabled.includes('getCurrentTime')) {
    tools.getCurrentTime = tool({
      description:
        '获取当前的日期和时间（用户本地时区）。当内容涉及"今天/最新/近期"等时间概念时必须先调用此工具。',
      parameters: z.object({}),
      execute: async () => {
        const now = new Date()
        const weekDays = ['日', '一', '二', '三', '四', '五', '六']
        return {
          date: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
          weekday: `星期${weekDays[now.getDay()]}`,
          time: now.toLocaleTimeString('zh-CN', { hour12: false })
        }
      }
    })
  }

  if (enabled.includes('webSearch')) {
    if (!settings.tavilyKey) throw new Error('使用了搜索工具但未在设置中配置 Tavily Key')
    tools.webSearch = tool({
      description:
        '联网搜索最新信息。输入中文或英文关键词，返回前几条结果（标题/链接/摘要）。需要事实性、时效性内容时优先使用。',
      parameters: z.object({ query: z.string().describe('搜索关键词') }),
      execute: async ({ query }) => {
        const results = await tavilySearch(settings.tavilyKey, query)
        return results.map((r) => ({ title: r.title, url: r.url, summary: r.content }))
      }
    })
  }

  if (enabled.includes('fetchPage')) {
    tools.fetchPage = tool({
      description:
        '抓取指定网页的正文文本。用于深入了解 webSearch 结果中某条链接的完整内容。',
      parameters: z.object({ url: z.string().url().describe('要抓取的网页地址') }),
      execute: async ({ url }) => fetchPageText(url)
    })
  }

  return tools
}

/** 拼装单个区块的生成提示词：全局规则 + 内容形式要求 + 用户提示词 */
function buildBlockPrompt(prompt: string, kind: string): string {
  const kindRules: Record<string, string> = {
    text: '输出纯文本段落，不要使用 Markdown 标记。',
    'text-image':
      '输出内容分为两部分，用一行 --- 分隔：上半部分是文字；下半部分用一行 JSON 描述配图：{"image":"<英文绘图描述>"}。',
    table: '输出一个表格。使用 | 分隔的 Markdown 表格语法。',
    image: '只输出一行 JSON：{"image":"<英文绘图描述>"}'
  }
  return [
    '你是一份个性化报纸的内容作者。请根据要求撰写该区块内容。',
    '要求：内容紧凑、信息密度高、符合报纸文风；字数与区块大小匹配（宁可精炼勿冗长）。',
    `内容形式：${kindRules[kind] ?? kindRules.text}`,
    `区块主题要求：${prompt}`
  ].join('\n')
}

export interface GenerateResult {
  content: string
}

/**
 * 调用 OpenAI 兼容接口为单个区块生成内容（按区块工具配置动态启用工具）。
 * 失败时抛出异常，由调用方决定重试策略。
 */
export async function generateBlockContent(
  settings: AiSettings,
  prompt: string,
  kind: string,
  enabledTools: ToolId[]
): Promise<GenerateResult> {
  if (!settings.apiKey) throw new Error('未配置 API Key')
  if (!settings.model) throw new Error('未配置模型名')

  // 手动实现工具调用循环（对各家 OpenAI 兼容端点兼容性最稳）：
  // 第一轮若返回 tool_calls → 执行工具 → 把结果以 role:'tool' 回传 → 再请求直到产出正文
  const url = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions'
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }
  const toolDefs = buildTools(settings, enabledTools)
  const openaiTools = Object.entries(toolDefs).map(([name, t]) => ({
    type: 'function' as const,
    function: { name, description: t.description, parameters: t.parameters }
  }))
  const messages: unknown[] = [{ role: 'user', content: buildBlockPrompt(prompt, kind) }]

  for (let step = 0; step < 5; step++) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: settings.model, messages, tools: openaiTools })
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`AI 接口错误 ${res.status}: ${errText.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
    }
    const msg = data.choices?.[0]?.message
    if (!msg) throw new Error('AI 返回了空响应')

    // 无工具调用 → 拿到正文，结束
    if (!msg.tool_calls?.length) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '')
      return { content }
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
          result = await impl.execute(args as never, { messages: [], toolCallId: tc.id })
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) }
        }
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result ?? {}) })
    }
  }

  throw new Error('生成超时：模型陷入持续的工具调用')
}
