import type { Block } from './layout'

/**
 * 用户自定义预设（v1）：
 * 保存版面结构 + 提示词 + 工具配置，剥离生成内容（content/status）防隐私泄漏。
 */
export interface UserPreset {
  version: 1
  name: string
  /** 保存时间（ISO） */
  savedAt: string
  pages: { blocks: Omit<Block, 'content' | 'status'>[] }[]
}

/** 从区块剥离内容，得到可保存的预设区块 */
export function toPresetBlocks(blocks: Block[]): UserPreset['pages'][number]['blocks'] {
  return blocks.map(({ content: _content, status: _status, ...rest }) => rest)
}

/** 从预设区块还原为可编辑区块（恢复默认状态） */
export function fromPresetBlocks(
  presetBlocks: UserPreset['pages'][number]['blocks']
): Block[] {
  return presetBlocks.map((b) => ({
    ...b,
    status: 'empty' as const
  }))
}
