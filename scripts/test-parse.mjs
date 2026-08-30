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

// ---- estimateQuota：行数模型（v0.34.5 密度感知，与渲染层样式对齐） ----
{
  const { estimateQuota, quotaMetrics, slotWordCapacity } = await import('../src/shared/parse.ts')
  // 用 quotaMetrics 推导期望值（模型调参时断言自动适配）；另含首段下沉 10mm + 槽内边距 4.2mm 固定项
  const m = quotaMetrics({ widthMM: 87 }) // 缺省宽度 = 半栏（历史 4.5 字/mm 口径的来源）
  const eq = (mm) => Math.round(mm * m.charsPerMm)
  const paraMM = (chars) => Math.ceil(chars / m.charsPerLine) * m.lineHMM + 1.6 // 段行数取整 + 段距
  const BASE = 4.2 // 槽位内容区 padding
  const DROP = 10 // 首个文字段首字下沉

  const text = '正文三十个字左右的一段话用于验证体积折算的口径是否正确有效。' // 30 字
  // 图形型控件：stat 15mm 占版（宽度无关）按密度折算
  const s1 = estimateQuota(`${text}\n:::stat{value:"+1.2%" label:"沪指涨幅"}`)
  assert(s1 === eq(paraMM(30) + DROP + 4.2 + 15), `stat 折算（期望 ${eq(paraMM(30) + DROP + 4.2 + 15)}，实际 ${s1}）`)
  // timeline：2 事件 16mm（无文字段 → 无下沉项）
  const s2 = estimateQuota(':::timeline{items:"09:30|高开; 10:15|拉升"}')
  assert(s2 === eq(16 + 4.2), `timeline 2 事件（期望 ${eq(16 + 4.2)}，实际 ${s2}）`)
  // chart：3 数据点 49mm
  const s3 = estimateQuota(':::chart{type:"bar" title:"图" data:"a|1; b|2; c|3"}')
  assert(s3 === eq(49 + 4.2), `chart 3 数据点（期望 ${eq(49 + 4.2)}，实际 ${s3}）`)
  // 文字型控件 info：底高 10mm + 参数文字一行
  const s4 = estimateQuota(':::info{tone:"warn" text:"数据截至发稿"}')
  assert(s4 === eq(10 + m.lineHMM + 4.2), `info 底高+参数（期望 ${eq(10 + m.lineHMM + 4.2)}，实际 ${s4}）`)
  // 多个控件叠加
  const s5 = estimateQuota(`${text}\n:::image{query:"meeting" caption:"现场"}\n:::stat{value:"5%" label:"涨幅"}`)
  assert(s5 === eq(paraMM(30) + DROP + 4.2 + 32 + 15), `多控件叠加（期望 ${eq(paraMM(30) + DROP + 4.2 + 32 + 15)}，实际 ${s5}）`)
  // 空内容
  assert(estimateQuota('') === 0, '空内容为零')
  // 段落行数取整冗余：30 字在半栏占 2 行（段尾半行 + 段距），估计 > 30 字面值——更贴近真实占版
  assert(estimateQuota(text) > 30, `段尾半行冗余计入（实际 ${estimateQuota(text)}）`)
  // 表格 6 行：6×5.5mm 折算，不随宽度变（表格占版物理高度与槽宽无关）
  const table6 = '| 名称 | 数值 |\n|---|---|\n| a | 1 |\n| b | 2 |\n| c | 3 |\n| d | 4 |'
  assert(estimateQuota(table6) === eq(33 + 4.2), `表格 6 行折算（期望 ${eq(33 + 4.2)}，实际 ${estimateQuota(table6)}）`)
  // 未闭合非标准块不再吞正文（v0.34.4 修复保留）：44 字同段 → 2 行
  const unclosed = ':::chart\n标签一|123\n标签二|456\n未闭合块后的这段正文有十八个字左右用于验证。'
  assert(estimateQuota(unclosed) === eq(paraMM(44) + DROP + 4.2), `未闭合块后正文照常计数（期望 ${eq(paraMM(44) + DROP + 4.2)}，实际 ${estimateQuota(unclosed)}）`)

  // ---- 密度感知容量（v0.34.5 核心）：字/mm 随宽度变化 ----
  const capFull = slotWordCapacity(120, { widthMM: 180 }) // 全宽
  const capHalf = slotWordCapacity(120, { widthMM: 87 }) // 半栏
  const ratio = capFull / capHalf
  assert(ratio > 1.9 && ratio < 2.1, `全宽容量应约为半栏 2 倍（实际 ${capFull}/${capHalf}=${ratio.toFixed(2)}）`)
  // 多栏：180mm 双栏栏宽 ≈87mm → 容量回落到半栏水平（±5%）
  const capCols = slotWordCapacity(120, { widthMM: 180, columns: 2 })
  assert(Math.abs(capCols - capHalf) / capHalf < 0.05, `双栏容量回落半栏水平（实际 ${capCols} vs ${capHalf}）`)
  // 下限保护
  assert(slotWordCapacity(5) >= 40, '容量下限 40 字')
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

// ---- widgetQuotaHint：控件等效成本提示词（与 estimateQuota 同口径，v0.34.3/0.34.5 密度感知） ----
{
  const { widgetQuotaHint, quotaMetrics } = await import('../src/shared/parse.ts')
  const hintHalf = widgetQuotaHint({ widthMM: 87 })
  // 半栏密度 ≈4.66：配图 32mm ≈149 字
  assert(/配图≈1[0-9]{2}字/.test(hintHalf), `半栏配图成本合理（${(hintHalf.match(/配图≈(\d+)字/) ?? [])[1]}字）`)
  // 全宽密度 ≈2 倍：配图成本同步放大（同一控件占同样 mm，但等效字口径随密度）
  const hintFull = widgetQuotaHint({ widthMM: 180 })
  const halfImg = Number((hintHalf.match(/配图≈(\d+)字/) ?? [])[1])
  const fullImg = Number((hintFull.match(/配图≈(\d+)字/) ?? [])[1])
  assert(fullImg > halfImg * 1.9, `全宽配图成本应约为半栏 2 倍（${fullImg} vs ${halfImg}）`)
  void quotaMetrics
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
