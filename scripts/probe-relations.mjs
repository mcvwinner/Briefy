/** 关联槽位端到端探针 v2（dev 专用）：
 *  每次操作使用独立短 CDP 连接（connect-eval-close，规避长连接失效/多客户端问题）。
 *  场景 A：接续组（2 槽同组）→ 生成 → 两槽均 done 且内容为拆分两段
 *  场景 B：子槽位（headline + child）→ child 生成且非空
 *  前置：npm run dev 已运行（无残留 node 探针进程）。 */
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DOC = join(process.env.APPDATA ?? '', 'briefy', 'probe-relations.briefy')
const log = (...a) => console.log('[rel]', ...a)
const fail = (msg) => {
  console.error('[rel] FAIL:', msg)
  process.exit(1)
}

/** 独立短连接执行一段页面 JS（连上即评，评完即关） */
const evalOnce = async (expression, timeoutMs = 8000) => {
  const l = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = l.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('print=1'))
  if (!page) throw new Error('未找到 Briefy 页面')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const result = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('eval 超时')), timeoutMs)
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id === 1) {
        clearTimeout(timer)
        if (m.result?.exceptionDetails) rej(new Error('页面异常: ' + JSON.stringify(m.result.exceptionDetails).slice(0, 300)))
        else res(m.result?.result?.value)
      }
    }
    ws.onerror = () => {
      clearTimeout(timer)
      rej(new Error('WS 失败'))
    }
  })
  ws.close()
  return result
}

const slot = (id, role, estHeight, prompt, extra = {}) => ({
  id,
  role,
  region: { x: 15, y: 15, width: 180 },
  estHeight,
  kind: 'text',
  prompt,
  tools: ['getCurrentTime'],
  sources: [],
  status: 'empty',
  ...extra
})

const makeDoc = (scene) => {
  const base = { version: 2, title: `关联探针·${scene}`, pages: [{ id: crypto.randomUUID(), slots: [] }] }
  if (scene === 'A') {
    base.pages[0].slots = [
      slot(crypto.randomUUID(), 'body', 55, '第一部分：今天科技行业一条值得关注的动态。', { relation: { type: 'continuation', group: 'grp-probe' } }),
      slot(crypto.randomUUID(), 'briefs', 55, '第二部分：一条与上文衔接的从业者观点。', { relation: { type: 'continuation', group: 'grp-probe' } })
    ]
  } else {
    const hid = crypto.randomUUID()
    base.pages[0].slots = [
      slot(hid, 'headline', 40, '写一句今日科技圈短头条（30 字以内）。'),
      slot(crypto.randomUUID(), 'body', 60, '作为头条的子栏目，写一段 80 字以内的延伸观察。', { relation: { type: 'child', parentId: hid } })
    ]
  }
  return base
}

const runScene = async (scene) => {
  log(`===== 场景 ${scene} =====`)
  await writeFile(DOC, JSON.stringify(makeDoc(scene), null, 2), 'utf-8')
  // 加载文档（导航后短连接会话失效，等待后重连）
  await Promise.race([evalOnce(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(DOC)})`), sleep(2000)]).catch(() => {})
  await sleep(3000)
  await Promise.race([evalOnce(`location.reload()`), sleep(2000)]).catch(() => {})
  await sleep(3000)
  const slotsBefore = await evalOnce(`window.__briefyGetDoc().pages.flatMap(p=>p.slots).map(s=>s.role).join(',')`)
  log('文档已加载，槽位:', slotsBefore)
  if (!slotsBefore) fail('文档未加载')

  const clicked = await evalOnce(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '生成')
    if (!btn) return 'NO_BTN'
    btn.click()
    return 'OK'
  })()`)
  if (clicked !== 'OK') fail('未找到生成按钮')
  log('已点击生成…')

  // 轮询（每次状态查询独立连接）
  const deadline = Date.now() + 6 * 60_000
  let last = ''
  while (Date.now() < deadline) {
    await sleep(6000)
    const st = await evalOnce(`(() => {
      const doc = window.__briefyGetDoc()
      const slots = doc.pages.flatMap((p) => p.slots)
      return slots.map((x) => x.role + ':' + x.status).join(' | ')
    })()`)
    if (st !== last) {
      log('状态:', st)
      last = st
    }
    const parts = st.split(' | ')
    if (parts.length > 0 && parts.every((x) => x.includes(':done') || x.includes(':error'))) {
      return await evalOnce(`window.__briefyGetDoc().pages.flatMap((p) => p.slots).map((s) => s.role + '\\n' + (s.content || '(空)') + '\\n[' + s.status + ']').join('\\n=====\\n')`)
    }
  }
  return 'TIMEOUT（6 分钟未完成）'
}

for (const scene of ['A', 'B']) {
  const result = await runScene(scene)
  log(`---- 场景 ${scene} 结果 ----`)
  log(result)
  if (result.includes('TIMEOUT')) fail(`场景 ${scene} 卡死/超时`)
  if (result.includes('[:empty]') || result.includes('[error]')) fail(`场景 ${scene} 存在空/错误槽位`)
  log(`✅ 场景 ${scene} 通过`)
}
console.log('[rel] ✅ 关联槽位端到端全部通过')
process.exit(0)
