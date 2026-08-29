/** 文件参考源端到端实测（dev 专用）：
 *  1. 构造带文件源的测试文档（body 槽挂测试 md）
 *  2. 跑生成管线（复用 e2e 流程）
 *  3. 检查生成内容是否引用了文件中的独特事实（FRC-2026）
 *  前置：npm run dev 已运行。 */
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile } from 'node:fs/promises'

const DOC_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\文件源测试.briefy'
const MD_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\文件源测试.md'
const KEYWORD = 'FRC-2026'
const log = (...a) => console.log('[fsrc]', ...a)
const fail = (msg) => {
  console.error('[fsrc] FAIL:', msg)
  process.exit(1)
}

// ---- 1. 构造测试文档：复制测试报刊，第 0 页 body 槽挂文件源并改提示词 ----
const raw = await readFile('C:\\Users\\sr291\\Desktop\\test_data\\测试报刊.briefy', 'utf-8')
const doc = JSON.parse(raw)
const body = doc.pages[0].slots.find((s) => s.role === 'body')
if (!body) fail('测试文档无 body 槽位')
body.prompt = '基于参考文件《文件源测试.md》写一篇 120 字以内的简讯，必须提及文件中的关键事实（项目代号）与支持格式数量。'
body.sources = [
  { id: crypto.randomUUID(), name: '文件源测试.md', url: '', note: 'Briefy 项目内部简报', kind: 'file', path: MD_PATH }
]
await writeFile(DOC_PATH, JSON.stringify(doc, null, 2), 'utf-8')
log('测试文档已构造:', DOC_PATH)

// ---- 2. CDP 连接，驱动加载与生成 ----
const connect = async () => {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
  if (!page) throw new Error('未找到 Briefy 页面 target')
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
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
    return r.result?.result?.value
  }
  return { evalJs, reconnect: async () => ws.close() && (await connect()) }
}

let cdp = await connect()
log('加载测试文档…')
await cdp.evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(DOC_PATH)})`)
await sleep(2500)
await connect().then((c) => void (cdp = c))
await cdp.evalJs(`location.reload()`)
await sleep(2500)
await connect().then((c) => void (cdp = c))

const clicked = await cdp.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '生成')
  if (!btn) return false
  btn.click()
  return true
})()`)
if (!clicked) fail('未找到生成按钮')
log('已点击生成，等待完成…')

const deadline = Date.now() + 10 * 60_000
while (Date.now() < deadline) {
  await sleep(5000)
  const st = await cdp.evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '终止' || b.textContent.trim() === '生成')
    const gen = [...document.querySelectorAll('[data-slot-id]')].filter((s) => s.textContent.includes('生成中')).length
    return { label: btn?.textContent.trim(), gen }
  })()`)
  if (st.label === '生成' && st.gen === 0) break
}
if (Date.now() >= deadline) fail('生成超时')

// ---- 3. 检查生成内容是否引用文件事实 ----
const content = await cdp.evalJs(`(() => {
  const doc = window.__briefyGetDoc()
  return doc.pages.flatMap((p) => p.slots).map((s) => '[' + s.role + '] ' + (s.content || '')).join('|SPLIT|')
})()`.replace('|SPLIT|', '\\n\\n'))
log('---- 生成内容 ----')
log(content.slice(0, 1200))
log('------------------')
if (content.includes(KEYWORD)) {
  console.log(`[fsrc] ✅ 生成内容引用了文件事实（${KEYWORD}）——readSource 工具链路生效`)
} else {
  fail(`生成内容未包含文件关键词 ${KEYWORD}，readSource 链路可能未生效`)
}
process.exit(0)
