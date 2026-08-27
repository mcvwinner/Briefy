import type { AiSettings } from './settings'

/** 区块内容形式 */
export type BlockKind = 'text' | 'text-image' | 'table' | 'image'

/** 内容生成状态 */
export type BlockStatus = 'empty' | 'generating' | 'done' | 'error'

/** 本轮内置的 AI 工具标识 */
export type ToolId = 'getCurrentTime' | 'webSearch' | 'fetchPage' | 'readReference'

/** 页面上的一个内容区块（坐标单位 mm） */
export interface Block {
  id: string
  /** 相对页面左上角的位置（mm） */
  x: number
  y: number
  width: number
  height: number
  /** 用户输入的生成提示词 */
  prompt: string
  kind: BlockKind
  /** 允许此区块使用的 AI 工具 */
  tools: ToolId[]
  status: BlockStatus
  /** AI 填充的内容（Markdown 或纯文本） */
  content?: string
}

/** 一页 A4 */
export interface Page {
  id: string
  blocks: Block[]
}

/** 设计文档（保存即 .briefy 文件内容） */
export interface LayoutDoc {
  version: 1
  title: string
  pages: Page[]
}

/** 全局应用状态文档：设置 + 排版 */
export interface BriefyDoc {
  settings: AiSettings
  layout: LayoutDoc
}

export function createEmptyPage(): Page {
  return { id: crypto.randomUUID(), blocks: [] }
}

export function createEmptyDoc(): LayoutDoc {
  return { version: 1, title: '未命名报纸', pages: [createEmptyPage()] }
}

export function createBlock(x: number, y: number, width: number, height: number): Block {
  return {
    id: crypto.randomUUID(),
    x,
    y,
    width,
    height,
    prompt: '',
    kind: 'text',
    tools: ['getCurrentTime'],
    status: 'empty'
  }
}
