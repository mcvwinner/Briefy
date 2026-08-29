/**
 * 手动布局探针（dev 专用）：CDP 连接渲染进程，
 * 验证：模式切换按钮 → 槽位绝对定位 → 拖拽回调注册 → 切回自动。
 * 前置：npm run dev 已运行（9222 CDP）
 */
import { setTimeout as sleep } from 'node:timers/promises'

const log = (...a) => console.log('[probe]', ...a)
const fail = (msg) => {
  console.error('[probe] FAIL:', msg)
  process.exit(1)
}

async function connect() {
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
  return { evalJs }
}

const cdp = await connect()

// ---- 0. 加载测试文档（有槽位） ----
log('加载测试文档…')
await cdp.evalJs(`location.href = 'http://localhost:5173/?autodoc=' + encodeURIComponent('C:\\\\Users\\\\sr291\\\\Desktop\\\\test_data\\\\每日报刊.briefy')`)
await sleep(2500)
const cdp2 = await connect() // 导航后重连
await cdp2.evalJs(`location.reload()`)
await sleep(2500)
const cdp3 = await connect()
const slotCount = await cdp3.evalJs(`document.querySelectorAll('[data-slot-id]').length`)
log('槽位数:', slotCount)
if (!slotCount) fail('文档未加载出槽位')
const c = cdp3

// ---- 1. 找到布局模式按钮并切手动 ----
const clicked = await c.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('自动排布'))
  if (!btn) return false
  btn.click()
  return true
})()`)
if (!clicked) fail('未找到「自动排布」按钮')
await sleep(400)

// ---- 2. 验证槽位变为绝对定位 ----
const manualInfo = await c.evalJs(`(() => {
  const wrap = document.querySelector('[data-slot-id]')?.parentElement
  if (!wrap) return null
  const st = getComputedStyle(wrap)
  const badge = [...document.querySelectorAll('button')].some((b) => b.textContent.includes('手动布局'))
  return { position: st.position, hasLeft: st.left !== 'auto', buttonLabel: badge }
})()`)
if (!manualInfo) fail('未找到槽位元素')
log('手动模式槽位样式:', JSON.stringify(manualInfo))
if (manualInfo.position !== 'absolute' || !manualInfo.buttonLabel) fail('手动模式未生效（槽位未绝对定位或按钮未切换）')

// ---- 3. 模拟一次拖拽（pointer 事件序列）→ 位置应变化 ----
const before = await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id]')
  return { id: el.dataset.slotId, left: el.parentElement.style.left, top: el.parentElement.style.top }
})()`)
log('拖拽前位置:', JSON.stringify(before))
const dragged = await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id]')
  const wrap = el.parentElement
  const r = wrap.getBoundingClientRect()
  const opts = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0 })
  wrap.dispatchEvent(new PointerEvent('pointerdown', opts(r.x + 20, r.y + 10)))
  wrap.dispatchEvent(new PointerEvent('pointermove', opts(r.x + 80, r.y + 60)))
  wrap.dispatchEvent(new PointerEvent('pointerup', opts(r.x + 80, r.y + 60)))
  return true
})()`)
await sleep(500)
const after = await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id]')
  if (!el) return null
  return { left: el.parentElement.style.left, top: el.parentElement.style.top }
})()`)
log('拖拽后位置:', JSON.stringify(after))
if (!dragged || !after || after.left === before.left) fail('拖拽后位置未变化')

