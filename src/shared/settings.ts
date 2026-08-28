/** 信息源定义：生成时主进程抓取其内容注入对应槽位提示词。
 *  源是槽位属性（随 .briefy/预设保存）；settings 里这份是"常用信息源"收藏夹，供槽位快速导入复用 */
export interface InfoSource {
  id: string
  name: string
  url: string
  /** 给 AI 的说明：这个源是什么、关注什么 */
  note: string
}

/** AI 服务配置 + 外观偏好，持久化在应用 userData 目录 */
export interface AiSettings {
  /** API 密钥 */
  apiKey: string
  /** 接口地址，如 https://api.openai.com/v1 */
  baseUrl: string
  /** 模型名，如 gpt-4o-mini */
  model: string
  /** 界面主题 */
  theme: ThemeMode
  /** Tavily 搜索 API Key（可选，不填则搜索工具不可用） */
  tavilyKey: string
  /** 常用信息源收藏夹（槽位从中导入内联副本；不是生成时的直接引用） */
  sources: InfoSource[]
}

export type ThemeMode = 'light' | 'dark'

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: '',
  baseUrl: '',
  model: '',
  theme: 'light',
  tavilyKey: '',
  sources: []
}
