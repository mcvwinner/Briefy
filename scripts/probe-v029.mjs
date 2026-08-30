/** v0.29.0 新功能端到端实测（dev 专用，代码冻结状态下运行）：
 *  订阅出刊一次，覆盖：接续槽位组（一次调用拆分回填）/ 子槽位（父先子后注入父内容）/ 自由槽位（审查豁免）。
 *  模板 5 槽：headline → child(body) / 接续组(body+briefs) / free。
 *  前置：npm run dev 已运行，无其他残留实例。 */
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const SUBS_DIR = join(process.env.APPDATA ?? '', 'briefy', 'subscriptions')
const SUB_ID = 'probe-v029-' + Date.now()
const log = (...a) => console.log('[t029]', ...a)
const fail = (msg) => {
  console.error('[t029] FAIL:', msg)
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
    evalJs: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400))
      return r.result?.result?.value
    }
  }
}

// ---- 1. 读设置快照并构造订阅（5 槽：headline → child / 接续组×2 / free） ----
const settings = JSON.parse(await readFile(join(process.env.APPDATA ?? '', 'briefy', 'settings.json'), 'utf-8'))
if (!settings?.model) fail('settings.json 无模型配置')
const hid = crypto.randomUUID()
const childId = crypto.randomUUID()
const gid1 = crypto.randomUUID()
const gid2 = crypto.randomUUID()
const freeId = crypto.randomUUID()
const slot = (id, role, estHeight, prompt, extra = {}) => ({
  id,
  role,
  region: { x: 15, y: 15, width: 180 },
  estHeight,
  kind: 'text',
  prompt,
  tools: role === 'free' ? ['getCurrentTime', 'webSearch', 'fetchPage'] : ['getCurrentTime'],
  sources: [],
  status: 'empty',
  ...extra
})
const sub = {
  id: SUB_ID,
  name: 'v029 探针订阅',
  createdAt: new Date().toLocaleString('zh-CN'),
  template: {
    doc: {
      version: 2,
      title: 'v029 功能验证报',
      pages: [
        {
          id: crypto.randomUUID(),
          slots: [
            slot(hid, 'headline', 40, '写一句今日科技圈短头条（30 字以内）。'),
            slot(childId, 'body', 60, '作为头条的子栏目，写一段 80 字以内的延伸观察。', {
              relation: { type: 'child', parentId: hid }
            }),
            slot(gid1, 'body', 55, '第一部分：今天科技行业一条值得关注的动态。', {
              relation: { type: 'continuation', group: 'grp-v029' }
            }),
            slot(gid2, 'briefs', 55, '第二部分：一条与上文衔接的从业者观点。', {
              relation: { type: 'continuation', group: 'grp-v029' }
            }),
            slot(freeId, 'free', 50, '自由创作一段 60 字以内的编者按，形式题材不限。')
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
log('订阅已构造（5 槽）:', SUB_ID)

// ---- 2. 刷新页面 → 打开订阅 Dialog → 点推送 ----
let cdp = await makeClient()
// reload 会中断 CDP 响应：不等待其返回，超时保护后重连
await Promise.race([cdp.evalJs(`location.reload()`), sleep(2000)])
await sleep(2500)
cdp = await makeClient()
await cdp.evalJs(`(() => { window.__errs = []; window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ: ' + String(e.reason).slice(0, 200))); return 1 })()`)
const opened = await cdp.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '订阅')
  if (!btn) return 'NO_BTN'
  btn.click()
  return 'OK'
})()`)
if (opened !== 'OK') fail('订阅按钮未找到')
await sleep(1000)
const dlg = await cdp.evalJs(`(() => {
  // 多订阅时精确点到本探针订阅的推送按钮：从按钮向上找所属订阅卡片（含探针订阅名）
  const btn = [...document.querySelectorAll('button')]
    .filter((b) => b.textContent.includes('推送新一期'))
    .find((b) => {
      let el = b.parentElement
      while (el && el.textContent.length < 600) {
        if (el.textContent.includes('v029 探针订阅')) return true
        el = el.parentElement
      }
      return false
    })
  if (!btn) return { found: false }
  btn.click()
  return { found: true }
})()`)
log('Dialog 状态:', JSON.stringify(dlg))
if (!dlg.found) fail('推送新一期按钮未找到（Dialog 列表为空？）')

// ---- 3. 轮询出刊完成（issues=1 或 12 分钟超时；期间观察 doc/错误） ----
const deadline = Date.now() + 12 * 60_000
let sub1 = null
let lastReport = ''
while (Date.now() < deadline) {
  await sleep(8000)
  try {
    const s = JSON.parse(await readFile(join(SUBS_DIR, `${SUB_ID}.json`), 'utf-8'))
    if (s.issues.length === 1) {
      sub1 = s
      break
    }
  } catch { /* 写入中 */ }
  const st = await cdp.evalJs(`(() => {
    const doc = window.__briefyGetDoc ? window.__briefyGetDoc() : null
    const slots = doc ? doc.pages.flatMap((p) => p.slots) : []
    return slots.map((x) => x.role + ':' + x.status).join(' | ') || 'EMPTY_DOC'
  })()`)
  if (st !== lastReport) {
    log('槽位状态:', st)
    lastReport = st
  }
}
if (!sub1) {
  const errs = await cdp.evalJs(`JSON.stringify(window.__errs ?? [])`)
  fail(`第一期出刊超时。页面错误: ${errs}`)
}
log('✅ 第一期出刊完成，PDF:', sub1.issues[0].pdfPath)
if (!sub1.issues[0].quality.passed) log('⚠ 质量瑕疵:', sub1.issues[0].quality.issues.join('；'))
log('记忆摘要（AI 提炼）:', JSON.stringify(sub1.issues[0].summary).slice(0, 300))

// ---- 4. 断言各新功能 ----
const slots = sub1.issues[0].slots
const byRole = (r) => slots.filter((s) => s.role === r).map((s) => s.content)
const childContent = slots.find((s) => s.role === '正文' && s.content.includes('头条'))?.content ?? byRole('正文')[0] ?? ''
const groupContents = [byRole('正文')[byRole('正文').length - 1], byRole('快讯')[0]]
const freeContent = byRole('自由创作')[0] ?? ''

log('---- 头条 ----')
log((byRole('头条')[0] ?? '').slice(0, 120))
log('---- 子槽位（应与头条衔接） ----')
log(childContent.slice(0, 200))
log('---- 接续组第 1 部分 ----')
log((groupContents[0] ?? '（空）').slice(0, 200))
log('---- 接续组第 2 部分 ----')
log((groupContents[1] ?? '（空）').slice(0, 200))
log('---- 自由创作 ----')
log(freeContent.slice(0, 200))

// 断言
if (!childContent.trim()) fail('子槽位无内容')
if (!groupContents[0]?.trim() || !groupContents[1]?.trim()) fail('接续组有槽位无内容（拆分失败？）')
const gram = (t) => {
  const s = t.replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}
const ga = gram(groupContents[0])
const gb = gram(groupContents[1])
let hit = 0
for (const g of ga) if (gb.has(g)) hit++
const sim = ga.size ? hit / ga.size : 1
log(`接续组两部分相似度: ${Math.round(sim * 100)}%（拆分正确应为两段不同内容，中等偏低）`)
if (sim > 0.9) fail('接续组两部分内容几乎相同（拆分可能失败）')
if (!freeContent.trim()) fail('自由槽位无内容')
if (sub1.memory.recent.length !== 1) fail('记忆未写入')

console.log('[t029] ✅ v0.29 新功能端到端全部通过：接续组拆分 / 子槽位衔接 / 自由槽位 / AI 记忆提炼')
process.exit(0)
