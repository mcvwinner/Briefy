import type { AiSettings } from './settings'

/** 区块槽位角色（P4 槽位化：给坐标赋予语义，AI 按角色理解职责） */
export type BlockRole = 'headline' | 'stats' | 'body' | 'briefs' | 'custom'

/** 各角色的职责描述（喂给 AI）与默认布局特征 */
export const ROLE_DEFS: Record<BlockRole, { name: string; duty: string }> = {
  headline: { name: '头条', duty: '全宽镇版头条：写最有分量的导语，克制而有力，不要细节堆砌。' },
  stats: { name: '数据', duty: '数据窗口：优先用 :::stat 统计卡呈现 2-3 个关键数字，少写散文。' },
  body: { name: '正文', duty: '深度正文：可用 ## 小标题分段展开，与头条内容承接但不重复。' },
  briefs: { name: '快讯', duty: '快讯栏：每条一句话，用 **日期/主体** 开头，短促密集。' },
  custom: { name: '自定义', duty: '' }
}

/** 区块内容形式（text-image/image 需生图服务，已按用户要求移除） */
export type BlockKind = 'text' | 'table'

/** 内容生成状态 */
export type BlockStatus = 'empty' | 'generating' | 'done' | 'error'

/** 本轮内置的 AI 工具标识 */
export type ToolId = 'getCurrentTime' | 'webSearch' | 'fetchPage'

/** 文档级语篇上下文：让 AI 知道整份报纸的结构与自己的位置 */
export interface DocContext {
  title: string
  /** 各区块摘要，按版面顺序：[{ position: "第1页·左上", prompt: "科技头条" }] */
  outline: { position: string; prompt: string }[]
}

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
