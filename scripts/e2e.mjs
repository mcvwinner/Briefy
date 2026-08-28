/**
 * 端到端验证驱动（dev 专用）：通过 CDP 连接 Electron 渲染进程，
 * 加载测试文档 → 点击生成 → 等待全部槽位完成 → 导出 PDF（自动落盘）。
 * 用法：node scripts/e2e.mjs <docPath> <outPdfPath>
 * 前置：npm run dev 已运行（主进程已开 9222 CDP 端口）
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { stat } from 'node:fs/promises'

const docPath = process.argv[2] ?? 'C:\\Users\\sr291\\Desktop\\test_data\\每日报刊.briefy'
const outPath = process.argv[3] ?? 'C:\\Users\\sr291\\Desktop\\test_data\\每日报刊_out.pdf'
const OVERALL_TIMEOUT_MS = 12 * 60_000
const deadline = Date.now() + OVERALL_TIMEOUT_MS

const log = (...a) => console.log('[e2e]', ...a)
const fail = (msg) => {
  console.error('[e2e] FAIL:', msg)
  process.exit(1)
}

/** 发现 Briefy 页面的 CDP webSocket 地址 */
async function findTarget() {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
  if (!page) throw new Error('未找到 Briefy 页面 target')
  return page.webSocketDebuggerUrl
}

/** 最小 CDP 客户端 */
async function connect() {
  const ws = new WebSocket(await findTarget())
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
  return { ws, send, evalJs, reconnect: async () => { ws.close(); return connect() } }
}

let cdp = await connect()

// ---- 1. 加载测试文档 ----
log('加载文档:', docPath)
await cdp.evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(docPath)})`)
await sleep(2500)
cdp = await connect() // 导航后重连
await cdp.evalJs(`location.reload()`)
await sleep(2500)
cdp = await connect()

// 等待文档加载（有槽位且状态稳定）
let docInfo = null
while (Date.now() < deadline) {
  docInfo = await cdp.evalJs(`(() => {
    const get = window.__briefyGetDoc
    if (!get) return null
    const doc = get()
    return { pages: doc.pages.length, slots: doc.pages.flatMap(p => p.slots).length }
  })()`)
  if (docInfo && docInfo.slots > 0) break
  await sleep(1000)
}
if (!docInfo?.slots) fail('文档未能自动加载')
log(`文档已加载：${docInfo.pages} 页 / ${docInfo.slots} 槽位`)

// ---- 2. 点击生成 ----
const clicked = await cdp.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '生成')
  if (!btn) return false
  btn.click()
  return true
})()`)
if (!clicked) fail('未找到"生成"按钮')
log('已点击生成，等待全部任务结束…')

