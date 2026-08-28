/** 旁路验证 Q4：头条三段式是否被 AI 采用并特化渲染 */
const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
if (!page) {
  console.error('未找到页面')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0
const pend = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const send = (method, params) => new Promise((res) => {
  const id = ++seq
  pend.set(id, res)
  ws.send(JSON.stringify({ id, method, params }))
})
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value

const r = await ev(`(() => {
  const slots = window.__briefyGetDoc().pages.flatMap(p => p.slots)
  const headline = slots.find(s => s.role === 'headline')
  const block = document.querySelector('.headline-block')
  return {
    raw: (headline?.content ?? '').slice(0, 150),
    specialized: !!block,
    kicker: block?.querySelector('.headline-kicker')?.textContent ?? null,
    title: block?.querySelector('.headline-title')?.textContent ?? null,
    sub: block?.querySelector('.headline-sub')?.textContent?.slice(0, 60) ?? null
  }
})()`)
console.log('头条原文:', JSON.stringify(r.raw))
console.log('特化渲染:', r.specialized)
console.log('引题:', r.kicker, '\n主标:', r.title, '\n副题:', r.sub)
process.exit(r.specialized ? 0 : 1)
