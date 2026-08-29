/**
 * 控件协议解析器测试：直接 import 源文件（Node 24 原生 TS），与实现零漂移。
 * 用法：node --experimental-strip-types scripts/test-parse.mjs
 */
import { parseContent } from '../src/shared/parse.ts'
import { WIDGET_REGISTRY } from '../src/shared/widgets.ts'

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

// 混合样例：小标题 + 段落 + 两个控件
const sample = `## 市场概览
今日 A 股 **高开高走**，科技板块领涨。

:::stat{label:"沪指涨幅", value:"+1.2%", trend:"up", note:"创近月新高"}

:::quote{text:"市场底色仍是结构性行情", source:"某券商首席"}

收盘时三大指数集体收涨。`

const nodes = parseContent(sample)
assert(nodes.length === 5, `应有 5 个节点（实际 ${nodes.length}）`)
assert(nodes[0].type === 'heading' && nodes[0].text === '市场概览', '小标题解析')
assert(nodes[1].type === 'paragraph' && nodes[1].text.includes('**高开高走**'), '段落保留行内语法')
assert(nodes[2].type === 'widget' && nodes[2].id === 'stat' && nodes[2].params.value === '+1.2%', 'stat 控件参数')
assert(nodes[3].type === 'widget' && nodes[3].id === 'quote' && nodes[3].params.source === '某券商首席', 'quote 控件参数')
assert(nodes[4].type === 'paragraph', '尾段落')

// 未知控件安全回落为段落
const bad = parseContent('普通文本 :::unknown{x:1} 还是普通文本')
assert(bad.length === 1 && bad[0].type === 'paragraph', '未知控件回落为段落')

// 注册表完整性：每个控件必须同时有 usage 和 params
for (const [id, def] of Object.entries(WIDGET_REGISTRY)) {
  assert(def.usage && Object.keys(def.params).length > 0, `注册表完整性: ${id}`)
}

// 时间线多事件解析
const tl = parseContent(':::timeline{items:"09:30|高开; 10:15|拉升; 15:00|收盘"}')
assert(tl[0].type === 'widget' && tl[0].params.items.includes('15:00|收盘'), 'timeline 多事件')

// ---- enforceLength：长度工程（段落边界重组，控件永保留） ----
{
  const { enforceLength } = await import('../src/shared/parse.ts')
  const content = [
    '第一段内容，大约三十个字左右的一段文字用于测试长度计算。',
    ':::chart{type:"bar" title:"图" data:"a|1; b|2"}',
    '第二段内容，也是三十个字左右的一段文字继续用于测试长度上限裁剪逻辑。',
    '第三段内容，超长的最后一段，应当被整体丢弃而不腰斩句子结尾。'
  ].join('\n\n')
  const r = enforceLength(content, 40)
  assert(r.truncated, '超限时应标记 truncated')
  assert(r.text.includes(':::chart'), '控件行永保留')
  assert(!r.text.includes('第三段'), '尾部超限段落被丢弃')
  assert(r.text.includes('（因版面所限'), '删节提示附注')
  // 未超限：原样返回
  const r2 = enforceLength('短文本', 100)
  assert(!r2.truncated && r2.text === '短文本', '未超限原样返回')
}

// ---- countContentChars：控件块剥离计字（体积协调口径） ----
{
  const { countContentChars } = await import('../src/shared/parse.ts')
  // 多行块（:::chart 开块，块内数据行，::: 闭合）全部不计
  const multi = ['正文三十个字左右的一段话用于验证统计口径是否正确。', ':::chart', '标签一|123', '标签二|456', ':::', '尾部一段话。'].join('\n')
  const c1 = countContentChars(multi)
  assert(!c1.toString().includes('0'), '有正文时字数不为零')
  assert(c1 === 31, `多行控件块内数据行不计入（期望 31，实际 ${c1}）`)
  // 单行控件（带 {} 参数）不开块，后续正文正常计入
  const single = [':::stat{value:"42" label:"指标"}', '统计之后的正文文字。'].join('\n')
  assert(countContentChars(single) === 10, `单行控件后续正文计入（期望 10，实际 ${countContentChars(single)}）`)
  // 纯文字
  assert(countContentChars('只有文字。') === 5, '纯文字计数')
  assert(countContentChars('') === 0, '空内容为零')
}

// ---- estimateQuota：控件按占版面积折算等效字数（体积协调口径） ----
{
  const { estimateQuota } = await import('../src/shared/parse.ts')
  const text = '正文三十个字左右的一段话用于验证体积折算的口径是否正确有效。' // 30 字
  // 图形型控件：stat 15mm×4.5 = 68 等效字
  const s1 = estimateQuota(`${text}\n:::stat{value:"+1.2%" label:"沪指涨幅"}`)
  assert(s1 === 30 + 68, `stat 折算 68 等效字（期望 ${30 + 68}，实际 ${s1}）`)
  // timeline：2 事件 16mm×4.5 = 72
  const s2 = estimateQuota(':::timeline{items:"09:30|高开; 10:15|拉升"}')
  assert(s2 === 72, `timeline 2 事件折算 72（期望 72，实际 ${s2}）`)
  // chart：3 数据点 49mm×4.5 = 221（40 + 3×3 = 49mm）
  const s3 = estimateQuota(':::chart{type:"bar" title:"图" data:"a|1; b|2; c|3"}')
  assert(s3 === 221, `chart 3 数据点折算 221（期望 221，实际 ${s3}）`)
  // 文字型控件 info：底高 10mm×4.5=45 + 参数文字（tone "warn" 4 字 + text 6 字）
  const s4 = estimateQuota(':::info{tone:"warn" text:"数据截至发稿"}')
  assert(s4 === 45 + 10, `info 底高+参数文字（期望 ${45 + 10}，实际 ${s4}）`)
  // 多个控件叠加
  const s5 = estimateQuota(`${text}\n:::image{query:"meeting" caption:"现场"}\n:::stat{value:"5%" label:"涨幅"}`)
  assert(s5 === 30 + 144 + 68, `多控件叠加（期望 ${30 + 144 + 68}，实际 ${s5}）`)
  // 纯文字与空内容（兼容旧口径）
  assert(estimateQuota(text) === 30, '纯文字计数不变')
  assert(estimateQuota('') === 0, '空内容为零')
}

console.log('✅ 控件协议解析全部断言通过')
