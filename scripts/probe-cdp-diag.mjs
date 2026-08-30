/** CDP 连接单步诊断：fetch /json → WS 连接 → evaluate 1+1，每步打印耗时 */
const t0 = Date.now()
const ts = (ms) => `[${String(Date.now() - t0).padStart(4)}ms]`
const l = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
console.log(ts(), '/json OK，page targets:', l.filter((t) => t.type === 'page').length)
const page = l.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
if (!page) {
  console.error('未找到 Briefy 页面')
  process.exit(1)
}
console.log(ts(), '目标 URL:', page.url.slice(0, 80))
const ws = new WebSocket(page.webSocketDebuggerUrl)
ws.onopen = () => console.log(ts(), 'WS onopen')
ws.onerror = (e) => console.log(ts(), 'WS error:', e.message ?? '（无详细信息）')
ws.onclose = (e) => console.log(ts(), 'WS close: code=' + e.code)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = () => rej(new Error('WS 连接失败'))
  setTimeout(() => rej(new Error('WS 连接超时 5s')), 5000)
})
console.log(ts(), 'WS 已连接，发送 evaluate…')
let seq = 0
const pend = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const r = await Promise.race([
  send('Runtime.evaluate', { expression: '1+1', returnByValue: true }).then((x) => x.result?.result?.value),
  new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate 超时 5s')), 5000))
])
console.log(ts(), 'evaluate 结果:', r)
ws.close()
process.exit(0)
async function send(method, params) {
  const id = ++seq
  return new Promise((res) => {
    pend.set(id, (msg) => {
      pend.delete(id)
      res(msg)
    })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
