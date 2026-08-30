/** 诊断：页面生成状态（dev 专用） */
const l = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const p = l.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
if (!p) {
  console.error('无页面')
  process.exit(1)
}
const ws = new WebSocket(p.webSocketDebuggerUrl)
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = () => j(new Error('WS 失败')))))
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
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200)
  return r.result?.result?.value
}
const st = await ev(`(() => {
  const doc = window.__briefyGetDoc()
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '终止' || b.textContent.trim() === '生成')
  return JSON.stringify({
    genBtn: btn ? btn.textContent.trim() : null,
    title: doc.title,
    slots: doc.pages.flatMap((p) => p.slots).map((x) => x.role + ':' + x.status + ':est' + x.estHeight + ':y' + Math.round(x.region.y))
  })
})()`)
console.log(st)
ws.close()
process.exit(0)
