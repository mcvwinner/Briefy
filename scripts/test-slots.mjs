/**
 * 槽位版式规则测试：flowSlots 流式排布 / paginate 自动分页 / v1→v2 迁移。
 * 用法：node scripts/test-slots.mjs（与 src/shared/layout.ts 同步维护）
 */
import {
  flowSlots,
  paginate,
  parseLayoutDoc,
  migrateSlotSources,
  MARGIN_MM,
  SLOT_GAP_MM,
  PAGE_HEIGHT_MM
} from '../src/shared/layout.ts'
import { PRESETS, buildDocFromPreset } from '../src/shared/presets.ts'

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

// ---- flowSlots：同列流式排布 ----
const mkSlot = (x, y, estHeight, overflow = 0) => ({
  id: crypto.randomUUID(),
  role: 'custom',
  region: { x, y, width: 180 },
  estHeight,
  kind: 'text',
  prompt: '',
  tools: ['getCurrentTime'],
  status: 'empty',
  overflow
})

// 两个全宽槽位：第二个 y = 第一个底部 + 间距
{
  const slots = flowSlots([mkSlot(15, 999, 45), mkSlot(15, 999, 60)])
  assert(slots[0].region.y === MARGIN_MM, 'flowSlots: 首槽贴页边距')
  assert(
    slots[1].region.y === MARGIN_MM + 45 + SLOT_GAP_MM,
    `flowSlots: 次槽顺延（期望 ${MARGIN_MM + 45 + SLOT_GAP_MM}，实际 ${slots[1].region.y}）`
  )
}

// 左右半栏不同列，互不影响
{
  const slots = flowSlots([mkSlot(15, 999, 45), mkSlot(110, 999, 60)])
  assert(slots[1].region.y === MARGIN_MM, 'flowSlots: 不同列各自从头排')
}

// ---- paginate：超页自动搬到新页 ----
{
  // 构造一个累计高度必然超页的文档（三个 150mm 高的槽位 > 297-30 可用高度）
  const tall = mkSlot(15, MARGIN_MM, 150)
  const page = { id: 'p1', slots: [tall, { ...tall, id: 'b' }, { ...tall, id: 'c' }] }
  const pages = paginate([page])
  assert(pages.length >= 2, `paginate: 溢出槽位分页（实际 ${pages.length} 页）`)
  assert(pages[0].slots.length >= 1 && pages[0].slots.length < 3, 'paginate: 首页保留能放下的槽位')
}

// ---- paginate：列内回填（大槽位放不下不阻塞同列后续小槽位） ----
{
  // 全宽列：90mm 放不下 + 后续 30mm 能放下 → 小槽应留在首页
  const big = mkSlot(15, MARGIN_MM, 90)
  const mid = { ...mkSlot(15, MARGIN_MM, 90), id: 'mid' }
  const small = { ...mkSlot(15, MARGIN_MM, 30), id: 'small' }
  // 页面已占用约 240mm（三个槽在别列装满）后追加：构造单列顺序 [big, small]
  // 可用高 267mm：先放 90 的头条（y=15），再放 240 的深度（放不下）→ 回填应让 30 的快讯上首页
  const page = {
    id: 'p1',
    slots: [{ ...mkSlot(15, MARGIN_MM, 90), id: 'a' }, big, mid, small]
  }
  const pages = paginate([page])
  const firstIds = pages[0].slots.map((s) => s.id)
  assert(
    firstIds.includes('small'),
    'paginate: 列内回填——放不下的大槽不阻塞后续小槽装入本页'
  )
  assert(!firstIds.every((id) => id === 'small' && firstIds.indexOf('a') === -1), 'paginate: 首槽强制保留')
}

// ---- parseLayoutDoc：v1 blocks 迁移为 v2 slots ----
{
  const v1 = JSON.stringify({
    version: 1,
    title: '旧报纸',
    pages: [
      {
        blocks: [
          {
            id: 'b1',
            x: 20,
            y: 30,
            width: 100,
            height: 55,
            prompt: '头条',
            kind: 'text',
            tools: ['getCurrentTime', 'readReference']
          }
        ]
      }
    ]
  })
  const doc = JSON.parse(JSON.stringify(parseLayoutDoc(v1)))
  assert(doc.version === 2, 'migrate: 版本升为 2')
  assert(doc.title === '旧报纸', 'migrate: 保留标题')
  assert(doc.pages[0].slots[0].role === 'custom', 'migrate: 旧块 role=custom')
  assert(doc.pages[0].slots[0].estHeight === 55, 'migrate: height → estHeight')
  assert(
    !doc.pages[0].slots[0].tools.includes('readReference'),
    'migrate: 过滤已废弃的 readReference 工具'
  )
}

// ---- 内置预设：按角色配默认工具（不能只带 getCurrentTime）----
{
  for (const preset of PRESETS) {
    const doc = buildDocFromPreset(preset)
    for (const page of doc.pages) {
      for (const slot of page.slots) {
        const hasContentTools =
          slot.tools.includes('webSearch') && slot.tools.includes('fetchPage')
        const ok =
          ['headline', 'body', 'briefs'].includes(slot.role) ? hasContentTools : slot.tools.includes('getCurrentTime')
        assert(ok, `预设 ${preset.id} 槽位角色 ${slot.role} 默认工具不完整（实际 ${slot.tools.join(',')}）`)
      }
    }
  }
}

// ---- 信息源迁移：旧 sourceIds 从常用源库解析为内联 sources ----
{
  const library = [
    { id: 's1', name: '源A', url: 'https://a.example.com', note: '' },
    { id: 's2', name: '源B', url: 'https://b.example.com', note: '备注' }
  ]
  const v2 = JSON.stringify({
    version: 2,
    title: '旧槽位文档',
    pages: [
      {
        id: 'p1',
        slots: [
          {
            id: 'slot1',
            role: 'body',
            region: { x: 15, y: 15, width: 180 },
            estHeight: 90,
            kind: 'text',
            prompt: '',
            tools: ['getCurrentTime'],
            sourceIds: ['s1', 'gone'],
            status: 'empty'
          }
        ]
      }
    ]
  })
  const doc = JSON.parse(JSON.stringify(parseLayoutDoc(v2, library)))
  const slot = doc.pages[0].slots[0]
  assert(Array.isArray(slot.sources), '迁移: sourceIds → sources 数组')
  assert(slot.sources.length === 1 && slot.sources[0].name === '源A', '迁移: 有效 id 解析为内联源，失效 id 丢弃')

  // 新格式（内联 sources 已存在）原样保留
  const migrated = migrateSlotSources(
    { sources: [{ id: 'x', name: 'N', url: 'https://n.example.com', note: '' }] },
    library
  )
  assert(migrated.sources.length === 1 && migrated.sources[0].id === 'x', '迁移: 新格式原样保留')
}

// 非法版本拒绝
{
  let rejected = false
  try {
    parseLayoutDoc(JSON.stringify({ version: 9, pages: [] }))
  } catch {
    rejected = true
  }
  assert(rejected, 'migrate: 未知版本拒绝')
}

console.log('✅ 槽位版式规则全部断言通过')
