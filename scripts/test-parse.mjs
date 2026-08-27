// 控件协议解析器自测：node scripts/test-parse.mjs
// 用 tsx 不可用，直接内联核心逻辑复刻验证（与 src/shared/parse.ts 保持一致）
const WIDGET_IDS = ['stat', 'quote', 'info', 'timeline']

function parseWidgetLine(line) {
  const match = line.match(/^:::(\w+)\{(.*)\}\s*$/)
  if (!match) return null
  const id = match[1]
  if (!WIDGET_IDS.includes(id)) return null
  const params = {}
  const pairPattern = /(\w+)\s*:\s*"([^"]*)"/g
  let m
  while ((m = pairPattern.exec(match[2])) !== null) params[m[1]] = m[2]
  return { id, params }
}

function parseContent(text) {
  const nodes = []
  let paraBuffer = []
  const flush = () => {
    if (paraBuffer.length) {
      nodes.push({ type: 'paragraph', text: paraBuffer.join('\n') })
      paraBuffer = []
    }
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) { flush(); continue }
    const h = line.match(/^#{2,3}\s+(.+)$/)
    if (h) { flush(); nodes.push({ type: 'heading', text: h[1] }); continue }
    if (line.startsWith(':::')) {
      const w = parseWidgetLine(line)
      if (w) { flush(); nodes.push({ type: 'widget', ...w }); continue }
    }
    paraBuffer.push(line)
  }
  flush()
  return nodes
}

// ---- 测试用例 ----
const sample = `## 市场概览
今日 A 股 **高开高走**，科技板块领涨。

:::stat{label:"沪指涨幅", value:"+1.2%", trend:"up", note:"创近月新高"}

:::quote{text:"市场底色仍是结构性行情", source:"某券商首席"}

收盘时三大指数集体收涨。`

const nodes = parseContent(sample)
console.log(JSON.stringify(nodes, null, 2))

// 断言
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } }
assert(nodes.length === 5, '应有 5 个节点')
assert(nodes[0].type === 'heading' && nodes[0].text === '市场概览', '节点1=小标题')
assert(nodes[1].type === 'paragraph' && nodes[1].text.includes('**高开高走**'), '节点2=段落')
assert(nodes[2].type === 'widget' && nodes[2].id === 'stat' && nodes[2].params.value === '+1.2%', '节点3=stat控件')
assert(nodes[3].type === 'widget' && nodes[3].id === 'quote' && nodes[3].params.source === '某券商首席', '节点4=quote控件')
assert(nodes[4].type === 'paragraph', '节点5=段落')
// 非法控件行应落回段落
const bad = parseContent('普通文本 :::unknown{x:1} 还是普通文本')
assert(bad.length === 1 && bad[0].type === 'paragraph', '未知控件应保留为段落文本')
console.log('✅ 全部断言通过')
