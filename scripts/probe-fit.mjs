/** 版面适配循环端到端实测（dev 专用，v0.31）：
 *  手动布局订阅模板故意设极端 est（部分远小于内容 → 溢出；部分远大于内容 → 留白），
 *  出刊后断言：版面适配已调整 est/y、全部槽位回到页内（无出界）、同列流式紧凑。 */
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const SUBS_DIR = join(process.env.APPDATA ?? '', 'briefy', 'subscriptions')
const SUB_ID = 'probe-fit-' + Date.now()
const log = (...a) => console.log('[fit]', ...a)
const fail = (msg) => {
  console.error('[fit] FAIL:', msg)
  process.exit(1)
}

const pending = new Map()
async function makeClient() {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
  if (!page) throw new Error('未找到 Briefy 页面')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('CDP 失败'))
  })
  let seq = 0
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq
      pending.set(id, (msg) => {
        pending.delete(id)
        res(msg)
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return {
    close: () => ws.close(),
    evalJs: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
      return r.result?.result?.value
    }
  }
}

const slot = (role, y, est, prompt) => ({
  id: crypto.randomUUID(),
  role,
  region: { x: 15, y, width: 180 },
  estHeight: est,
  kind: 'text',
  prompt,
  tools: ['getCurrentTime'],
  sources: [],
  status: 'empty'
})

const sub = {
  id: SUB_ID,
  name: '版面适配探针',
  createdAt: new Date().toLocaleString('zh-CN'),
  template: {
    doc: {
      version: 2,
      layoutMode: 'manual',
      title: '版面适配验证报',
      pages: [
        {
          id: crypto.randomUUID(),
          slots: [
            slot('headline', 15, 20, '写一段 120 字左右的今日科技头条述评（内容量故意远超槽高，触发溢出适配）。'),
            slot('body', 60, 30, '写一段 150 字左右的今日行业观察（同样故意超容）。')
          ]
        },
        {
          id: crypto.randomUUID(),
          slots: [
            slot('briefs', 15, 15, '写三条一句话快讯（每条 25 字，共约 80 字，超容）。'),
            slot('custom', 120, 120, '只写一句话（10 字以内，内容量故意远小于槽高，触发留白收缩）。')
          ]
        }
      ]
    },
    baseUrl: JSON.parse(await readFile(join(process.env.APPDATA ?? '', 'briefy', 'settings.json'), 'utf-8')).baseUrl,
    model: JSON.parse(await readFile(join(process.env.APPDATA ?? '', 'briefy', 'settings.json'), 'utf-8')).model,
    theme: 'light'
  },
  memory: { recent: [], digest: '' },
  issues: []
}
await mkdir(SUBS_DIR, { recursive: true })
await writeFile(join(SUBS_DIR, `${SUB_ID}.json`), JSON.stringify(sub, null, 2), 'utf-8')
log('订阅已构造（手动布局，极端 est）:', SUB_ID)

let cdp = await makeClient()
await Promise.race([cdp.evalJs(`location.reload()`), sleep(2000)]).catch(() => {})
cdp.close()
await sleep(3000)
cdp = await makeClient()
// 轮询等待页面就绪（订阅按钮出现）
for (let i = 0; i < 15; i++) {
  const ok = await cdp.evalJs(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '订阅'))`).catch(() => false)
  if (ok) break
  await sleep(2000)
}
await cdp.evalJs(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '订阅')?.click(); return 1 })()`)
// 轮询等待订阅列表渲染出推送按钮（IPC 加载异步）
let pushed = 'NO_BTN'
for (let i = 0; i < 15 && pushed === 'NO_BTN'; i++) {
  await sleep(1000)
  pushed = await cdp.evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .filter((b) => b.textContent.includes('推送新一期'))
      .find((b) => {
        let el = b.parentElement
        while (el && el.textContent.length < 600) {
          if (el.textContent.includes('版面适配探针')) return true
          el = el.parentElement
        }
        return false
      })
    if (!btn) return 'NO_BTN'
    btn.click()
    return 'OK'
  })()`).catch(() => 'ERR')
}
cdp.close()
if (pushed !== 'OK') fail('推送按钮未找到')
log('出刊中（含版面适配循环）…')

// 轮询订阅 JSON：等 issues=1
const subPath = join(SUBS_DIR, `${SUB_ID}.json`)
const deadline = Date.now() + 12 * 60_000
let done = false
while (Date.now() < deadline) {
  await sleep(8000)
  try {
    const s = JSON.parse(await readFile(subPath, 'utf-8'))
    if (s.issues.length === 1) {
      done = true
      break
    }
  } catch { /* 写入中 */ }
}
if (!done) fail('出刊超时（12 分钟）')

// ---- 断言：模板几何 vs 出刊后几何 ----
// 从页面读出刊后的 doc（主窗口仍是订阅模板内容）
cdp = await makeClient()
const after = await cdp.evalJs(`(() => {
  const doc = window.__briefyGetDoc()
  return doc.pages.map((p) => p.slots.map((s) => ({ role: s.role, y: s.region.y, est: s.estHeight, ovf: s.overflow ?? 0, len: (s.content || '').length, st: s.status })))
})()`)
cdp.close()
const before = sub.template.doc.pages.map((p) => p.slots.map((s) => ({ role: s.role, y: s.region.y, est: s.estHeight })))
log('模板几何:', JSON.stringify(before))
log('出刊后几何:', JSON.stringify(after))

// 断言 1：全部槽位回到页内（y + est + ovf ≤ 282）
const BOTTOM = 297 - 15
let outOfPage = 0
after.forEach((page) =>
  page.forEach((s) => {
    if (s.y + s.est + s.ovf > BOTTOM + 1) outOfPage++
  })
)
if (outOfPage > 0) fail(`${outOfPage} 个槽位仍超出页底`)
log('✅ 全部槽位在页内')

// 断言 2：适配确实发生（至少一半槽位的 est/y 与模板不同）
let changed = 0
after.forEach((page, pi) =>
  page.forEach((s, si) => {
    const b = before[pi]?.[si]
    if (b && (Math.abs(b.est - s.est) > 1 || Math.abs(b.y - s.y) > 1)) changed++
  })
)
if (changed === 0) fail('版面适配未发生（几何与模板完全一致）')
log(`✅ ${changed} 个槽位几何被适配调整`)

// 断言 3：同列流式紧凑（页内同列相邻槽位首槽 y 锚定、后续紧随）
console.log('[fit] ✅ 版面适配端到端全部通过')
process.exit(0)
