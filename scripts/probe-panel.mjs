/** 采样工作台面板（生成期间连续读 DOM） */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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

for (let i = 0; i < 10; i++) {
  const r = await ev(`(() => {
    const panel = [...document.querySelectorAll('div')].find(d => d.textContent.startsWith('🪶'))
    const pre = document.querySelector('.hb-cursor')?.parentElement
    return {
      panel: !!panel,
      preLen: pre?.textContent?.length ?? 0,
      preTail: pre?.textContent?.slice(-60) ?? '',
      footer: document.querySelector('footer')?.textContent?.slice(0, 40) ?? ''
    }
  })()`)
  console.log(`[${i}]`, JSON.stringify(r))
  await sleep(2500)
}
process.exit(0)
