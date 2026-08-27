/** AI 服务配置（OpenAI 兼容格式），持久化在应用 userData 目录 */
export interface AiSettings {
  /** API 密钥 */
  apiKey: string
  /** 接口地址，如 https://api.openai.com/v1 */
  baseUrl: string
  /** 模型名，如 gpt-4o-mini */
  model: string
}

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: '',
  baseUrl: '',
  model: ''
}