// ---- 3.5 拖角缩放：选中槽位 → 拖右下角手柄 → 尺寸应变化 ----
await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id]')
  const r = el.getBoundingClientRect()
  const opts = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 8, pointerType: 'mouse', isPrimary: true, button: 0 })
  el.dispatchEvent(new PointerEvent('pointerdown', opts(r.x + 10, r.y + 5)))
  el.dispatchEvent(new PointerEvent('pointerup', opts(r.x + 10, r.y + 5)))
  return true
})()`)
await sleep(300)
const sizeBefore = await c.evalJs(`(() => {
  const handle = document.querySelector('[data-slot-id] [class*=resizeHandle], [data-slot-id] span[style*="nwse"]')
  const el = document.querySelector('[data-slot-id]')
  const handleAlt = el ? [...el.querySelectorAll('span')].find((s) => getComputedStyle(s).cursor === 'nwse-resize') : null
  const h = handle || handleAlt
  if (!h) return null
  const r = h.getBoundingClientRect()
  const opts = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0 })
  const wrap = el.parentElement
  h.dispatchEvent(new PointerEvent('pointerdown', opts(r.x, r.y)))
  wrap.dispatchEvent(new PointerEvent('pointermove', opts(r.x + 60, r.y + 40)))
  wrap.dispatchEvent(new PointerEvent('pointerup', opts(r.x + 60, r.y + 40)))
  return { w: wrap.style.width, h: wrap.style.height }
})()`)
if (!sizeBefore) fail('未找到缩放手柄（槽位未选中或手柄未渲染）')
await sleep(400)
const sizeAfter = await c.evalJs(`(() => {
  const wrap = document.querySelector('[data-slot-id]').parentElement
  return { w: wrap.style.width, h: wrap.style.height }
})()`)
log('缩放前:', JSON.stringify(sizeBefore), '→ 缩放后:', JSON.stringify(sizeAfter))
if (sizeAfter.w === sizeBefore.w && sizeAfter.h === sizeBefore.h) fail('拖角缩放后尺寸未变化')

// ---- 3.8 跨页：拖出页底 → 提示条出现 + 松手掉到下一页 ----
const opts = (x, y, id = 11) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'mouse', isPrimary: true, button: 0 })
const slotIdBefore = await c.evalJs(`document.querySelector('[data-slot-id]').dataset.slotId`)
const dragSeq = `(() => {
  const el = document.querySelector('[data-slot-id]')
  const wrap = el.parentElement
  const r = wrap.getBoundingClientRect()
  const opts = (x, y, id) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'mouse', isPrimary: true, button: 0 })
  wrap.dispatchEvent(new PointerEvent('pointerdown', opts(r.x + 20, r.y + 10, 11)))
  return r
})()`
// 第一步：down + 大幅下移 → 应出现"下一页"提示
await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id]')
  const wrap = el.parentElement
  const r = wrap.getBoundingClientRect()
  const opts = (x, y, id) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'mouse', isPrimary: true, button: 0 })
  wrap.dispatchEvent(new PointerEvent('pointerdown', opts(r.x + 20, r.y + 10, 11)))
  wrap.dispatchEvent(new PointerEvent('pointermove', opts(r.x + 20, r.y + 900, 11)))
  return true
})()`)
await sleep(300)
const hintNext = await c.evalJs(`(() => {
  const hint = document.querySelector('.cross-hint')
  return { hint: Boolean(hint), text: hint?.textContent ?? '' }
})()`)
log('拖出页底提示:', JSON.stringify(hintNext))
if (!hintNext.hint || !hintNext.text.includes('下一页')) fail('拖出页底未显示「下一页」提示')
await c.evalJs(`(() => {
  const wrap = document.querySelector('[data-slot-id]').parentElement
  wrap.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 0, clientY: 0, pointerId: 11, pointerType: 'mouse', isPrimary: true, button: 0 }))
  return true
})()`)
await sleep(500)
const afterNext = await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id="${slotIdBefore}"]')
  return { sameSlot: Boolean(el), top: el?.parentElement.style.top ?? null }
})()`)
log('跨下一页后槽位 top:', JSON.stringify(afterNext))
if (!afterNext.sameSlot || afterNext.top !== '15mm') fail('拖出页底未掉到下一页顶部')

// ---- 3.9 跨页：拖出页顶 → 提示 + 松手回到上一页底部 ----
await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id="${slotIdBefore}"]')
  const wrap = el.parentElement
  const r = wrap.getBoundingClientRect()
  const opts = (x, y, id) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'mouse', isPrimary: true, button: 0 })
  wrap.dispatchEvent(new PointerEvent('pointerdown', opts(r.x + 20, r.y + 30, 12)))
  wrap.dispatchEvent(new PointerEvent('pointermove', opts(r.x + 20, r.y - 900, 12)))
  return true
})()`)
await sleep(300)
const hintPrev = await c.evalJs(`(() => {
  const hint = document.querySelector('.cross-hint')
  return { hint: Boolean(hint), text: hint?.textContent ?? '' }
})()`)
log('拖出页顶提示:', JSON.stringify(hintPrev))
if (!hintPrev.hint || !hintPrev.text.includes('上一页')) fail('拖出页顶未显示「上一页」提示')
await c.evalJs(`(() => {
  const wrap = document.querySelector('[data-slot-id="${slotIdBefore}"]').parentElement
  wrap.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 0, clientY: 0, pointerId: 12, pointerType: 'mouse', isPrimary: true, button: 0 }))
  return true
})()`)
await sleep(500)
const afterPrev = await c.evalJs(`(() => {
  const el = document.querySelector('[data-slot-id="${slotIdBefore}"]')
  return { sameSlot: Boolean(el), top: el?.parentElement.style.top ?? null }
})()`)
log('跨回上一页后槽位 top:', JSON.stringify(afterPrev))
if (!afterPrev.sameSlot || afterPrev.top === '15mm') fail('拖出页顶未回到上一页（落点应贴底部而非顶部）')

