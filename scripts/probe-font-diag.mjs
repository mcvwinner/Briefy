/** 诊断：对比主窗口与打印窗口（print=1）同槽位的实际渲染字号/fit（dev 专用） */
const EXPR = [
  '(() => {',
  '  const doc = window.__briefyGetDoc ? window.__briefyGetDoc() : null',
  '  if (!doc) return JSON.stringify({ no: "doc" })',
  '  const out = []',
  '  doc.pages.forEach((p, pi) => p.slots.forEach((s) => {',
  '    const el = document.querySelector("[data-slot-id=\\"" + s.id + "\\"]")',
  '    if (!el) return',
  '    const inner = el.querySelector("div")',
  '    const fs = getComputedStyle(inner || el).fontSize',
  '    const fit = getComputedStyle(el).getPropertyValue("--briefy-fit")',
  '    const rect = el.getBoundingClientRect()',
  '    out.push("P" + (pi + 1) + " " + s.role + " fit=" + fit + " fontSize=" + fs + " rect=" + Math.round(rect.width) + "x" + Math.round(rect.height))',
  '  }))',
  '  return JSON.stringify(out)',
  '})()'
].join('\n')

const l = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const pages = l.filter((t) => t.type === 'page')
console.log('全部 targets:')
pages.forEach((t) => console.log(' -', t.url.slice(0, 90)))

const makeEval = (target) => {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('连接/执行超时')), 6000)
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, returnByValue: true } }))
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id === 1) {
        clearTimeout(timer)
        if (m.result?.exceptionDetails) rej(new Error('页面异常'))
        else res(m.result?.result?.value)
      }
    }
    ws.onerror = () => {
      clearTimeout(timer)
      rej(new Error('WS 失败'))
    }
  })
}

const main = pages.find((t) => t.url.includes('localhost:5173') && !t.url.includes('print=1'))
const print = pages.find((t) => t.url.includes('print=1'))
if (main) {
  console.log('\n===== 主窗口 =====')
  try {
    console.log(await makeEval(main))
  } catch (e) {
    console.log('主窗口诊断失败:', e.message)
  }
} else {
  console.log('主窗口未找到')
}
if (print) {
  console.log('\n===== 打印窗口 =====')
  try {
    console.log(await makeEval(print))
  } catch (e) {
    console.log('打印窗口诊断失败:', e.message)
  }
} else {
  console.log('打印窗口不存在')
}
process.exit(0)
