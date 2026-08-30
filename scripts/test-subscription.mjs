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

// ---- v0.33 记忆升级：3-gram 相似度 / 相关往期检索 / 降级拼接 / AI 压缩参数 ----
const { similarity, retrieveRelevantPast, mergeDigestFallback } = await import('../src/shared/subscription.ts')

assert(similarity('人工智能技术发展', '人工智能技术的最新发展迅速') > 0.3, '相似文本得分高')
assert(similarity('量子计算突破', '今天天气不错适合郊游') < 0.05, '无关文本得分低')
assert(similarity('', '任意文本') === 0, '空串得分为 0')

const pastIssues = [
  { id: 'i1', issuedAt: 'D1', pdfPath: '', quality: { passed: true, issues: [], repaired: 0 }, summary: { issuedAt: 'D1', headline: '', points: [] }, slots: [{ role: '数据', content: '新能源汽车销量突破五百万辆，同比增长三成，充电桩建设加速推进覆盖全国' }] },
  { id: 'i2', issuedAt: 'D2', pdfPath: '', quality: { passed: true, issues: [], repaired: 0 }, summary: { issuedAt: 'D2', headline: '', points: [] }, slots: [{ role: '头条', content: '航天员完成出舱活动，空间站建设进入新阶段，后续任务排定' }] }
]
const related = retrieveRelevantPast('分析新能源汽车市场最新销量数据', pastIssues, undefined)
assert(related.length === 1 && related[0].role === '数据', '检索命中相关槽位')
assert(related[0].snippet.includes('新能源'), '片段来自相关内容')
const relatedEx = retrieveRelevantPast('分析新能源汽车市场最新销量数据', pastIssues, 'i1')
assert(relatedEx.length === 0, '排除指定期后不命中')
const relatedIrrel = retrieveRelevantPast('今天食堂菜单有什么', pastIssues, undefined)
assert(relatedIrrel.length === 0, '无关主题不注入')
assert(retrieveRelevantPast('', pastIssues, undefined).length === 0, '空提示词不检索')

const fb = mergeDigestFallback('旧总览', [{ issuedAt: 'D9', headline: '新头条', points: ['要点一', '要点二'] }])
assert(fb.includes('旧总览') && fb.includes('D9') && fb.includes('要点一'), '降级拼接保留旧总览与新增期')
assert(mergeDigestFallback('', [{ issuedAt: 'D9', headline: 'H', points: [] }]).startsWith('【D9】'), '无旧总览时直接拼接')

// ---- rollMemory 第三参：AI 压缩 digest 优先于降级拼接 ----
const memAi = rollMemory(mem, buildIssueSummary(doc(['第4期内容']), 'D4'), 'AI整合后的总览')
assert(memAi.digest === 'AI整合后的总览', 'AI 压缩结果生效')
assert(memAi.recent.length === 3, 'AI 压缩下 recent 仍滚动')

console.log('✅ 订阅共享逻辑全部断言通过（含 v0.33 记忆升级）')
