/**
 * 槽位版式规则测试：flowSlots 流式排布 / paginate 自动分页 / v1→v2 迁移。
 * 用法：node scripts/test-slots.mjs（与 src/shared/layout.ts 同步维护）
 */
import {
  flowSlots,
  paginate,
  parseLayoutDoc,
  MARGIN_MM,
  SLOT_GAP_MM,
  PAGE_HEIGHT_MM
} from '../src/shared/layout.ts'

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
