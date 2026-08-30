/**
 * 增字号填充验证探针（v0.34.3，dev 专用）：
 * 同样留白很大的两个槽位——纯文字槽应增字号填充（fit > 1），富媒体槽（图片/图表）应保持 1 不放大。
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFile } from 'node:fs/promises'

const log = (...a) => console.log('[probe]', ...a)
const fail = (msg) => {
  console.error('[probe] FAIL:', msg)
  process.exit(1)
}

async function withPage(match, fn) {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const target = list.find((t) => t.type === 'page' && match(t.url))
  if (!target) throw new Error('未找到目标页面')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
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
  try {
    const send = (method, params = {}) =>
      new Promise((res) => {
        const id = ++seq
        pending.set(id, res)
        ws.send(JSON.stringify({ id, method, params }))
      })
    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
      return r.result?.result?.value
    }
    return await fn(evalJs)
  } finally {
    ws.close()
  }
}

const MAIN = (u) => u.includes('localhost:5173') && !u.includes('print=1')
const DOC_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\probe-fit-rich.briefy'

const shortText = '这是一段很短的文字，只占槽位上半部分，留下大量留白用于触发增字号填充逻辑。'
const doc = {
  version: 2,
  title: '增字号验证',
  pages: [
    {
      id: crypto.randomUUID(),
      slots: [
        // 纯文字 + 大留白 → 应增字号（fit > 1）
        { id: crypto.randomUUID(), role: 'body', region: { x: 15, y: 15, width: 180 }, estHeight: 120, kind: 'text', status: 'done', prompt: '', sources: [], content: shortText },
        // 同样留白 + 图片控件 → 应保持 1（不盲目放大）
        { id: crypto.randomUUID(), role: 'body', region: { x: 15, y: 143, width: 180 }, estHeight: 120, kind: 'text', status: 'done', prompt: '', sources: [], content: shortText + '\n:::image{query:"city skyline" caption:"城市"}' }
      ]
    }
  ]
}
await writeFile(DOC_PATH, JSON.stringify(doc))
log('测试文档已写:', DOC_PATH)

await withPage(MAIN, async (evalJs) => {
  await evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(DOC_PATH)})`)
})
await sleep(3000)

const fits = await withPage(MAIN, async (evalJs) => {
  await sleep(1000) // 等收敛
  return evalJs(`(() => {
    return [...document.querySelectorAll('[data-slot-id]')].map((el) => ({
      id: el.getAttribute('data-slot-id').slice(0, 8),
      fit: el.style.getPropertyValue('--briefy-fit') || '1'
    }))
  })()`)
})
log('收敛结果:', JSON.stringify(fits))
const textFit = parseFloat(fits[0]?.fit ?? '1')
const richFit = parseFloat(fits[1]?.fit ?? '1')
if (textFit <= 1.01) fail(`纯文字大留白槽应增字号填充（实际 fit=${textFit}）`)
if (richFit > 1.01) fail(`富媒体槽不应增字号（实际 fit=${richFit}）`)
log('✅ 纯文字槽增字号填充（fit=' + textFit + '），富媒体槽保持原字号（fit=' + richFit + '）')
log('探针完成')
