/** 用户配置的信息源：生成时主进程抓取其内容注入对应槽位提示词 */
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
  /** 信息源列表（C++ 安全站/GitHub Trending/番剧放送表…用户自配） */
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
