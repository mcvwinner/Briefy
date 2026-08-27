import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import type { AiSettings } from '../shared/settings'

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
 * 调用 OpenAI 兼容接口为单个区块生成内容。
 * 失败时抛出异常，由调用方决定重试策略。
 */
export async function generateBlockContent(
  settings: AiSettings,
  prompt: string,
  kind: string
): Promise<GenerateResult> {
  if (!settings.apiKey) throw new Error('未配置 API Key')
  if (!settings.model) throw new Error('未配置模型名')

  const provider = createOpenAICompatible({
    name: 'briefy-provider',
    apiKey: settings.apiKey,
    // baseUrl 为空时回退到 OpenAI 官方
    baseURL: settings.baseUrl || 'https://api.openai.com/v1'
  })

  const { text } = await generateText({
    model: provider.chatModel(settings.model),
    prompt: buildBlockPrompt(prompt, kind)
  })

  return { content: text }
}
