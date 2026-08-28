import type { Slot, SlotStatus } from './layout'
import { migrateSlotSources } from './layout'
import type { InfoSource } from './settings'

/**
 * 用户自定义预设（v2，槽位化）：
 * 保存槽位版面 + 提示词 + 工具配置，剥离生成内容（content/status）防隐私泄漏。
 */
export interface UserPreset {
  version: 2
  name: string
  /** 保存时间（ISO） */
  savedAt: string
  pages: { slots: Omit<Slot, 'content' | 'status' | 'overflow'>[] }[]
}

/** 从槽位剥离内容，得到可保存的预设槽位 */
export function toPresetSlots(slots: Slot[]): UserPreset['pages'][number]['slots'] {
  return slots.map(({ content: _c, status: _s, overflow: _o, ...rest }) => rest)
}

/** 从预设槽位还原为可编辑槽位（恢复默认状态；旧 sourceIds 从常用源库迁移为内联源） */
export function fromPresetSlots(
  presetSlots: UserPreset['pages'][number]['slots'],
  sourceLibrary: InfoSource[] = []
): Slot[] {
  return presetSlots.map((s) => migrateSlotSources({ ...s, status: 'empty' as SlotStatus }, sourceLibrary))
}