// ---- 3.10 页面排序：切到第 2 页 → 点「前移」→ 页签顺序交换 ----
const tabsBefore = await c.evalJs(`[...document.querySelectorAll('button')].filter((b) => /第 \\d+ 页/.test(b.textContent)).map((b) => b.textContent.match(/第 \\d+ 页/)[0])`)
await c.evalJs(`(() => {
  const tabs = [...document.querySelectorAll('button')].filter((b) => /第 \\d+ 页/.test(b.textContent))
  tabs[1].click()
  return true
})()`)
await sleep(300)
const moved = await c.evalJs(`(() => {
  const btn = document.querySelector('[aria-label*="前移"]')
  if (!btn) return 'no-btn'
  window.__activeTabBefore = btn.closest('button').textContent.match(/第 \\d+ 页/)[0]
  btn.click()
  return 'clicked'
})()`)
await sleep(400)
const tabsAfter = await c.evalJs(`(() => {
  const btn = document.querySelector('[aria-label*="前移"]')
  const activeLabel = btn ? btn.closest('button').textContent.match(/第 \\d+ 页/)[0] : null
  const tabs = [...document.querySelectorAll('button')].filter((b) => /第 \\d+ 页/.test(b.textContent)).map((b) => b.textContent.match(/第 \\d+ 页/)[0])
  return { activeLabel, tabs }
})()`)
log('moved:', moved, '排序前激活页签:', moved === 'clicked' ? '见后' : moved, '→ 排序后:', JSON.stringify(tabsAfter))
// 排序生效的标志：原第 2 页（排序前激活页签）移动到位置 0（显示为「第 1 页」）
if (moved !== 'clicked' || tabsAfter.activeLabel !== '第 1 页') fail('页面排序未生效')

// ---- 4. 切回自动排布 ----
const back = await c.evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('手动布局'))
  if (!btn) return false
  btn.click()
  return true
})()`)
await sleep(400)
const autoPos = await c.evalJs(`(() => {
  const wrap = document.querySelector('[data-slot-id]')?.parentElement
  return wrap ? getComputedStyle(wrap).position : null
})()`)
log('切回自动后槽位定位:', autoPos)
if (back === false || autoPos === 'absolute') fail('切回自动排布未生效')

console.log('[probe] ✅ 手动布局探针全部通过')
process.exit(0)
