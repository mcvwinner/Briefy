/** 独立点击生成 + 轮询（dev 专用）：不依赖卡住的探针连接 */
const l = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const p = l.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
const ws = new WebSocket(p.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let s = 0
const pend = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++s
    pend.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = async (ex) => {
  const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true })
  return r.result?.result?.value
}
const clicked = await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '生成')
  if (!btn) return 'NO_BTN'
  btn.click()
  return 'OK'
})()`)
console.log('[diag-click]', clicked)
process.exit(0)
