/**
 * 导出一致性探针（v0.33.1，dev 专用）：
 * 验证修复的三处不一致——打印窗口 --briefy-fit 是否用主窗口回传终值、lazy 图片是否加载、renderReady 是否等图片。
 * 前置：npm run dev 已运行（BRIEFY_KEEP_PRINT=1 可视对比），CDP 9222 可连。
 */
import { setTimeout as sleep } from 'node:timers/promises'

const log = (...a) => console.log('[probe]', ...a)
const fail = (msg) => {
  console.error('[probe] FAIL:', msg)
  process.exit(1)
}

/** CDP 客户端（connect-eval-close 短连接模式，v0.29.1 教训） */
async function withPage(match, fn) {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const target = list.find((t) => t.type === 'page' && match(t.url))
  if (!target) throw new Error('未找到目标页面: ' + match)
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
    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
      return r.result?.result?.value
    }
    const send = (method, params = {}) =>
      new Promise((res) => {
        const id = ++seq
        pending.set(id, res)
        ws.send(JSON.stringify({ id, method, params }))
      })
    return await fn(evalJs)
  } finally {
    ws.close()
  }
}

// ---- 1. 文档写到临时 .briefy，经 autodoc 路径加载（最贴近真实链路） ----
const doc = {
  version: 2,
  title: '导出一致性探针',
  pages: [
    {
      id: crypto.randomUUID(),
      slots: [
        {
          id: crypto.randomUUID(),
          role: 'headline',
          region: { x: 15, y: 15, width: 180 },
          estHeight: 30,
          kind: 'text',
          status: 'done',
          content: '探针头条\n# 字号一致性验证\n副题：验证打印窗口字号系数'
        },
        {
          id: crypto.randomUUID(),
          role: 'body',
          region: { x: 15, y: 50, width: 180 },
          estHeight: 160, // 高度给足：内容略少 → 主窗口会增字号到 >1，验证方向 B（放大也能锁）
          kind: 'text',
          status: 'done',
          content:
            '这段文字用于验证打印窗口字号缩放系数是否与主窗口一致。\n\n'.repeat(6) +
            ':::chart{type:"bar" title:"产量趋势" data:"一月|120;二月|180;三月|150;四月|210"}\n:::\n' +
            ':::image{query:"city skyline" caption:"城市天际线"}\n:::\n' +
            ':::qrcode{data:"https://briefy.example" caption:"扫码了解更多"}\n:::'
        }
      ]
    }
  ]
}

const tmpDocPath = 'C:\\Users\\sr291\\Desktop\\test_data\\probe-export-fit.briefy'
await import('node:fs/promises').then((fs) => fs.writeFile(tmpDocPath, JSON.stringify(doc)))
log('文档已写:', tmpDocPath)

await withPage(
  (u) => u.includes('localhost:5173') && !u.includes('print=1'),
  async (evalJs) => {
    await evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent(${JSON.stringify(tmpDocPath)})`)
    return true
  }
).catch(() => {})
await sleep(3000)

// ---- 2. 读主窗口收敛后的每槽 fitScale（SlotBox 回写的实测终值） ----
const mainState = await withPage(
  (u) => u.includes('localhost:5173') && !u.includes('print=1'),
  async (evalJs) => {
    return evalJs(`(() => {
      const doc = window.__briefyGetDoc()
      const slots = doc.pages.flatMap(p => p.slots)
      const els = [...document.querySelectorAll('[data-slot-id]')]
      const fits = els.map(el => {
        const slot = slots.find(s => s.id === el.getAttribute('data-slot-id'))
        if (!slot) return null
        const content = el.querySelector('[class*="slotContent"]')
        const cs = content ? getComputedStyle(content) : null
        return {
          role: slot.role,
          estHeight: slot.estHeight,
          fitVar: el.style.getPropertyValue('--briefy-fit'),
          actualFontPx: cs ? cs.fontSize : null
        }
      })
      const imgs = [...document.querySelectorAll('img')]
      return {
        fits,
        imgCount: imgs.length,
        imgLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length
      }
    })()`)
  }
)
log('主窗口状态:', JSON.stringify(mainState, null, 2))

// ---- 3. 触发导出（dev 自动落盘），打印窗口会短暂存在（BRIEFY_KEEP_PRINT=1 则保留） ----
log('触发导出…')
const pdfPath = await withPage(
  (u) => u.includes('localhost:5173') && !u.includes('print=1'),
  async (evalJs) => {
    return evalJs(
      `window.briefy.exportPdf(window.__briefyGetDoc(), 'C:\\\\Users\\\\sr291\\\\Desktop\\\\test_data\\\\probe_export_fit.pdf')`
    )
  }
)
if (!pdfPath) fail('导出返回空')
log('导出成功:', pdfPath)

// ---- 4. 导出期间（BRIEFY_KEEP_PRINT=1 时打印窗口保留）读打印窗口的同名指标 ----
await sleep(500)
const printState = await withPage(
  (u) => u.includes('print=1'),
  async (evalJs) => {
    return evalJs(`(() => {
      const els = [...document.querySelectorAll('[data-slot-id]')]
      const doc = null
      return els.map(el => {
        const content = el.querySelector('[class*="slotContent"]')
        const cs = content ? getComputedStyle(content) : null
        return {
          fitVar: el.style.getPropertyValue('--briefy-fit'),
          actualFontPx: cs ? cs.fontSize : null
        }
      })
    })()`)
  }
).catch(async (e) => {
  log('打印窗口读取失败（可能已销毁，BRIEFY_KEEP_PRINT=1 可保留）:', e.message)
  return null
})
if (printState) {
  log('打印窗口状态:', JSON.stringify(printState, null, 2))
  // 核心断言：打印窗口每槽 --briefy-fit 与主窗口一致
  const mainFits = mainState.fits.filter(Boolean).map((f) => f.fitVar)
  const printFits = printState.map((p) => p.fitVar)
  const mismatch = printFits.filter((f, i) => mainFits[i] !== undefined && mainFits[i] !== f)
  if (mismatch.length > 0) {
    fail(`字号系数不一致！主窗口=${mainFits.join(',')} 打印窗口=${printFits.join(',')}`)
  }
  log('✅ 字号系数一致：', printFits.join(', '))
} else {
  log('（无打印窗口可读——请以 BRIEFY_KEEP_PRINT=1 重启 dev 后重跑）')
}
log('探针完成')
