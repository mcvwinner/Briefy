/**
 * 设置项验证探针（v0.34.1，dev 专用）：
 * 1. showSources=false → 槽位不渲染「来源：xxx」；默认/true → 渲染
 * 2. experimentalLayoutFit 在设置中可读写
 * 前置：npm run dev 已运行，CDP 9222 可连。
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFile } from 'node:fs/promises'

const log = (...a) => console.log('[probe]', ...a)
const fail = (msg) => {
  console.error('[probe] FAIL:', msg)
  process.exit(1)
}

/** CDP 短连接（connect-eval-close） */
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
const DOC_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\probe-settings.briefy'

// ---- 构造带来源的测试文档 ----
const doc = {
  version: 2,
  title: '设置项探针',
  pages: [
    {
      id: crypto.randomUUID(),
      slots: [
        {
          id: crypto.randomUUID(),
          role: 'body',
          region: { x: 15, y: 15, width: 180 },
          estHeight: 60,
          kind: 'text',
          status: 'done',
          prompt: '测试',
          sources: [{ id: 's1', name: '示例新闻网', url: 'https://example.com', note: '' }],
          content: '这是用于验证来源署名开关的正文内容。'
        }
      ]
    }
  ]
}
await writeFile(DOC_PATH, JSON.stringify(doc))
log('测试文档已写:', DOC_PATH)

// ---- 场景 A：默认（不设置 showSources）→ 来源应显示 ----
await withPage(MAIN, async (evalJs) => {
  await evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(DOC_PATH)})`)
})
await sleep(2500)
let hasSource = await withPage(MAIN, async (evalJs) => {
  await sleep(500)
  return evalJs(`!!document.querySelector('.slot-sources')`)
})
if (!hasSource) fail('默认状态来源署名应显示')
log('✅ 场景 A：默认显示来源署名')

// ---- 场景 B：showSources=false → 来源不显示 ----
await withPage(MAIN, async (evalJs) => {
  await evalJs(`(async () => {
    const s = await window.briefy.getSettings()
    s.layout = { ...s.layout, showSources: false }
    await window.briefy.saveSettings(s)
    return true
  })()`)
  await evalJs(`location.reload()`)
})
await sleep(2500)
hasSource = await withPage(MAIN, async (evalJs) => {
  await sleep(500)
  return evalJs(`!!document.querySelector('.slot-sources')`)
})
if (hasSource) fail('showSources=false 时来源署名不应渲染')
log('✅ 场景 B：showSources=false 来源署名消失')

// ---- 场景 C：恢复 true + 验证 experimentalLayoutFit 读写 ----
const fitVal = await withPage(MAIN, async (evalJs) => {
  await evalJs(`(async () => {
    const s = await window.briefy.getSettings()
    s.layout = { ...s.layout, showSources: true }
    s.experimentalLayoutFit = true
    await window.briefy.saveSettings(s)
    return true
  })()`)
  await evalJs(`location.reload()`)
})
await sleep(2000)
const after = await withPage(MAIN, async (evalJs) => {
  return evalJs(`(async () => {
    const s = await window.briefy.getSettings()
    return { showSources: s.layout?.showSources, fit: s.experimentalLayoutFit, sourceVisible: !!document.querySelector('.slot-sources') }
  })()`)
})
if (!after.sourceVisible) fail('showSources=true 时来源署名应恢复显示')
if (after.fit !== true) fail(`experimentalLayoutFit 读写失败（实际 ${after.fit}）`)
log('✅ 场景 C：开关恢复 + experimentalLayoutFit=true 持久化成功', JSON.stringify(after))

// ---- 清理：复位实验开关为 false（默认关） ----
await withPage(MAIN, async (evalJs) => {
  await evalJs(`(async () => {
    const s = await window.briefy.getSettings()
    s.experimentalLayoutFit = false
    await window.briefy.saveSettings(s)
    return true
  })()`)
})
log('探针完成（实验开关已复位为默认关）')
