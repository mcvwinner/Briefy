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

// ---- countContentChars：单行控件剥离计字（v0.34.4 口径对齐渲染层） ----
{
  const { countContentChars } = await import('../src/shared/parse.ts')
  // 单行控件（带 {} 参数）剥离，后续正文正常计入
  const single = [':::stat{value:"42" label:"指标"}', '统计之后的正文文字。'].join('\n')
  assert(countContentChars(single) === 10, `单行控件剥离（期望 10，实际 ${countContentChars(single)}）`)
  // 无参 ::: 行（未闭合块）：按文字计——旧逻辑会把后续正文全剥离计 0（误判为空，v0.34.4 修复）
  const unclosed = [':::chart', '标签一|123', '标签二|456', '未闭合块后的正文要照常计入字数。'].join('\n')
  const cu = countContentChars(unclosed)
  assert(cu > 0 && cu === ':::chart标签一|123标签二|456未闭合块后的正文要照常计入字数。'.replace(/\s+/g, '').length, `未闭合块不吞正文（实际 ${cu}）`)
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
  // 表格按行折算（v0.34.3 修正）：6 行表（含分隔行）= 6×25=150 等效字，不再按字符低估 3 倍
  const table6 = '| 名称 | 数值 |\n|---|---|\n| a | 1 |\n| b | 2 |\n| c | 3 |\n| d | 4 |'
  assert(estimateQuota(table6) === 150, `表格 6 行折算 150（实际 ${estimateQuota(table6)}）`)
  // 未闭合非标准块不再吞正文（v0.34.4 修复）：块后正文照常按文字计
  // 构成：':::chart' 8 字符 + 两行数据（非 | 开头，按文字 7+7）+ 正文 22 = 44；旧逻辑把块后正文全吞掉
  const unclosed = ':::chart\n标签一|123\n标签二|456\n未闭合块后的这段正文有十八个字左右用于验证。'
  const uq = estimateQuota(unclosed)
  assert(uq === 44, `未闭合块后正文照常计数（期望 44，实际 ${uq}）`)
}

// ---- quotaRange：字数合格区间（v0.34.4：下限 85%，大槽位固定冗余） ----
{
  const { quotaRange } = await import('../src/shared/parse.ts')
  const small = quotaRange(200)
  assert(small.min === 170 && small.max === 230, `小槽位比例 85%~115%（实际 ${small.min}~${small.max}）`)
  const big = quotaRange(2000)
  assert(big.min === 1900 && big.max === 2150, `大槽位固定冗余 -100/+150（实际 ${big.min}~${big.max}）`)
  const edge = quotaRange(600)
  assert(edge.min === 510 && edge.max === 690, `边界 600 字仍用比例（实际 ${edge.min}~${edge.max}）`)
}

// ---- widgetQuotaHint：控件等效成本提示词（与 estimateQuota 同口径，v0.34.3） ----
{
  const { widgetQuotaHint } = await import('../src/shared/parse.ts')
  const hint = widgetQuotaHint()
  assert(hint.includes('配图≈144字'), 'image 32mm→144')
  assert(hint.includes('二维码≈117字'), 'qrcode 26mm→117')
  assert(hint.includes('图表≈180字'), 'chart 40mm→180')
  assert(hint.includes('表格每行≈25字'), '表格行 5.5mm→25')
}

// ---- hasRichMedia：富媒体嗅探（增字号填充跳过依据，v0.34.2） ----
{
  const { hasRichMedia } = await import('../src/shared/parse.ts')
  // 图形型控件命中
  assert(hasRichMedia('正文\n:::image{query:"city" caption:"图"}'), 'image 控件命中')
  assert(hasRichMedia(':::qrcode{data:"https://x"}'), 'qrcode 控件命中')
  assert(hasRichMedia(':::chart{type:"bar" title:"图" data:"a|1; b|2"}'), 'chart 控件命中')
  // Markdown 表格命中（≥3 行以 | 开头）
  assert(hasRichMedia('| 表头 |\n|---|---|\n| a | b |'.replace('|---|---|', '|---|---|')), '表格命中')
  // 文字型控件不命中（quote/info/stat/timeline 可随字号安全缩放）
  assert(!hasRichMedia('正文\n:::quote{text:"引言" source:"某人"}'), 'quote 不命中')
  assert(!hasRichMedia(':::stat{value:"5%" label:"涨幅"}'), 'stat 不命中')
  assert(!hasRichMedia('纯文字内容'), '纯文字不命中')
  assert(!hasRichMedia(''), '空内容不命中')
  assert(!hasRichMedia(undefined), 'undefined 不命中')
}

console.log('✅ 控件协议解析全部断言通过')
