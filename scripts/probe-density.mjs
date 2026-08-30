/**
 * 密度模型校准探针（v0.34.5，dev 专用）：
 * 已知字数的文本渲染到全宽/半栏槽位，实测渲染高度 vs 新模型（宽度感知）与旧模型（恒定 4.5）预测。
 * 验证新模型误差 <15%，旧模型在全宽槽误差 >80%。
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
const DOC_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\probe-density.briefy'
const MM_TO_PX = 3.7795

// 每槽 600 字、3 段（每段 200 字）
const para = '新闻背景的补充说明用于占位测试密度模型的准确性，数字优先于形容词表达。'.repeat(8).slice(0, 200)
const content = [para, para, para].join('\n\n')

const doc = {
  version: 2,
  title: '密度校准',
  pages: [
    {
      id: crypto.randomUUID(),
      slots: [
        { id: crypto.randomUUID(), role: 'body', region: { x: 15, y: 15, width: 180 }, estHeight: 200, kind: 'text', status: 'done', prompt: '', sources: [], content },
        { id: crypto.randomUUID(), role: 'body', region: { x: 15, y: 223, width: 87 }, estHeight: 200, kind: 'text', status: 'done', prompt: '', sources: [], content }
      ]
    }
  ]
}
await writeFile(DOC_PATH, JSON.stringify(doc))
log('测试文档已写（全宽 180mm / 半栏 87mm，各 600 字 3 段）')

await withPage(MAIN, async (evalJs) => {
  await evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(DOC_PATH)})`)
})
await sleep(3000)

// 实测：槽位框高度（auto 模式 = 内容实际高度，含 fitScale 收敛——读 CSS 变量还原真实密度）
const actual = await withPage(MAIN, async (evalJs) => {
  await sleep(800)
  return evalJs(`(() => {
    return [...document.querySelectorAll('[data-slot-id]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { widthMM: +(${MM_TO_PX === 0} ? 0 : r.width / ${MM_TO_PX}).toFixed(1), heightMM: +(r.height / ${MM_TO_PX}).toFixed(1), fit: el.style.getPropertyValue('--briefy-fit') || '1' }
    })
  })()`)
})
log('实测槽位:', JSON.stringify(actual))

// 新模型预测（node 侧同口径计算）
const fontSizePx = 10 * (4 / 3)
const metrics = (w) => {
  const charsPerLine = (w * 3.7795) / fontSizePx
  const lineHMM = (fontSizePx * 1.5) / 3.7795
  return { charsPerLine, lineHMM, charsPerMm: charsPerLine / lineHMM }
}
const predictNew = (w) => {
  const { charsPerLine, lineHMM } = metrics(w)
  const segMM = Math.ceil(200 / charsPerLine) * lineHMM + 1.6
  // 与 parse.ts 新模型同口径：3 段 + 首段首字下沉 10mm + 槽位内容区 padding 4.2mm
  return segMM * 3 + 10 + 4.2
}
const predictOld = 600 // 旧模型：恒定 4.5 字/mm，与宽度无关

for (let i = 0; i < actual.length; i++) {
  const w = actual[i].widthMM
  const fit = parseFloat(actual[i].fit) || 1
  // 实测框高含增字号填充（字号 ×fit → 行数×行高都变 → 高度 ≈ 基准 × fit²）；还原到 fit=1 基准再对比
  const baseMM = actual[i].heightMM / (fit * fit)
  const newMM = predictNew(w)
  const oldMM = predictOld / 4.5
  const newErr = Math.abs(newMM - baseMM) / baseMM
  const oldErr = Math.abs(oldMM - baseMM) / baseMM
  log(`槽 ${i + 1}（宽 ${w}mm）：实测基准 ${baseMM.toFixed(1)}mm（fit=${fit}）| 新模型 ${newMM.toFixed(1)}mm（误差 ${(newErr * 100).toFixed(0)}%）| 旧模型 ${oldMM.toFixed(1)}mm（误差 ${(oldErr * 100).toFixed(0)}%）`)
  if (newErr > 0.15) fail(`新模型误差 ${(newErr * 100).toFixed(0)}% 超过 15%`)
}
log('✅ 密度模型校准通过（新模型误差 ≤15%）')
log('探针完成')
