/** 信息源定义：生成时主进程抓取/读取其内容注入对应槽位提示词。
 *  源是槽位属性（随 .briefy/预设保存）；settings 里这份是"常用信息源"收藏夹，供槽位快速导入复用 */
export interface InfoSource {
  id: string
  name: string
  url: string
  /** 给 AI 的说明：这个源是什么、关注什么 */
  note: string
  /** 源类型：web = 网页（url 抓取）；file = 本地文件（path 读取，AI 经 readSource 工具按需分块读取）。缺省 web 兼容旧数据 */
  kind?: 'web' | 'file'
  /** 本地文件绝对路径（kind === 'file' 时有效） */
  path?: string
}

/**
 * 版式偏好（P6a 版式参数）：全部可选，缺省 = 内置默认（现有稳定体验）。
 * 修改后影响流式排布/分页计算与渲染（页边距/栏距/字体/字号/行距/主题色）。
 */
export interface LayoutPrefs {
  /** 页边距 mm（默认 15，范围 10–25） */
  marginMM?: number
  /** 栏间距 mm（默认 8，范围 4–12） */
  gapMM?: number
  /** 正文字体（CSS font-family，默认主题无衬线） */
  fontFamily?: string
  /** 正文字号 pt（默认 10，范围 8–14） */
  fontSizePt?: number
  /** 正文行距（默认 1.5，范围 1.2–2.0） */
  lineHeight?: number
  /** 主题色（品牌色 hex，默认 Fluent 品牌蓝） */
  accentColor?: string
  /** 正文分栏（ROADMAP Q3）：body 槽位文字多栏流式；1 = 单栏（默认） */
  columns?: number
  /** 黑白优先：灰阶渲染（兼容黑白打印机，导出 PDF 同样灰阶） */
  grayscale?: boolean
  /** 页眉页脚（P6c）：报头/日期/页码，绘制在页边距区不占内容高 */
  header?: {
    title?: boolean
    date?: boolean
    pageNo?: boolean
    /** 报头文字（留空 = 用文档标题） */
    text?: string
  }
  /** 来源署名显示（v0.34.1）：槽位尾部的「来源：xxx」小字；默认显示，关闭后预览与导出均不渲染 */
  showSources?: boolean
}

/** 自定义角色（用户反馈：支持添加新角色）：
 *  用户自建角色库（名称+职责），槽位选"自定义"角色时可指定角色名，AI 按该职责写作 */
export interface CustomRole {
  /** 角色名（唯一标识，如"情感专栏"） */
  name: string
  /** 职责描述（喂给 AI） */
  duty: string
}

/** 编辑部三段式（ROADMAP Q2）：选题→写作→审稿；默认关 = 旧逐槽独立流程。
 *  plannerNote/reviewerNote（v0.30）：用户直接给选题/审稿编辑的特别指令（可控性通道） */
export interface EditorialPrefs {
  /** 启用编辑部模式 */
  enabled?: boolean
  /** 选题/审稿模型（留空 = 主模型） */
  reviewModel?: string
  /** 选题编辑特别指令（如“本期重点报道 X”“多挖掘小众项目”） */
  plannerNote?: string
  /** 审稿编辑特别指令（如“严查数字与日期”“标题多用疑问句”） */
  reviewerNote?: string
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
  /** 版式偏好（P6a，全部可选） */
  layout?: LayoutPrefs
  /** 全局风格提示词（本报调性，注入每次生成；P6b） */
  stylePrompt?: string
  /** 角色职责自定义（覆盖 ROLE_DEFS duty；P6b） */
  roleDuties?: Partial<Record<string, string>>
  /** 编辑部三段式（ROADMAP Q2） */
  editorial?: EditorialPrefs
  /** 自定义角色库（用户反馈：支持添加新角色） */
  customRoles?: CustomRole[]
  /** 实验性（v0.34.1，自订阅创建对话框迁入）：手动布局出刊时自动适配版面——调整槽位高度/位置与字号以贴合内容。
   *  默认关 = 严格保持模板几何（超容裁剪+质检标记）。仅订阅出刊链路使用 */
  experimentalLayoutFit?: boolean
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
