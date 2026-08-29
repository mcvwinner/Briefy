/** 订阅功能端到端实测（dev 专用）：
 *  1. 直接写入订阅存储（%APPDATA%/briefy/subscriptions/<id>.json，2 槽小模板快速出刊）
 *  2. CDP 驱动 UI：打开订阅管理 → 推送新一期 → 等待 PDF 归档
 *  3. 推送第二期 → 验证记忆滚动（recent=2）与两期内容不重复
 *  前置：npm run dev 已运行。 */
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const log = (...a) => console.log('[sub]', ...a)
const fail = (msg) => {
  console.error('[sub] FAIL:', msg)
  process.exit(1)
}
const SUBS_DIR = join(process.env.APPDATA ?? '', 'briefy', 'subscriptions')
const SUB_ID = 'probe-sub-' + Date.now()

/** CDP 最小客户端 */
const pending = new Map()
async function makeClient() {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
  if (!page) throw new Error('未找到 Briefy 页面 target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('CDP 连接失败'))
  })
  let seq2 = 0
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq2
      pending.set(id, (msg) => {
        pending.delete(id)
        res(msg)
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return {
    evalJs: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
      return r.result?.result?.value
    }
  }
}

// ---- 1. 构造订阅（从 settings.json 读模板快照，不依赖页面时序） ----
const settings = JSON.parse(await readFile(join(process.env.APPDATA ?? '', 'briefy', 'settings.json'), 'utf-8'))
if (!settings?.model) fail('settings.json 读取失败（未配置 Key？）')
const cdp = await makeClient()
const slot = (role, estHeight, prompt) => ({
  id: crypto.randomUUID(),
  role,
  region: { x: 15, y: 15, width: 180 },
  estHeight,
  kind: 'text',
  prompt,
  tools: ['getCurrentTime'],
  sources: [],
  status: 'empty'
})
const sub = {
  id: SUB_ID,
  name: '探针订阅',
  createdAt: new Date().toLocaleString('zh-CN'),
  template: {
    doc: {
      version: 2,
      title: '订阅探针报',
      pages: [
        {
          id: crypto.randomUUID(),
          slots: [
            slot('headline', 40, '写一句今日科技短头条（30 字以内，直接给标题性的一句）。'),
            slot('body', 60, '写一段 80 字以内的今日观察短评，视角必须与往期不同。')
          ]
        }
      ]
    },
    baseUrl: settings.baseUrl,
    model: settings.model,
    theme: settings.theme ?? 'light'
  },
  memory: { recent: [], digest: '' },
  issues: []
}
await mkdir(SUBS_DIR, { recursive: true })
await writeFile(join(SUBS_DIR, `${SUB_ID}.json`), JSON.stringify(sub, null, 2), 'utf-8')
log('订阅已写入:', SUB_ID)

// ---- 2. 刷新页面 → 打开订阅管理 → 推送新一期 ----
await cdp.evalJs(`location.reload()`)
await sleep(2500)
const cdp2 = await makeClient()
const opened = await cdp2.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '订阅')
  if (!btn) return false
  btn.click()
  return true
})()`)
if (!opened) fail('未找到「订阅」工具栏按钮')
await sleep(600)
const pushed = await cdp2.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '推送新一期')
  if (!btn) return false
  btn.click()
  return true
})()`)
if (!pushed) fail('未找到「推送新一期」按钮')
log('第一期出刊中…')

// ---- 3. 轮询订阅 JSON：等 issues.length === 1 ----
const waitFor = async (pred, timeoutMs, what) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(5000)
    try {
      const s = JSON.parse(await readFile(join(SUBS_DIR, `${SUB_ID}.json`), 'utf-8'))
      if (pred(s)) return s
    } catch { /* 文件写入中，继续等 */ }
  }
  fail(`等待超时：${what}`)
}
const sub1 = await waitFor((s) => s.issues.length === 1, 10 * 60_000, '第一期出刊')
const pdf1 = sub1.issues[0].pdfPath
try {
  const st = await readdir(join(SUBS_DIR, SUB_ID, 'issues'))
  log('归档文件:', st.join(', '))
  if (!pdf1) fail('第一期记录缺 pdfPath')
  const body1 = sub1.issues[0].slots.find((s) => s.role === '正文')?.content ?? ''
  log('第一期 body:', body1.slice(0, 150))

  // ---- 4. 推送第二期（body 槽改为连载续写，验证记忆/连载线） ----
  const subEdit = JSON.parse(await readFile(join(SUBS_DIR, `${SUB_ID}.json`), 'utf-8'))
  const bodySlot = subEdit.template.doc.pages[0].slots.find((s) => s.role === 'body')
  bodySlot.prompt = '继续上一期的观察，接着写一段 80 字以内的短评（不要重复上一期内容）。'
  await writeFile(join(SUBS_DIR, `${SUB_ID}.json`), JSON.stringify(subEdit, null, 2), 'utf-8')
  await cdp2.evalJs(`location.reload()`)
  await sleep(2500)
  const cdp3 = await makeClient()
  await cdp3.evalJs(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '订阅')?.click(); return true })()`)
  await sleep(600)
  await cdp3.evalJs(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '推送新一期')?.click(); return true })()`)
  log('第二期出刊中…')
  const sub2 = await waitFor((s) => s.issues.length === 2, 10 * 60_000, '第二期出刊')
  const body2 = sub2.issues[1].slots.find((s) => s.role === '正文')?.content ?? ''
  log('第二期 body:', body2.slice(0, 150))

  // ---- 5. 断言 ----
  if (sub2.memory.recent.length !== 2) fail(`记忆滚动异常：recent=${sub2.memory.recent.length}（期望 2）`)
  // 两期 body 不重复（3-gram 粗比）
  const gram = (t) => {
    const s = t.replace(/\s+/g, '')
    const set = new Set()
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
    return set
  }
  const a = gram(body1)
  const b = gram(body2)
  let hit = 0
  for (const g of a) if (b.has(g)) hit++
  const sim = a.size ? hit / a.size : 0
  log(`两期 body 相似度：${Math.round(sim * 100)}%`)
  if (sim > 0.6) fail(`两期内容高度重复（${Math.round(sim * 100)}%），记忆去重未生效`)
  console.log('[sub] ✅ 订阅端到端全部通过：两期出刊 / PDF 归档 / 记忆滚动 / 内容不重复')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
}
process.exit(0)
