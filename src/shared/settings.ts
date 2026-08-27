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
}

export type ThemeMode = 'light' | 'dark'

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: '',
  baseUrl: '',
  model: '',
  theme: 'light',
  tavilyKey: ''
}