// ---- 3. 轮询至生成按钮回到"生成"（全部任务结束，含失败） ----
let lastSlots = ''
while (Date.now() < deadline) {
  await sleep(5000)
  const st = await cdp.evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '终止' || b.textContent.trim() === '生成')
    const slots = [...document.querySelectorAll('[data-slot-id]')]
    const done = slots.filter(s => s.querySelector('[class*="slotContent"]')).length
    const err = slots.filter(s => s.querySelector('[class*="slotError"]')).length
    const gen = slots.filter(s => s.textContent.includes('生成中')).length
    return { label: btn?.textContent.trim(), total: slots.length, done, err, gen }
  })()`)
  if (!st) continue
  const summary = `完成 ${st.done} / 失败 ${st.err} / 生成中 ${st.gen} / 共 ${st.total}`
  if (summary !== lastSlots) {
    log(summary)
    lastSlots = summary
  }
  if (st.label === '生成' && st.gen === 0) break
}
if (Date.now() >= deadline) fail('总超时：生成未在时限内完成')

// ---- 4. 统计结果 + 质量报告（ROADMAP Q5 最小层） ----
const result = await cdp.evalJs(`(() => {
  const doc = window.__briefyGetDoc()
  const slots = doc.pages.flatMap(p => p.slots)
  return {
    total: slots.length,
    done: slots.filter(s => s.status === 'done').length,
    error: slots.filter(s => s.status === 'error').map(s => ({ role: s.role, msg: (s.content ?? '').slice(0, 200) })),
    quality: slots.filter(s => s.status === 'done').map(s => ({
      role: s.role,
      len: (s.content ?? '').replace(/\\s+/g, '').length,
      limit: Math.round(s.estHeight * 4.5),
      hasSource: (s.sources?.length ?? 0) > 0,
      content: s.content ?? ''
    })),
    usage: window.__briefyUsage ?? null
  }
})()`)
log(`生成结果：${result.done}/${result.total} 成功`)
if (result.error.length > 0) {
  console.error('[e2e] 失败槽位：', JSON.stringify(result.error, null, 2))
}

/** 中文 3-gram Jaccard 相似度 */
function trigrams(text) {
  const t = text.replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3))
  return set
}
function similarity(a, b) {
  const A = trigrams(a)
  const B = trigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

const q = result.quality
const issues = []
// 空内容
for (const s of q) if (s.len === 0) issues.push(`[FAIL] ${s.role}：内容为空`)
// 字数超限（上限 25% 容差）
for (const s of q) if (s.len > s.limit * 1.25) issues.push(`[WARN] ${s.role}：字数 ${s.len} 超上限 ${s.limit}（+25% 容差后仍超）`)
// 槽间相似度粗检（两两比对，> 0.35 视为疑似重复）
for (let i = 0; i < q.length; i++) {
  for (let j = i + 1; j < q.length; j++) {
    const sim = similarity(q[i].content, q[j].content)
    if (sim > 0.35) issues.push(`[WARN] ${q[i].role} 与 ${q[j].role} 内容相似度 ${(sim * 100).toFixed(0)}%（疑似重复选题）`)
  }
}
// 来源缺失：逐 DOM 槽位核对（"挂源且已完成"与"是否渲染署名"必须一致；只比当前页可见槽位）
const sourceMismatch = await cdp.evalJs(`(() => {
  const doc = window.__briefyGetDoc()
  const byId = new Map(doc.pages.flatMap(p => p.slots).map(s => [s.id, s]))
  let bad = 0
  document.querySelectorAll('[data-slot-id]').forEach(el => {
    const s = byId.get(el.getAttribute('data-slot-id'))
    if (!s || s.status !== 'done') return
    const should = (s.sources?.length ?? 0) > 0
    const has = !!el.querySelector('.slot-sources')
    if (should !== has) bad++
  })
  return bad
})()`)
if (sourceMismatch > 0) {
  issues.push(`[FAIL] ${sourceMismatch} 个槽位的来源署名与挂载状态不一致`)
}
// 度量输出
if (result.usage) {
  log(`Token 用量：输入 ${result.usage.promptTokens} + 输出 ${result.usage.completionTokens} = ${result.usage.totalTokens}`)
}
if (issues.length > 0) {
  console.log('[e2e] 质量检查：')
  issues.forEach((i) => console.log('  ', i))
} else {
  log('质量检查：无问题（无空槽/未超限/无重复/署名齐全）')
}

// ---- 5. 导出 PDF（dev 自动落盘） ----
log('导出 PDF →', outPath)
const exported = await cdp.evalJs(`window.briefy.exportPdf(window.__briefyGetDoc(), ${JSON.stringify(outPath)})`)
if (!exported) fail('导出返回空（失败或取消）')
const size = (await stat(exported)).size
log(`导出成功：${exported}（${(size / 1024).toFixed(1)} KB）`)
if (size < 10 * 1024) fail('PDF 文件过小，疑似空白')

if (result.error.length > 0) {
  console.error('[e2e] 存在生成失败的槽位，需继续迭代')
  process.exit(2)
}
log('✅ 端到端验证通过：生成 + 导出成功')
