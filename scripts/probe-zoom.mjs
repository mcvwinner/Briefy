/** zoom 控件自适应机制验证（dev 专用）：
 *  确认 zoom: var(--briefy-fit) 使控件布局高度真实缩放（外部坐标 + 父容器 scrollHeight），
 *  保证 SlotBox 的 fitScale 收敛循环能感知控件缩放。前置：npm run dev 已运行。 */
const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
if (!page) {
  console.error('[zoom-check] FAIL: 未找到 Briefy 页面')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = () => rej(new Error('CDP 连接失败'))
})
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}

const result = await evalJs(`(() => {
  const pd = document.createElement('div')
  pd.style.cssText = '--briefy-fit: 0.7; width:200px'
  const cd = document.createElement('div')
  cd.style.cssText = 'zoom:var(--briefy-fit,1);width:100px;height:100px'
  pd.appendChild(cd)
  document.body.appendChild(pd)
  const rect = cd.getBoundingClientRect()
  const out = { rectW: rect.width, rectH: rect.height, parentScrollH: pd.scrollHeight }
  pd.remove()
  return out
})()`)
console.log('[zoom-check]', JSON.stringify(result))
if (Math.abs(result.rectH - 70) > 2 || Math.abs(result.parentScrollH - 70) > 2) {
  console.error('[zoom-check] FAIL: zoom 未随 --briefy-fit 缩放（期望外部 70×70、父滚动高 70）')
  process.exit(1)
}
console.log('[zoom-check] ✅ zoom + --briefy-fit 联动生效（100 → 70，父容器滚动高同步）')
process.exit(0)
