/**
 * 打印几何验证探针（v0.34.2，dev 专用）：
 * 验证 body margin 8px 修复——打印窗口 body margin=0、纸面无偏移、sheet 底边不超纸张；
 * 并解析导出 PDF 的 MediaBox 验证物理尺寸是标准 A4（595×842pt）。
 * 前置：npm run dev 已运行（BRIEFY_KEEP_PRINT=1），CDP 9222 可连。
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFile, readFile } from 'node:fs/promises'

const log = (...a) => console.log('[probe]', ...a)
const fail = (msg) => {
  console.error('[probe] FAIL:', msg)
  process.exit(1)
}

/** CDP 短连接 */
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
const DOC_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\probe-print-geo.briefy'
const PDF_PATH = 'C:\\Users\\sr291\\Desktop\\test_data\\probe_print_geo.pdf'
const MM_TO_PX = 96 / 25.4 // 3.7795

// ---- 两页文档：每页底部都放一个内容较满的槽位（复现"最后一页底侧截断"场景） ----
const filler = '这段文字用于验证打印几何：底部边距内内容应完整不被截断。'.repeat(12)
const doc = {
  version: 2,
  title: '打印几何探针',
  pages: [
    {
      id: crypto.randomUUID(),
      slots: [
        { id: crypto.randomUUID(), role: 'headline', region: { x: 15, y: 15, width: 180 }, estHeight: 30, kind: 'text', status: 'done', prompt: '', sources: [], content: '第一页头条\n# 打印几何验证\n副题：验证底部不再截断' },
        { id: crypto.randomUUID(), role: 'body', region: { x: 15, y: 50, width: 180 }, estHeight: 232, kind: 'text', status: 'done', prompt: '', sources: [], content: filler }
      ]
    },
    {
      id: crypto.randomUUID(),
      slots: [
        { id: crypto.randomUUID(), role: 'body', region: { x: 15, y: 15, width: 180 }, estHeight: 232, kind: 'text', status: 'done', prompt: '', sources: [], content: filler + '\n\n末页底部内容——修复后这一行必须完整出现在 PDF 中。' }
      ]
    }
  ]
}
await writeFile(DOC_PATH, JSON.stringify(doc))
log('测试文档已写:', DOC_PATH)

// ---- 主窗口加载文档 ----
await withPage(MAIN, async (evalJs) => {
  await evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(DOC_PATH)})`)
})
await sleep(3000)

// ---- 主窗口测量：body margin 与每页末槽底边（sheet 是 Griffel 哈希类名，用槽位聚合测量） ----
const mainGeo = await withPage(MAIN, async (evalJs) => {
  await sleep(800) // 等字号收敛
  return evalJs(`(() => {
    const slots = [...document.querySelectorAll('[data-slot-id]')]
    const mm = (px) => px / ${MM_TO_PX}
    return {
      bodyMargin: getComputedStyle(document.body).margin,
      slotBottoms_mm: slots.map((s) => {
        const r = s.getBoundingClientRect()
        return { id: s.getAttribute('data-slot-id').slice(0, 8), bottom: +mm(r.bottom).toFixed(1) }
      })
    }
  })()`)
})
log('主窗口几何:', JSON.stringify(mainGeo))

// ---- 触发导出 ----
const pdfPath = await withPage(MAIN, async (evalJs) => {
  return evalJs(`window.briefy.exportPdf(window.__briefyGetDoc(), ${JSON.stringify(PDF_PATH)})`)
})
if (!pdfPath) fail('导出失败')
log('导出成功:', pdfPath)

// ---- 打印窗口几何（BRIEFY_KEEP_PRINT=1 保留） ----
await sleep(600)
let printGeo = null
try {
  printGeo = await withPage((u) => u.includes('print=1'), async (evalJs) => {
    return evalJs(`(() => {
      // sheet = .print-page 的直接子 div（Griffel 哈希类名不含语义，不能用 [class*="sheet"]）
      const view = document.querySelector('.print-view')
      const sheets = view ? [...view.children] : []
      const mm = (px) => px / ${MM_TO_PX}
      const s0 = sheets[0]?.getBoundingClientRect()
      // 每页末槽底边相对本页 sheet 顶边的距离（应 ≤ 282mm 下边距线）
      const lastSlotBottoms = sheets.map((sheet) => {
        const st = sheet.getBoundingClientRect()
        const slots = [...sheet.querySelectorAll('[data-slot-id]')]
        if (slots.length === 0) return null
        const sb = slots[slots.length - 1].getBoundingClientRect()
        return +(mm(sb.bottom - st.top)).toFixed(1)
      })
      return {
        bodyMargin: getComputedStyle(document.body).margin,
        sheetLeft_mm: s0 ? +mm(s0.left).toFixed(2) : null,
        sheetTop_mm: s0 ? +mm(s0.top).toFixed(2) : null,
        sheetW_mm: s0 ? +mm(s0.width).toFixed(2) : null,
        sheetH_mm: s0 ? +mm(s0.height).toFixed(2) : null,
        sheetCount: sheets.length,
        lastSlotBottoms
      }
    })()`)
  })
} catch (e) {
  log('打印窗口读取失败（需 BRIEFY_KEEP_PRINT=1 重启 dev）:', e.message)
}
if (printGeo) {
  log('打印窗口几何:', JSON.stringify(printGeo))
  // 断言
  if (printGeo.bodyMargin.replace(/\s/g, '') !== '0px') fail(`body margin 未清零：${printGeo.bodyMargin}`)
  if (Math.abs(printGeo.sheetLeft_mm) > 0.5) fail(`纸面左偏 ${printGeo.sheetLeft_mm}mm（应为 0）`)
  if (Math.abs(printGeo.sheetTop_mm) > 0.5) fail(`纸面下偏 ${printGeo.sheetTop_mm}mm（应为 0）`)
  if (Math.abs(printGeo.sheetW_mm - 210) > 0.5) fail(`sheet 宽 ${printGeo.sheetW_mm}mm ≠ 210mm`)
  if (Math.abs(printGeo.sheetH_mm - 297) > 0.5) fail(`sheet 高 ${printGeo.sheetH_mm}mm ≠ 297mm`)
  const bad = printGeo.lastSlotBottoms.filter((b) => b !== null && b > 282.5)
  if (bad.length > 0) fail(`有页面末槽底边超出下边距线 282mm：${bad.join(', ')}`)
  log('✅ 打印窗口几何断言全部通过（margin=0 / 无偏移 / 底边距安全）')
}

// ---- PDF 物理尺寸：MediaBox 应为 A4（595.28×841.89pt） ----
const pdf = await readFile(pdfPath)
const mboxMatch = pdf.toString('latin1').match(/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)
if (!mboxMatch) fail('PDF 未找到 MediaBox')
const [, x0, y0, x1, y1] = mboxMatch.map(Number)
const wPt = x1 - x0
const hPt = y1 - y0
log(`PDF MediaBox: ${wPt.toFixed(1)}×${hPt.toFixed(1)}pt（A4 = 595.3×841.9pt）`)
if (Math.abs(wPt - 595.28) > 1 || Math.abs(hPt - 841.89) > 1) fail(`PDF 不是标准 A4：${wPt}×${hPt}pt`)
log('✅ PDF 为标准 A4 物理尺寸')
log('探针完成')
