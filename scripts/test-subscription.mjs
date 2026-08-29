/** 订阅共享逻辑断言：记忆组装/滚动/期摘要/连载检测（tsx 动态加载 TS） */
const { buildIssueSummary, buildMemoryBlock, isSerialPrompt, rollMemory } = await import('../src/shared/subscription.ts')

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

const doc = (contents) =>
  ({
    version: 2,
    title: '测试报',
    pages: contents.map((c) => ({
      id: 'p',
      slots: [{ id: 's', role: 'body', region: { x: 15, y: 15, width: 180 }, estHeight: 60, kind: 'text', prompt: '', tools: [], sources: [], status: 'done', content: c }]
    }))
  })

// ---- buildIssueSummary：头条首行 + 各槽要点截断 ----
const sum = buildIssueSummary(doc(['头条标题行\n第二行', 'B'.repeat(120)]), '2026/08/29 12:00')
assert(sum.headline === '头条标题行', '头条取首行')
assert(sum.points.length === 2, '每槽一个要点')
assert(sum.points[1].length <= 90, '要点截断（角色名+80 字）')

// ---- rollMemory：recent 容量 3，溢出并入 digest ----
let mem = { recent: [], digest: '' }
for (let i = 0; i < 3; i++) mem = rollMemory(mem, buildIssueSummary(doc([`第${i}期内容`]), `D${i}`))
assert(mem.recent.length === 3 && !mem.digest, '3 期内全在 recent')
mem = rollMemory(mem, buildIssueSummary(doc(['第3期内容']), 'D3'))
assert(mem.recent.length === 3, '滚动后 recent 保持 3')
assert(mem.digest.includes('第0期'), '最旧一期并入 digest')

// ---- buildMemoryBlock：含总览/最近期/去重指令 ----
const block = buildMemoryBlock(mem)
assert(block.includes('往期总览') && block.includes('第0期'), 'digest 注入')
assert(block.includes('最近第 3 期'), 'recent 带期序')
assert(block.includes('不得重复'), '去重指令')
assert(buildMemoryBlock({ recent: [], digest: '' }) === '', '无记忆时空块')

// ---- isSerialPrompt：连载意图检测 ----
assert(isSerialPrompt('继续昨天的观察'), '继续/昨天')
assert(isSerialPrompt('连载第二话'), '连载')
assert(!isSerialPrompt('写一篇全新的报道'), '无续写意图')

console.log('✅ 订阅共享逻辑全部断言通过')
